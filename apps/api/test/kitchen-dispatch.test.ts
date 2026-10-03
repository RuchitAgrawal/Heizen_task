import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootApp, ny, userWith } from './harness';
import { apiError, fixtures } from './fixtures';
import { OrdersService } from '../src/orders/orders.service';
import { CutoffService } from '../src/orders/cutoff.service';
import { KitchenService } from '../src/kitchen/kitchen.service';
import { DispatchService } from '../src/dispatch/dispatch.service';

let ctx: Awaited<ReturnType<typeof bootApp>>;
let orders: OrdersService;
let cutoff: CutoffService;
let kitchen: KitchenService;
let dispatch: DispatchService;
let fx: Awaited<ReturnType<typeof fixtures>>;
const admin = userWith('admin');
const cook = userWith('kitchen');
const dispatcher = userWith('dispatch');

beforeAll(async () => {
  ctx = await bootApp();
  orders = ctx.get(OrdersService);
  cutoff = ctx.get(CutoffService);
  kitchen = ctx.get(KitchenService);
  dispatch = ctx.get(DispatchService);
  fx = await fixtures(ctx.prisma);
});
afterAll(() => ctx.app.close());

/** A confirmed Kestrel order for Wed 14 Oct with two prep units (two different wraps). */
async function confirmedOrder(date = '2026-10-14') {
  ctx.clock.set(ny('2026-10-09T09:00:00'));
  const e = await fx.employee({ company: 'Kestrel Robotics' });
  const roll = await fx.dish('2002'); // Falafel Wrap: one required group
  const wrap = roll.group('Choose your wrap');
  const o = await orders.create(
    {
      employeeId: e.id, deliveryDate: date, notes: '', place: true,
      lines: [{ dishId: roll.id, quantity: 3, combinations: [
        { quantity: 2, choices: [{ groupId: wrap.id, optionId: wrap.option('Whole wheat wrap') }] },
        { quantity: 1, choices: [{ groupId: wrap.id, optionId: wrap.option('Spinach wrap') }] },
      ] }],
    },
    admin,
  );
  return o;
}

describe('kitchen units', () => {
  it('only confirmed orders can be worked on', async () => {
    const o = await confirmedOrder();
    const [unit] = await ctx.prisma.orderCombination.findMany({ where: { orderId: o.id } });
    expect((await apiError(kitchen.start(unit.id, cook))).code).toBe('NOT_CONFIRMED');
  });

  it('start once, done once, done-without-start records a start, ready only when every unit is done', async () => {
    const o = await confirmedOrder('2026-10-15');
    ctx.clock.set(ny('2026-10-13T16:05:00')); // past the 15th's cut-off
    await cutoff.process('2026-10-15', 'test');
    const [a, b] = await ctx.prisma.orderCombination.findMany({ where: { orderId: o.id }, orderBy: { quantity: 'desc' } });

    await kitchen.start(a.id, cook);
    expect((await apiError(kitchen.start(a.id, cook))).code).toBe('ALREADY_STARTED');

    // Two people press "done" on the same unit at the same moment.
    const both = await Promise.allSettled([kitchen.done(a.id, cook), kitchen.done(a.id, cook)]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    let order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(order.kitchenStartedAt).not.toBeNull();
    expect(order.kitchenReadyAt).toBeNull();

    ctx.clock.set(ny('2026-10-13T16:20:00'));
    const doneB = await kitchen.done(b.id, cook);
    expect(doneB!.startedAt!.toISOString()).toBe(doneB!.doneAt!.toISOString());
    order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(order.kitchenReadyAt!.toISOString()).toBe(ny('2026-10-13T16:20:00').toISOString());
    expect(order.events.filter((e) => e.type === 'KITCHEN_STARTED')).toHaveLength(1);
    expect(order.events.filter((e) => e.type === 'KITCHEN_READY')).toHaveLength(1);
  });

  it('finishing the last two units concurrently marks the order ready exactly once', async () => {
    const o = await confirmedOrder('2026-10-16');
    ctx.clock.set(ny('2026-10-14T16:05:00'));
    await cutoff.process('2026-10-16', 'test');
    const units = await ctx.prisma.orderCombination.findMany({ where: { orderId: o.id } });
    await Promise.all(units.map((u) => kitchen.done(u.id, cook)));
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { events: true } });
    expect(order.kitchenReadyAt).not.toBeNull();
    expect(order.events.filter((e) => e.type === 'KITCHEN_READY')).toHaveLength(1);
  });
});

describe('dispatch and delivery', () => {
  it('enforces the step order, the driver, and driver ownership; records on-time', async () => {
    const o = await confirmedOrder('2026-10-20');
    ctx.clock.set(ny('2026-10-18T16:05:00'));
    await cutoff.process('2026-10-20', 'test');
    const { dropId } = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id } });

    expect((await apiError(dispatch.advance(dropId!, 'DISPATCH_READY', dispatcher))).code).toBe('KITCHEN_NOT_READY');
    await kitchen.forceComplete(o.id, admin);
    expect((await apiError(dispatch.advance(dropId!, 'OUT_FOR_DELIVERY', dispatcher))).code).toBe('NOT_DISPATCH_READY');
    await dispatch.advance(dropId!, 'DISPATCH_READY', dispatcher);
    expect((await apiError(dispatch.advance(dropId!, 'DISPATCH_READY', dispatcher))).code).toBe('ALREADY_DONE');

    await dispatch.assignDriver(dropId!, null, dispatcher);
    expect((await apiError(dispatch.advance(dropId!, 'OUT_FOR_DELIVERY', dispatcher))).code).toBe('NO_DRIVER');
    const dana = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    const marco = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { email: 'marco.driver@fernleaf.kitchen' } });
    await dispatch.assignDriver(dropId!, dana.id, dispatcher);
    await dispatch.advance(dropId!, 'OUT_FOR_DELIVERY', dispatcher);
    expect((await apiError(dispatch.assignDriver(dropId!, marco.id, dispatcher))).code).toBe('OUT_FOR_DELIVERY');

    // Delivery day, 11:50 for an 11:45 slot: inside the 10-minute grace.
    ctx.clock.set(ny('2026-10-20T11:50:00'));
    const marcoUser = { ...userWith('driver', marco.id) };
    const danaUser = { ...userWith('driver', dana.id) };
    expect((await apiError(dispatch.deliver(dropId!, { note: '', photoDataUrl: null }, marcoUser))).code).toBe('FORBIDDEN');
    expect((await dispatch.myDrops(marcoUser)).drops.find((d) => d.id === dropId)).toBeUndefined();
    expect((await dispatch.myDrops(danaUser)).drops.find((d) => d.id === dropId)).toBeDefined();

    const res = await dispatch.deliver(dropId!, { note: 'Left at loading bay', photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, danaUser);
    expect(res.onTime).toBe(true);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(order.status).toBe('DELIVERED');
    expect(order.onTime).toBe(true);
    expect((await apiError(dispatch.deliver(dropId!, { note: '', photoDataUrl: null }, danaUser))).code).toBe('ALREADY_DONE');
  });
});

describe('busy day', () => {
  it('serves a 400-order kitchen board quickly', async () => {
    ctx.clock.set(ny('2026-10-19T09:00:00'));
    const date = '2026-10-23'; // Friday
    const employees = await ctx.prisma.employee.findMany({ where: { company: { workingDays: { has: 5 } } } });
    const lassi = await fx.dish('5003'); // Coconut Kheer, no option groups
    for (let i = 0; i < 400; i++) {
      await orders.create(
        { employeeId: employees[i % employees.length].id, deliveryDate: date, notes: '', place: true, lines: [{ dishId: lassi.id, quantity: 1, combinations: [{ quantity: 1, choices: [] }] }] },
        admin,
      );
    }
    ctx.clock.set(ny('2026-10-21T16:05:00'));
    await cutoff.process(date, 'test');
    const t0 = performance.now();
    const board = await kitchen.board(date);
    const ms = performance.now() - t0;
    expect(board.units).toHaveLength(400);
    expect(ms).toBeLessThan(1000);
    console.log(`kitchen board, 400 orders: ${ms.toFixed(0)} ms`);
  }, 120_000);
});
