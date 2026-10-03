import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, ny, userWith } from './harness';
import { apiError, fixtures } from './fixtures';
import { OrdersService } from '../src/orders/orders.service';
import { CutoffService } from '../src/orders/cutoff.service';
import { BillingService } from '../src/billing/billing.service';

let ctx: Awaited<ReturnType<typeof bootApp>>;
let orders: OrdersService;
let billing: BillingService;
let fx: Awaited<ReturnType<typeof fixtures>>;
const admin = userWith('admin');
let companyId: string;
let orderIds: string[];

beforeAll(async () => {
  ctx = await bootApp();
  orders = ctx.get(OrdersService);
  billing = ctx.get(BillingService);
  fx = await fixtures(ctx.prisma);

  // Three confirmed Copperleaf orders for Wed 28 Oct.
  ctx.clock.set(ny('2026-10-22T09:00:00'));
  const company = await ctx.prisma.company.findFirstOrThrow({ where: { name: 'Copperleaf Studios' }, include: { employees: true } });
  companyId = company.id;
  const kheer = await fx.dish('5003');
  const made = [];
  for (const [i, e] of company.employees.slice(0, 3).entries()) {
    made.push(await orders.create({ employeeId: e.id, deliveryDate: '2026-10-28', notes: '', place: true, lines: [{ dishId: kheer.id, quantity: i + 1, combinations: [{ quantity: i + 1, choices: [] }] }] }, admin));
  }
  orderIds = made.map((o) => o.id);
  ctx.clock.set(ny('2026-10-26T16:01:00'));
  await ctx.get(CutoffService).process('2026-10-28', 'test');
});
afterAll(() => ctx.app.close());

describe('invoicing', () => {
  it('invoice total equals the sum of its orders; an order goes on one invoice only, even concurrently', async () => {
    const queued = await billing.queue(companyId);
    const mine = queued.orders.filter((o) => orderIds.includes(o.id));
    expect(mine.map((o) => o.totalCents)).toEqual([475, 950, 1425]); // kheer $4.75 × 1, 2, 3

    const results = await Promise.allSettled([
      billing.create({ companyId, orderIds: orderIds.slice(0, 2), adjustmentIds: [] }, admin),
      billing.create({ companyId, orderIds: orderIds.slice(1, 3), adjustmentIds: [] }, admin),
    ]);
    // Both include order #2, so exactly one invoice can be issued.
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string; totalCents: number }>[];
    expect(ok).toHaveLength(1);
    const invoice = await billing.get(ok[0].value.id);
    expect(invoice.reconciles).toBe(true);
    expect(invoice.totalCents).toBe(invoice.orders.reduce((a, o) => a + o.totalCents, 0));
    // The losing transaction rolled back: no stray invoice, and its other order is still uninvoiced.
    const stillOpen = (await billing.queue(companyId)).orders.filter((o) => orderIds.includes(o.id));
    expect(stillOpen).toHaveLength(1);
  });

  it('cancelling an invoiced order credits the next invoice and leaves the issued one untouched', async () => {
    const invoiced = await ctx.prisma.order.findFirstOrThrow({ where: { id: { in: orderIds }, invoiceId: { not: null } }, include: { invoice: true } });
    const before = invoiced.invoice!.totalCents;
    await orders.cancel(invoiced.id, invoiced.version, 'Office closed', admin);

    const issued = await billing.get(invoiced.invoiceId!);
    expect(issued.totalCents).toBe(before);
    expect(issued.reconciles).toBe(true);

    const q = await billing.queue(companyId);
    const credit = q.adjustments.find((a) => a.orderId === invoiced.id)!;
    expect(credit.amountCents).toBe(-invoiced.invoicedCents!);

    const open = q.orders.filter((o) => orderIds.includes(o.id));
    const next = await billing.create({ companyId, orderIds: open.map((o) => o.id), adjustmentIds: [credit.id] }, admin);
    expect(next.totalCents).toBe(open.reduce((a, o) => a + o.totalCents, 0) - invoiced.invoicedCents!);
    expect((await billing.get(next.id)).reconciles).toBe(true);
  });

  it('refuses a credit larger than what was billed, and paying twice', async () => {
    const o = await ctx.prisma.order.findFirstOrThrow({ where: { id: { in: orderIds }, status: 'CONFIRMED', invoiceId: { not: null } } });
    const err = await apiError(billing.addAdjustment({ orderId: o.id, amountCents: -(o.totalCents + 5), reason: 'too much' }, admin));
    expect(err.fieldErrors?.amountCents).toBeDefined();
    await billing.markPaid(o.invoiceId!);
    expect((await apiError(billing.markPaid(o.invoiceId!))).code).toBe('ALREADY_PAID');
  });
});
