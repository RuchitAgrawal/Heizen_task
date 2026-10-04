import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  EDITABLE_STATUSES, OrderDraftInput, OrderListQuery, Page, cutoffInstant, plannedTimes, orderOverrideSchema,
} from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { conflict, invalid, notFound } from '../common/errors';
import { fromDbDate, toDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import { can, AuthUser } from '../auth/auth.types';
import { BuiltOrder, OrderBuilder, cutoffPassed, formatAddress } from './order-builder';
import { linkDrop } from './drops';
import { logEvent } from './order-events';

const detailInclude = {
  employee: { select: { id: true, name: true, email: true, canChooseAddress: true, canChangeDeliveryTime: true, canChangePackaging: true } },
  company: { select: { id: true, name: true, deliveryLeadMin: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: { combinations: { orderBy: { quantity: 'desc' }, include: { choices: true } } },
  },
  events: { orderBy: { at: 'asc' } },
  drop: { include: { driver: { select: { id: true, name: true } } } },
  invoice: { select: { id: true, number: true, status: true } },
  adjustments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: OrderBuilder,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  // Writes
  private async writeLines(tx: Tx, orderId: string, built: BuiltOrder) {
    for (const line of built.lines) {
      const { combinations, ...lineData } = line;
      await tx.orderLine.create({
        data: {
          ...lineData,
          orderId,
          combinations: { create: combinations.map(({ choices, ...combo }) => ({ ...combo, orderId, choices: { create: choices } })) },
        },
      });
    }
  }

  private orderData(built: BuiltOrder) {
    const { lines: _l, defaultDriverId: _d, deliveryDate, ...rest } = built;
    return { ...rest, deliveryDate: toDbDate(deliveryDate) };
  }

  async create(input: OrderDraftInput & { place: boolean }, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const built = await this.builder.build(tx, input, user, { requireLines: input.place });
      const dropId = await linkDrop(tx, built, built.defaultDriverId);
      const now = this.clock.now();
      const order = await tx.order.create({
        data: {
          ...this.orderData(built),
          dropId,
          status: input.place ? 'PLACED' : 'DRAFT',
          placedAt: input.place ? now : null,
          createdById: user.id,
        },
      });
      await this.writeLines(tx, order.id, built);
      await logEvent(tx, order.id, input.place ? 'PLACED' : 'DRAFTED', input.place ? 'Order placed' : 'Saved as draft', user);
      return order;
    });
  }

  /** Throws unless the order is still editable by this user right now. */
  private async assertEditable(tx: Tx, order: { status: string; deliveryDate: Date }, user: AuthUser) {
    if (!(EDITABLE_STATUSES as readonly string[]).includes(order.status)) {
      throw conflict('NOT_EDITABLE', `A ${order.status.toLowerCase()} order cannot be edited`);
    }
    const cutoff = cutoffInstant(fromDbDate(order.deliveryDate), await this.settings.cutoffSettings(tx));
    if (this.clock.now() >= cutoff && !can(user, 'orders.override')) throw cutoffPassed();
  }

  /** Bumps the version only if nobody else changed the order since `version`. */
  private async claimVersion(tx: Tx, id: string, version: number, data: Prisma.OrderUncheckedUpdateManyInput = {}) {
    const res = await tx.order.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count === 0) throw conflict('STALE', 'Someone else changed this order. Reload to see their changes.');
  }

  async update(id: string, input: Omit<OrderDraftInput, 'employeeId'> & { version: number; place?: boolean }, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id } });
      if (!existing) throw notFound('Order');
      await this.assertEditable(tx, existing, user);
      const place = input.place || existing.status === 'PLACED';
      const built = await this.builder.build(tx, { ...input, employeeId: existing.employeeId }, user, { requireLines: place });
      await this.claimVersion(tx, id, input.version);
      await tx.orderLine.deleteMany({ where: { orderId: id } });
      const dropId = await linkDrop(tx, built, built.defaultDriverId);
      const becamePlaced = place && existing.status === 'DRAFT';
      await tx.order.update({
        where: { id },
        data: {
          ...this.orderData(built),
          dropId,
          status: place ? 'PLACED' : 'DRAFT',
          ...(becamePlaced ? { placedAt: this.clock.now() } : {}),
        },
      });
      await this.writeLines(tx, id, built);
      await logEvent(tx, id, becamePlaced ? 'PLACED' : 'EDITED', becamePlaced ? 'Order placed' : 'Order edited', user);
      return tx.order.findUnique({ where: { id } });
    });
  }

  /** Places a draft as saved, re-pricing and re-validating it against today's menu. */
  async place(id: string, version: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { combinations: { include: { choices: true } } } } },
    });
    if (!order) throw notFound('Order');
    if (order.status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Only drafts can be placed');
    return this.update(
      id,
      {
        version,
        place: true,
        deliveryDate: fromDbDate(order.deliveryDate),
        addressId: order.addressId,
        deliveryTimeMin: order.deliveryTimeMin,
        packagingTypeId: order.packagingTypeId,
        notes: order.notes,
        lines: order.lines.map((l) => ({
          dishId: l.dishId,
          quantity: l.quantity,
          combinations: l.combinations.map((c) => ({
            quantity: c.quantity,
            choices: c.choices.map((ch) => ({ groupId: ch.groupId, optionId: ch.optionId, portionSizeId: ch.portionSizeId })),
          })),
        })),
      },
      user,
    );
  }

  /**
   * Draft/placed: anyone with orders.write before cut-off, admins after.
   * Confirmed: admins only. If it is already invoiced, the invoice stays as issued and
   * a credit adjustment for the billed amount goes on the company's next invoice.
   */
  async cancel(id: string, version: number, reason: string, user: AuthUser, as: 'CANCELLED' | 'REJECTED' = 'CANCELLED') {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw notFound('Order');
      if (order.status === 'CONFIRMED') {
        if (!can(user, 'orders.override')) throw conflict('NOT_EDITABLE', 'Only an admin can cancel a confirmed order');
        if (order.outForDeliveryAt) throw conflict('OUT_FOR_DELIVERY', 'The order is already out for delivery');
      } else if (as === 'REJECTED') {
        if (!can(user, 'orders.override')) throw conflict('NOT_EDITABLE', 'Only an admin can reject an order');
        if (order.status !== 'PLACED') throw conflict('NOT_EDITABLE', `A ${order.status.toLowerCase()} order cannot be rejected`);
      } else {
        await this.assertEditable(tx, order, user);
      }
      const now = this.clock.now();
      await this.claimVersion(tx, id, version, as === 'CANCELLED' ? { status: as, cancelledAt: now } : { status: as, rejectedAt: now });
      if (order.invoiceId && order.invoicedCents) {
        await tx.billingAdjustment.create({
          data: {
            orderId: id,
            companyId: order.companyId,
            amountCents: -order.invoicedCents,
            reason: `Order #${order.number} ${as.toLowerCase()} after invoicing`,
            createdById: user.id,
          },
        });
      }
      const verb = as === 'CANCELLED' ? 'cancelled' : 'rejected';
      await logEvent(tx, id, as, reason ? `Order ${verb}: ${reason}` : `Order ${verb}`, user);
      return tx.order.findUnique({ where: { id } });
    });
  }

  /**
   * Admin override of time, address or packaging, including after confirmation.
   * Re-plans kitchen and dispatch times and moves the order to the matching drop.
   * Money does not change, so invoices are unaffected.
   */
  async override(id: string, input: z.infer<typeof orderOverrideSchema>, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { company: { include: { addresses: true } } } });
      if (!order) throw notFound('Order');
      if (['CANCELLED', 'REJECTED', 'DELIVERED'].includes(order.status) || order.outForDeliveryAt) {
        throw conflict('NOT_EDITABLE', 'This order can no longer be changed');
      }
      const changes: string[] = [];
      const data: Prisma.OrderUncheckedUpdateInput = {};
      if (input.addressId && input.addressId !== order.addressId) {
        const a = order.company.addresses.find((x) => x.id === input.addressId && x.active);
        if (!a) throw invalid('Unknown address', { addressId: 'Not one of this company’s addresses' });
        data.addressId = a.id;
        data.addressText = formatAddress(a);
        changes.push(`address → ${a.label}`);
      }
      if (input.packagingTypeId && input.packagingTypeId !== order.packagingTypeId) {
        const p = await tx.packagingType.findUnique({ where: { id: input.packagingTypeId } });
        if (!p) throw invalid('Unknown packaging', { packagingTypeId: 'Unknown packaging' });
        data.packagingTypeId = p.id;
        data.packagingName = p.name;
        changes.push(`packaging → ${p.name}`);
      }
      const timeMin = input.deliveryTimeMin ?? order.deliveryTimeMin;
      if (timeMin !== order.deliveryTimeMin) {
        const s = await this.settings.get(tx);
        Object.assign(data, plannedTimes(fromDbDate(order.deliveryDate), timeMin, s.timeZone, order.company.deliveryLeadMin, s.kitchenBufferMin));
        data.deliveryTimeMin = timeMin;
        changes.push(`time → ${String(Math.floor(timeMin / 60)).padStart(2, '0')}:${String(timeMin % 60).padStart(2, '0')}`);
      }
      if (!changes.length) return order;
      await this.claimVersion(tx, id, input.version);
      // The drop key changed only if address or time did; linkDrop is a no-op otherwise.
      data.dropId = await linkDrop(
        tx,
        { deliveryDate: fromDbDate(order.deliveryDate), companyId: order.companyId, addressId: (data.addressId as string) ?? order.addressId, deliveryTimeMin: timeMin },
        order.company.defaultDriverId,
      );
      await tx.order.update({ where: { id }, data });
      await logEvent(tx, id, 'OVERRIDE', `Admin changed ${changes.join(', ')}`, user);
      return tx.order.findUnique({ where: { id } });
    });
  }

  // Reads
  async list(q: OrderListQuery): Promise<Page<unknown>> {
    const where: Prisma.OrderWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.invoiced === 'yes' ? { invoiceId: { not: null } } : q.invoiced === 'no' ? { invoiceId: null } : {}),
      ...(q.from || q.to
        ? { deliveryDate: { ...(q.from ? { gte: toDbDate(q.from) } : {}), ...(q.to ? { lte: toDbDate(q.to) } : {}) } }
        : {}),
      ...(q.q
        ? {
            OR: [
              ...(/^#?\d+$/.test(q.q) ? [{ number: Number(q.q.replace('#', '')) }] : []),
              { employee: { name: { contains: q.q, mode: 'insensitive' } } },
              { employee: { email: { contains: q.q, mode: 'insensitive' } } },
              { company: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ deliveryDate: 'desc' }, { deliveryTimeMin: 'asc' }, { number: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true, number: true, status: true, deliveryDate: true, deliveryTimeMin: true, totalCents: true,
          kitchenReadyAt: true, outForDeliveryAt: true, deliveredAt: true,
          employee: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          invoice: { select: { id: true, number: true, status: true } },
          _count: { select: { lines: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    const items = rows.map((r) => ({ ...r, deliveryDate: fromDbDate(r.deliveryDate) }));
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw notFound('Order');
    const deliveryDate = fromDbDate(order.deliveryDate);
    const cutoffAt = cutoffInstant(deliveryDate, await this.settings.cutoffSettings());
    const beforeCutoff = this.clock.now() < cutoffAt;
    const editableStatus = (EDITABLE_STATUSES as readonly string[]).includes(order.status);
    const override = can(user, 'orders.override');
    const { drop, ...rest } = order;
    return {
      ...rest,
      deliveryDate,
      cutoffAt,
      drop: drop && { id: drop.id, driver: drop.driver, deliveredAt: drop.deliveredAt, deliveryNote: drop.deliveryNote, onTime: drop.onTime },
      allowed: {
        edit: can(user, 'orders.write') && editableStatus && (beforeCutoff || override),
        cancel: can(user, 'orders.write') && ((editableStatus && (beforeCutoff || override)) || (order.status === 'CONFIRMED' && override && !order.outForDeliveryAt)),
        reject: override && order.status === 'PLACED',
        override: override && !['CANCELLED', 'REJECTED', 'DELIVERED'].includes(order.status) && !order.outForDeliveryAt,
        forceComplete: can(user, 'kitchen.forceComplete') && order.status === 'CONFIRMED' && !order.kitchenReadyAt,
        adjust: can(user, 'billing.write') && order.invoiceId !== null,
      },
    };
  }
}
