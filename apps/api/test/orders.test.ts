import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootApp, ny, userWith } from './harness';
import { apiError, fixtures } from './fixtures';
import { OrdersService } from '../src/orders/orders.service';
import { CutoffService } from '../src/orders/cutoff.service';

let ctx: Awaited<ReturnType<typeof bootApp>>;
let orders: OrdersService;
let cutoff: CutoffService;
let fx: Awaited<ReturnType<typeof fixtures>>;
const admin = userWith('admin');
// Staff who can take orders but has no override power.
const clerk = { ...userWith('kitchen', 'clerk'), permissions: new Set(['orders.read', 'orders.write'] as const) };

beforeAll(async () => {
  ctx = await bootApp();
  orders = ctx.get(OrdersService);
  cutoff = ctx.get(CutoffService);
  fx = await fixtures(ctx.prisma);
});
afterAll(() => ctx.app.close());
// Monday 5 Oct 2026, 10:00 in New York. Kitchen works 7 days, cut-off 2 days at 16:00,
// so a Thursday 8 Oct delivery locks Tuesday 6 Oct 16:00.
beforeEach(() => ctx.clock.set(ny('2026-10-05T10:00:00')));

async function bowlLine() {
  const bowl = await fx.dish('1001'); // Paneer Tikka Rice Bowl
  const protein = bowl.group('Choose your protein');
  const base = bowl.group('Choose your base');
  const spice = bowl.group('Spice level');
  const side = bowl.group('Add a side');
  return {
    dishId: bowl.id,
    quantity: 10,
    combinations: [
      {
        quantity: 6,
        choices: [
          { groupId: protein.id, optionId: protein.option('Paneer'), portionSizeId: protein.portion('Regular') },
          { groupId: base.id, optionId: base.option('Brown rice') },
          { groupId: spice.id, optionId: spice.option('Mild') },
        ],
      },
      {
        quantity: 4,
        choices: [
          { groupId: protein.id, optionId: protein.option('Tofu'), portionSizeId: protein.portion('Large') },
          { groupId: base.id, optionId: base.option('Jeera rice') },
          { groupId: spice.id, optionId: spice.option('Hot') },
          { groupId: side.id, optionId: side.option('Raita') },
        ],
      },
    ],
  };
}

describe('placing an order', () => {
  it('prices each combination on the company tier and snapshots the result', async () => {
    // Northwind is on Enterprise = Standard × 0.92, rounded up to 5 cents.
    const e = await fx.employee({ company: 'Northwind Analytics' });
    const line = await bowlLine();
    const created = await orders.create({ employeeId: e.id, deliveryDate: '2026-10-08', notes: '', lines: [line], place: true }, admin);

    const saved = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: { include: { combinations: { orderBy: { quantity: 'desc' } } } } },
    });
    // Bowl 11.95 → 11.00. Paneer 2.50 → 2.30. Tofu 2.00 → 1.85. Raita 1.25 → 1.15. Large +1.50 (flat).
    // (11.00 + 2.30) × 6 = 79.80 ; (11.00 + 1.85 + 1.50 + 1.15) × 4 = 62.00
    expect(saved.status).toBe('PLACED');
    expect(saved.priceTierName).toBe('Enterprise');
    expect(saved.lines[0].dishPriceCents).toBe(1100);
    expect(saved.lines[0].combinations.map((c) => [c.quantity, c.unitCents, c.totalCents])).toEqual([
      [6, 1330, 7980],
      [4, 1550, 6200],
    ]);
    expect(saved.lines[0].totalCents).toBe(14180);
    expect(saved.totalCents).toBe(14180);

    // Repricing the dish later does not touch the placed order.
    const std = await ctx.prisma.priceTier.findFirstOrThrow({ where: { name: 'Standard' } });
    await ctx.prisma.dishPrice.update({ where: { tierId_dishId: { tierId: std.id, dishId: line.dishId } }, data: { cents: 9999 } });
    const after = await ctx.prisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.totalCents).toBe(14180);
    await ctx.prisma.dishPrice.update({ where: { tierId_dishId: { tierId: std.id, dishId: line.dishId } }, data: { cents: 1195 } });
  });

  it('rejects combinations that do not add up to the line quantity', async () => {
    const e = await fx.employee({ company: 'Northwind Analytics' });
    const line = await bowlLine();
    line.combinations[1].quantity = 3;
    const err = await apiError(orders.create({ employeeId: e.id, deliveryDate: '2026-10-08', notes: '', lines: [line], place: true }, admin));
    expect(err.fieldErrors?.['lines.0.combinations']).toBe('Combination quantities add up to 9, expected 10');
  });

  it('rejects a dish with no price on the employee’s tier', async () => {
    // Kulfi has no Standard price; Bluebird uses the default tier (Standard).
    const e = await fx.employee({ company: 'Bluebird Health' });
    const kulfi = await fx.dish('5004');
    const err = await apiError(
      orders.create({ employeeId: e.id, deliveryDate: '2026-10-08', notes: '', lines: [{ dishId: kulfi.id, quantity: 1, combinations: [{ quantity: 1, choices: [] }] }], place: true }, admin),
    );
    expect(err.fieldErrors?.['lines.0.dishId']).toMatch(/not on this employee’s menu/);
  });

  it('rejects a dish the company has hidden', async () => {
    const e = await fx.employee({ company: 'Bluebird Health' }); // Bluebird hides Gulab Jamun
    const gulab = await fx.dish('5001');
    const err = await apiError(
      orders.create({ employeeId: e.id, deliveryDate: '2026-10-08', notes: '', lines: [{ dishId: gulab.id, quantity: 1, combinations: [{ quantity: 1, choices: [] }] }], place: true }, clerk),
    );
    expect(err.fieldErrors?.['lines.0.dishId']).toBeDefined();
  });

  it('stops an employee without the flag from changing the delivery time, but not an admin', async () => {
    const e = await fx.employee({ company: 'Northwind Analytics', canChangeDeliveryTime: false });
    const input = { employeeId: e.id, deliveryDate: '2026-10-08', deliveryTimeMin: 13 * 60, notes: '', lines: [await bowlLine()], place: true };
    const err = await apiError(orders.create(input, clerk));
    expect(err.fieldErrors?.deliveryTimeMin).toMatch(/company time/);
    await expect(orders.create(input, admin)).resolves.toMatchObject({ deliveryTimeMin: 780 });
  });

  it('rejects a delivery on a company non-working day', async () => {
    const e = await fx.employee({ company: 'Northwind Analytics' }); // Mon-Fri
    const err = await apiError(orders.create({ employeeId: e.id, deliveryDate: '2026-10-10', notes: '', lines: [await bowlLine()], place: true }, admin));
    expect(err.fieldErrors?.deliveryDate).toMatch(/does not take deliveries/);
  });
});

describe('cut-off', () => {
  it('locks editing for staff after the cut-off, but not for admins', async () => {
    const e = await fx.employee({ company: 'Northwind Analytics' });
    const o = await orders.create({ employeeId: e.id, deliveryDate: '2026-10-08', notes: '', lines: [await bowlLine()], place: true }, clerk);
    ctx.clock.set(ny('2026-10-06T16:00:00')); // exactly at cut-off
    const upd = { deliveryDate: '2026-10-08', notes: 'more raita', lines: [await bowlLine()], version: o.version };
    expect((await apiError(orders.update(o.id, upd, clerk))).code).toBe('CUTOFF_PASSED');
    expect((await apiError(orders.cancel(o.id, o.version, '', clerk))).code).toBe('CUTOFF_PASSED');
    await expect(orders.update(o.id, upd, admin)).resolves.toMatchObject({ notes: 'more raita' });
  });

  it('cancels drafts and confirms placed orders, and is safe to run twice or concurrently', async () => {
    const e = await fx.employee({ company: 'Harbor & Pine Legal' });
    const date = '2026-10-09'; // cut-off Wed 7 Oct 16:00
    const draft = await orders.create({ employeeId: e.id, deliveryDate: date, notes: '', lines: [], place: false }, clerk);
    const placed = await orders.create({ employeeId: e.id, deliveryDate: date, notes: '', lines: [await bowlLine()], place: true }, clerk);

    expect((await apiError(cutoff.process(date, 'test'))).code).toBe('CUTOFF_NOT_PASSED');

    ctx.clock.set(ny('2026-10-07T16:01:00'));
    const [a, b] = await Promise.all([cutoff.process(date, 'test'), cutoff.process(date, 'test')]);
    // Between the two concurrent runs each order changed exactly once.
    expect(a.confirmed + b.confirmed).toBe(1);
    expect(a.cancelled + b.cancelled).toBe(1);
    const again = await cutoff.process(date, 'test');
    expect(again).toMatchObject({ confirmed: 0, cancelled: 0 });

    const rows = await ctx.prisma.order.findMany({ where: { id: { in: [draft.id, placed.id] } }, include: { events: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(draft.id)!.status).toBe('CANCELLED');
    expect(byId.get(placed.id)!.status).toBe('CONFIRMED');
    expect(byId.get(placed.id)!.events.filter((ev) => ev.type === 'CONFIRMED')).toHaveLength(1);
  });
});

describe('concurrent edits', () => {
  it('lets the first save win and tells the second to reload', async () => {
    const e = await fx.employee({ company: 'Northwind Analytics' });
    const o = await orders.create({ employeeId: e.id, deliveryDate: '2026-10-08', notes: '', lines: [await bowlLine()], place: true }, clerk);
    const line = await bowlLine();
    const first = orders.update(o.id, { deliveryDate: '2026-10-08', notes: 'A', lines: [line], version: o.version }, clerk);
    const second = orders.update(o.id, { deliveryDate: '2026-10-08', notes: 'B', lines: [line], version: o.version }, clerk);
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.getResponse().code).toBe('STALE');
  });
});
