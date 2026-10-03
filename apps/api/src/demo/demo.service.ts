import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  IsoDate, MenuDish, PERMISSIONS, addDays, cutoffInstant, isWorkingDay, todayIn,
} from '@fernleaf/shared';
import { PrismaService } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { fromDbDate, toDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import type { AuthUser } from '../auth/auth.types';
import { Rng, rngFor } from './rng';

/** Orders created here carry this createdById. Nothing here ever touches other orders. */
export const DEMO_ACTOR = 'demo';

const demoUser: AuthUser = {
  id: DEMO_ACTOR,
  email: 'demo@fernleaf.kitchen',
  name: 'Demo data',
  roleId: 'demo',
  roleName: 'Demo',
  permissions: new Set(PERMISSIONS),
};

const MIN = 60_000;

/**
 * Keeps the live demo realistic on whatever day it is opened. See README "Demo data".
 *
 * 1. Fill: every date from 14 days ago to 7 days ahead with no orders gets orders,
 *    created through OrdersService so prices and rules are real.
 * 2. Close out: demo orders on past dates still confirmed are marked delivered.
 * 3. Shape today: once per day, today's demo orders get a realistic mix of kitchen and
 *    dispatch progress, leaving most of the work for whoever is reviewing.
 *
 * Runs on boot and hourly when DEMO_DATA=true. Each step is idempotent.
 */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly log = new Logger('Demo');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly menu: MenuService,
    private readonly orders: OrdersService,
    private readonly clock: Clock,
  ) {}

  private get enabled() {
    return process.env.DEMO_DATA === 'true' && process.env.NODE_ENV !== 'test';
  }

  onApplicationBootstrap() {
    if (this.enabled && process.env.DEMO_SKIP_BOOT !== 'true') void this.ensure().catch((e) => this.log.error(e));
  }

  @Cron('7 * * * *')
  async hourly() {
    if (this.enabled) await this.ensure().catch((e) => this.log.error(e));
  }

  async ensure() {
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      const s = await this.settings.get();
      const today = todayIn(s.timeZone, this.clock.now());
      const created = await this.fill(today);
      const closed = await this.closeOutPast(today);
      const shaped = await this.shapeToday(today);
      const invoiced = await this.invoiceOldWeeks(today);
      return { today, created, closed, shaped, invoiced };
    } finally {
      this.running = false;
    }
  }

  // 1. Fill
  private async fill(today: IsoDate): Promise<number> {
    const from = addDays(today, -14);
    const to = addDays(today, 7);
    const existing = await this.prisma.order.findMany({
      where: { deliveryDate: { gte: toDbDate(from), lte: toDbDate(to) } },
      distinct: ['deliveryDate'],
      select: { deliveryDate: true },
    });
    const has = new Set(existing.map((e) => fromDbDate(e.deliveryDate)));
    const cutoffs = await this.settings.cutoffSettings();
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      include: { employees: { where: { active: true }, orderBy: { email: 'asc' } }, holidays: true, addresses: { where: { active: true } } },
      orderBy: { name: 'asc' },
    });
    const menus = new Map<string, MenuDish[]>();
    const menuFor = async (employeeId: string) => {
      if (!menus.has(employeeId)) {
        const { dishes } = await this.menu.orderableDishes(employeeId);
        menus.set(employeeId, [...dishes.values()]);
      }
      return menus.get(employeeId)!;
    };

    let created = 0;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (has.has(date) || !isWorkingDay(date, cutoffs)) continue;
      for (const company of companies) {
        const cal = { workingDays: company.workingDays, holidays: new Set(company.holidays.map((h) => fromDbDate(h.date))) };
        if (!isWorkingDay(date, cal)) continue;
        const rng = rngFor(`${date}:${company.name}`);
        const people = rng.shuffle(company.employees).slice(0, Math.max(2, Math.round(company.employees.length * (0.45 + rng.next() * 0.3))));
        for (const [i, employee] of people.entries()) {
          const lines = this.randomLines(rng, await menuFor(employee.id), i === 0 && rng.chance(0.5));
          if (!lines.length) continue;
          const altAddress = employee.canChooseAddress && company.addresses.length > 1 && rng.chance(0.4)
            ? company.addresses.find((a) => !a.isDefault)?.id
            : undefined;
          const altTime = employee.canChangeDeliveryTime && rng.chance(0.3) ? company.defaultDeliveryTimeMin + 30 : undefined;
          const order = await this.orders.create(
            { employeeId: employee.id, deliveryDate: date, addressId: altAddress, deliveryTimeMin: altTime, notes: '', lines, place: true },
            demoUser,
          );
          await this.settleStatus(order.id, date, today, cutoffInstant(date, cutoffs), rng);
          created++;
        }
      }
    }
    if (created) this.log.log(`Created ${created} demo orders`);
    return created;
  }

  /** One or two dishes; the first employee of the day sometimes orders for their team. */
  private randomLines(rng: Rng, dishes: MenuDish[], teamOrder: boolean) {
    if (!dishes.length) return [];
    const picks = rng.shuffle(dishes).slice(0, rng.chance(0.35) ? 2 : 1);
    return picks.map((dish, li) => {
      const quantity = Math.max(dish.minOrderQty ?? 1, teamOrder && li === 0 ? rng.int(6, 12) : rng.chance(0.15) ? 2 : 1);
      const comboCount = Math.min(quantity, dish.groups.some((g) => g.options.length > 1) ? (quantity >= 6 ? rng.int(2, 3) : 1) : 1);
      const combos = new Map<string, { quantity: number; choices: { groupId: string; optionId: string; portionSizeId: string | null }[] }>();
      let remaining = quantity;
      for (let c = 0; c < comboCount; c++) {
        const q = c === comboCount - 1 ? remaining : Math.max(1, Math.floor(remaining / (comboCount - c)) + rng.int(-1, 1));
        remaining -= q;
        const choices = dish.groups
          .filter((g) => g.required || rng.chance(0.3))
          .filter((g) => g.options.length > 0)
          .map((g) => ({
            groupId: g.id,
            optionId: rng.pick(g.options).id,
            portionSizeId: g.usesPortions ? rng.pick(g.portions).portionSizeId : null,
          }));
        const key = choices.map((x) => `${x.groupId}${x.optionId}${x.portionSizeId}`).sort().join('|');
        const prev = combos.get(key);
        if (prev) prev.quantity += q;
        else combos.set(key, { quantity: q, choices });
      }
      return { dishId: dish.id, quantity, combinations: [...combos.values()] };
    });
  }

  /** Moves a freshly placed demo order to the state it would be in by now. */
  private async settleStatus(orderId: string, date: IsoDate, today: IsoDate, cutoffAt: Date, rng: Rng) {
    const now = this.clock.now();
    const placedAt = new Date(cutoffAt.getTime() - rng.int(2, 72) * 60 * MIN);
    if (now < cutoffAt) {
      // Before cut-off: mostly placed, some drafts still being put together.
      const draft = rng.chance(0.2);
      await this.prisma.order.update({
        where: { id: orderId },
        data: draft ? { status: 'DRAFT', placedAt: null } : { placedAt },
      });
      if (draft) await this.prisma.orderEvent.updateMany({ where: { orderId }, data: { type: 'DRAFTED', message: 'Saved as draft' } });
      return;
    }
    if (date < today) {
      const roll = rng.next();
      if (roll < 0.04) return this.mark(orderId, { status: 'CANCELLED', placedAt: null, cancelledAt: cutoffAt }, 'CANCELLED', 'Draft cancelled at cut-off');
      if (roll < 0.08) return this.mark(orderId, { status: 'CANCELLED', placedAt, cancelledAt: new Date(placedAt.getTime() + 3 * 60 * MIN) }, 'CANCELLED', 'Order cancelled: employee on leave');
      if (roll < 0.1) return this.mark(orderId, { status: 'REJECTED', placedAt, rejectedAt: new Date(cutoffAt.getTime() - 30 * MIN) }, 'REJECTED', 'Order rejected: duplicate order');
    }
    await this.mark(orderId, { status: 'CONFIRMED', placedAt, confirmedAt: cutoffAt }, 'CONFIRMED', 'Confirmed at cut-off, now billable');
    if (date < today) await this.deliver(orderId, rng);
  }

  private async mark(orderId: string, data: object, type: string, message: string) {
    await this.prisma.order.update({ where: { id: orderId }, data });
    await this.prisma.orderEvent.create({ data: { orderId, type, message, actorName: 'System', actorId: DEMO_ACTOR } });
  }

  /** Full kitchen → dispatch → delivered history, timed around the plan. */
  private async deliver(orderId: string, rng: Rng) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { combinations: true, drop: true, company: true } });
    const kitchenReadyAt = new Date(o.plannedKitchenReadyAt.getTime() + rng.int(-20, 15) * MIN);
    const startedAt = new Date(kitchenReadyAt.getTime() - rng.int(40, 90) * MIN);
    const dispatchReadyAt = new Date(Math.max(kitchenReadyAt.getTime() + 10 * MIN, o.plannedDispatchReadyAt.getTime() - rng.int(0, 15) * MIN));
    const outAt = new Date(dispatchReadyAt.getTime() + rng.int(5, 15) * MIN);
    const deliveredAt = new Date(o.deliveryAt.getTime() + (rng.chance(0.85) ? rng.int(-15, 5) : rng.int(12, 40)) * MIN);
    const grace = (await this.settings.get()).onTimeGraceMin;
    const onTime = deliveredAt.getTime() <= o.deliveryAt.getTime() + grace * MIN;
    await this.prisma.orderCombination.updateMany({ where: { orderId }, data: { startedAt, doneAt: kitchenReadyAt } });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', kitchenStartedAt: startedAt, kitchenReadyAt, dispatchReadyAt, outForDeliveryAt: outAt, deliveredAt, onTime },
    });
    if (o.dropId) {
      await this.prisma.drop.updateMany({
        where: { id: o.dropId, deliveredAt: null },
        data: { deliveredAt, onTime, driverId: o.drop?.driverId ?? o.company.defaultDriverId, deliveryNote: rng.chance(0.3) ? 'Handed to reception.' : '' },
      });
    }
    await this.prisma.orderEvent.createMany({
      data: [
        { orderId, type: 'KITCHEN_STARTED', message: 'Kitchen started', at: startedAt, actorName: 'System', actorId: DEMO_ACTOR },
        { orderId, type: 'KITCHEN_READY', message: 'All prep units done', at: kitchenReadyAt, actorName: 'System', actorId: DEMO_ACTOR },
        { orderId, type: 'DISPATCH_READY', message: 'Packed and ready to dispatch', at: dispatchReadyAt, actorName: 'System', actorId: DEMO_ACTOR },
        { orderId, type: 'OUT_FOR_DELIVERY', message: 'Out for delivery', at: outAt, actorName: 'System', actorId: DEMO_ACTOR },
        { orderId, type: 'DELIVERED', message: onTime ? 'Delivered on time' : 'Delivered late', at: deliveredAt, actorName: 'System', actorId: DEMO_ACTOR },
      ],
    });
  }

  // 2. Close out
  private async closeOutPast(today: IsoDate): Promise<number> {
    const stale = await this.prisma.order.findMany({
      where: { createdById: DEMO_ACTOR, deliveryDate: { lt: toDbDate(today) }, status: 'CONFIRMED', outForDeliveryAt: null },
      select: { id: true, deliveryDate: true },
    });
    for (const o of stale) await this.deliver(o.id, rngFor(`close:${o.id}`));
    return stale.length;
  }

  // 3. Shape today
  private async shapeToday(today: IsoDate): Promise<number> {
    const date = toDbDate(today);
    const already = await this.prisma.orderEvent.count({ where: { type: 'DEMO_SHAPED', order: { deliveryDate: date } } });
    if (already) return 0;
    const orders = await this.prisma.order.findMany({
      where: { createdById: DEMO_ACTOR, deliveryDate: date, status: 'CONFIRMED', kitchenStartedAt: null },
      include: { combinations: true },
      orderBy: [{ deliveryTimeMin: 'asc' }, { number: 'asc' }],
    });
    if (!orders.length) return 0;

    // The review driver gets today's drops. With more than three, the last goes to another
    // driver so the dispatch board shows a second driver too.
    const reviewDriver = await this.prisma.staffUser.findUnique({ where: { email: 'driver@test.com' } });
    const otherDriver = await this.prisma.staffUser.findFirst({
      where: { active: true, email: { not: 'driver@test.com' }, role: { permissions: { has: 'deliveries.own' } } },
    });
    const dropIds = [...new Set(orders.map((o) => o.dropId).filter(Boolean))] as string[];
    if (reviewDriver) {
      await this.prisma.drop.updateMany({ where: { id: { in: dropIds } }, data: { driverId: reviewDriver.id } });
      if (otherDriver && dropIds.length > 3) {
        await this.prisma.drop.update({ where: { id: dropIds[dropIds.length - 1] }, data: { driverId: otherDriver.id } });
      }
    }

    const rng = rngFor(`shape:${today}`);
    const now = this.clock.now();
    let shaped = 0;
    for (const o of orders) {
      const roll = rng.next();
      const startedAt = new Date(Math.min(now.getTime(), o.plannedKitchenReadyAt.getTime() - 75 * MIN));
      if (o.dropId === orders[0].dropId) {
        // Earliest drop: fully cooked, so it can go out with the review driver.
        const readyAt = new Date(Math.min(now.getTime(), o.plannedKitchenReadyAt.getTime() - 5 * MIN));
        await this.prisma.orderCombination.updateMany({ where: { orderId: o.id }, data: { startedAt, doneAt: readyAt } });
        await this.prisma.order.update({ where: { id: o.id }, data: { kitchenStartedAt: startedAt, kitchenReadyAt: readyAt } });
      } else if (roll < 0.45) {
        // In progress: some units started, a few done.
        const units = o.combinations;
        const startCount = Math.max(1, Math.ceil(units.length * 0.6));
        for (const [i, u] of units.slice(0, startCount).entries()) {
          await this.prisma.orderCombination.update({
            where: { id: u.id },
            data: { startedAt, doneAt: i === 0 && units.length > 1 ? new Date(Math.min(now.getTime(), startedAt.getTime() + 25 * MIN)) : null },
          });
        }
        await this.prisma.order.update({ where: { id: o.id }, data: { kitchenStartedAt: startedAt } });
      } else continue;
      shaped++;
    }
    // Fully cooked drops move on, so the driver account has something to deliver right away:
    // the first goes out for delivery with the review driver, the rest wait at dispatch.
    const cooked = await this.prisma.drop.findMany({
      where: { id: { in: dropIds }, orders: { every: { OR: [{ status: { not: 'CONFIRMED' } }, { kitchenReadyAt: { not: null } }] } } },
      include: { orders: { where: { status: 'CONFIRMED' } } },
      orderBy: { deliveryTimeMin: 'asc' },
    });
    for (const [i, drop] of cooked.entries()) {
      const ids = drop.orders.map((o) => o.id);
      if (!ids.length) continue;
      const out = i === 0 && reviewDriver;
      if (out) await this.prisma.drop.update({ where: { id: drop.id }, data: { driverId: reviewDriver.id } });
      await this.prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { dispatchReadyAt: new Date(now.getTime() - 20 * MIN), ...(out ? { outForDeliveryAt: new Date(now.getTime() - 10 * MIN) } : {}) },
      });
    }

    await this.prisma.orderEvent.create({
      data: { orderId: orders[0].id, type: 'DEMO_SHAPED', message: 'Demo progress applied for today', actorName: 'System', actorId: DEMO_ACTOR },
    });
    return shaped;
  }

  // Billing history
  /** Invoices demo orders delivered more than 7 days ago, one invoice per company per ISO week. */
  private async invoiceOldWeeks(today: IsoDate): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { createdById: DEMO_ACTOR, status: 'DELIVERED', invoiceId: null, deliveryDate: { lt: toDbDate(addDays(today, -7)) } },
      select: { id: true, companyId: true, deliveryDate: true, totalCents: true },
    });
    const groups = new Map<string, typeof orders>();
    for (const o of orders) {
      const d = o.deliveryDate;
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
      const key = `${o.companyId}:${monday.toISOString().slice(0, 10)}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    let count = 0;
    for (const [key, list] of groups) {
      const weekStart = key.split(':')[1];
      const paid = weekStart < addDays(today, -14);
      await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            companyId: list[0].companyId,
            totalCents: list.reduce((a, o) => a + o.totalCents, 0),
            issuedAt: new Date(`${addDays(weekStart, 7)}T15:00:00Z`),
            status: paid ? 'PAID' : 'ISSUED',
            paidAt: paid ? new Date(`${addDays(weekStart, 12)}T15:00:00Z`) : null,
            createdById: DEMO_ACTOR,
          },
        });
        for (const o of list) {
          await tx.order.update({ where: { id: o.id }, data: { invoiceId: invoice.id, invoicedCents: o.totalCents } });
        }
      });
      count++;
    }
    return count;
  }
}
