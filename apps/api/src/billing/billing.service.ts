import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BILLABLE_STATUSES } from '@fernleaf/shared';
import { PrismaService } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { Notifier } from '../common/notifier';
import { conflict, invalid, notFound } from '../common/errors';
import { fromDbDate } from '../common/dates';
import type { AuthUser } from '../auth/auth.types';
import { logEvent, logEvents } from '../orders/order-events';

/**
 * What a company owes = its confirmed and delivered orders, plus adjustments.
 *
 * Invoices are immutable once issued (only "paid" changes). Each order is claimed by
 * one conditional UPDATE ... WHERE "invoiceId" IS NULL, so two staff invoicing at the
 * same moment cannot put an order on two invoices. Later changes to an invoiced order
 * (cancellation, a short delivery) become BillingAdjustments that go on the next invoice.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  private uninvoicedWhere(companyId?: string): Prisma.OrderWhereInput {
    return { invoiceId: null, status: { in: [...BILLABLE_STATUSES] }, ...(companyId ? { companyId } : {}) };
  }

  /** One row per company with something to bill. */
  async summary() {
    const [orders, adjustments, companies] = await Promise.all([
      this.prisma.order.groupBy({ by: ['companyId'], where: this.uninvoicedWhere(), _count: true, _sum: { totalCents: true }, _min: { deliveryDate: true } }),
      this.prisma.billingAdjustment.groupBy({ by: ['companyId'], where: { invoiceId: null }, _count: true, _sum: { amountCents: true } }),
      this.prisma.company.findMany({ select: { id: true, name: true } }),
    ]);
    const issued = await this.prisma.invoice.groupBy({ by: ['companyId'], where: { status: 'ISSUED' }, _count: true, _sum: { totalCents: true } });
    return companies
      .map((c) => {
        const o = orders.find((x) => x.companyId === c.id);
        const a = adjustments.find((x) => x.companyId === c.id);
        const i = issued.find((x) => x.companyId === c.id);
        return {
          company: c,
          uninvoicedOrders: o?._count ?? 0,
          uninvoicedOrderCents: o?._sum.totalCents ?? 0,
          oldestUninvoiced: o?._min.deliveryDate ? fromDbDate(o._min.deliveryDate) : null,
          pendingAdjustments: a?._count ?? 0,
          pendingAdjustmentCents: a?._sum.amountCents ?? 0,
          unpaidInvoices: i?._count ?? 0,
          unpaidCents: i?._sum.totalCents ?? 0,
        };
      })
      .sort((a, b) => b.uninvoicedOrderCents - a.uninvoicedOrderCents || a.company.name.localeCompare(b.company.name));
  }

  async queue(companyId: string) {
    const [orders, adjustments] = await Promise.all([
      this.prisma.order.findMany({
        where: this.uninvoicedWhere(companyId),
        orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
        select: { id: true, number: true, status: true, deliveryDate: true, totalCents: true, employee: { select: { name: true } } },
      }),
      this.prisma.billingAdjustment.findMany({
        where: { companyId, invoiceId: null },
        orderBy: { createdAt: 'asc' },
        include: { order: { select: { number: true } } },
      }),
    ]);
    return { orders: orders.map((o) => ({ ...o, deliveryDate: fromDbDate(o.deliveryDate) })), adjustments };
  }

  async create(input: { companyId: string; orderIds: string[]; adjustmentIds: string[] }, user: AuthUser) {
    const orderIds = [...new Set(input.orderIds)];
    const adjustmentIds = [...new Set(input.adjustmentIds)];
    const invoice = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.company.findUnique({ where: { id: input.companyId } }))) throw notFound('Company');
      const invoice = await tx.invoice.create({ data: { companyId: input.companyId, totalCents: 0, createdById: user.id, issuedAt: this.clock.now() } });

      const claimed = orderIds.length
        ? await tx.$queryRaw<{ id: string; totalCents: number }[]>`
            UPDATE "Order" SET "invoiceId" = ${invoice.id}, "invoicedCents" = "totalCents"
            WHERE id IN (${Prisma.join(orderIds)})
              AND "companyId" = ${input.companyId}
              AND "invoiceId" IS NULL
              AND status IN ('CONFIRMED', 'DELIVERED')
            RETURNING id, "totalCents"`
        : [];
      if (claimed.length !== orderIds.length) {
        throw conflict('BILLING_CHANGED', 'Some orders were invoiced, cancelled or belong elsewhere. Reload the list and try again.');
      }
      const adj = adjustmentIds.length
        ? await tx.$queryRaw<{ id: string; amountCents: number }[]>`
            UPDATE "BillingAdjustment" SET "invoiceId" = ${invoice.id}
            WHERE id IN (${Prisma.join(adjustmentIds)}) AND "companyId" = ${input.companyId} AND "invoiceId" IS NULL
            RETURNING id, "amountCents"`
        : [];
      if (adj.length !== adjustmentIds.length) {
        throw conflict('BILLING_CHANGED', 'Some adjustments were already invoiced. Reload the list and try again.');
      }

      const totalCents = claimed.reduce((a, o) => a + o.totalCents, 0) + adj.reduce((a, x) => a + x.amountCents, 0);
      await logEvents(tx, claimed.map((o) => o.id), 'INVOICED', `Added to invoice #${invoice.number}`, user);
      return tx.invoice.update({ where: { id: invoice.id }, data: { totalCents }, include: { company: { select: { billingEmail: true } } } });
    });
    this.notifier.send(invoice.company.billingEmail, `Invoice #${invoice.number} issued, total ${(invoice.totalCents / 100).toFixed(2)} USD`);
    return invoice;
  }

  async markPaid(id: string) {
    const res = await this.prisma.invoice.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'PAID', paidAt: this.clock.now() } });
    if (res.count === 0) {
      if (!(await this.prisma.invoice.findUnique({ where: { id } }))) throw notFound('Invoice');
      throw conflict('ALREADY_PAID', 'This invoice is already marked paid');
    }
    return this.prisma.invoice.findUnique({ where: { id } });
  }

  async addAdjustment(input: { orderId: string; amountCents: number; reason: string }, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw notFound('Order');
      if (!(BILLABLE_STATUSES as readonly string[]).includes(order.status) && !order.invoiceId) {
        throw invalid('Only billable orders can be adjusted', { orderId: 'Order is not billable' });
      }
      const billed = (order.invoicedCents ?? order.totalCents) +
        ((await tx.billingAdjustment.aggregate({ where: { orderId: order.id }, _sum: { amountCents: true } }))._sum.amountCents ?? 0);
      if (billed + input.amountCents < 0) {
        throw invalid('A credit cannot exceed what was billed for this order', { amountCents: `At most ${billed} cents can be credited` });
      }
      const adj = await tx.billingAdjustment.create({ data: { ...input, companyId: order.companyId, createdById: user.id } });
      await logEvent(tx, order.id, 'ADJUSTMENT', `Billing adjustment ${input.amountCents >= 0 ? '+' : ''}${(input.amountCents / 100).toFixed(2)}: ${input.reason}`, user);
      return adj;
    });
  }

  async list(params: { page: number; pageSize: number; companyId?: string; status?: 'ISSUED' | 'PAID' }) {
    const where: Prisma.InvoiceWhereInput = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { number: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { company: { select: { id: true, name: true } }, _count: { select: { orders: true, adjustments: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async get(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, billingName: true, billingEmail: true, billingPhone: true } },
        orders: {
          orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
          select: { id: true, number: true, status: true, deliveryDate: true, totalCents: true, invoicedCents: true, employee: { select: { name: true } } },
        },
        adjustments: { include: { order: { select: { number: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!invoice) throw notFound('Invoice');
    const sum = invoice.orders.reduce((a, o) => a + (o.invoicedCents ?? 0), 0) + invoice.adjustments.reduce((a, x) => a + x.amountCents, 0);
    return {
      ...invoice,
      orders: invoice.orders.map((o) => ({ ...o, deliveryDate: fromDbDate(o.deliveryDate) })),
      // Shown on the page: proves the stored total equals the sum of its parts.
      reconciles: sum === invoice.totalCents,
    };
  }
}
