import { Injectable } from '@nestjs/common';
import { IsoDate, addDays, cutoffInstant } from '@fernleaf/shared';
import { PrismaService } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { fromDbDate, toDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import { PricingService } from '../pricing/pricing.service';
import { KitchenService } from '../kitchen/kitchen.service';
import { DispatchService } from '../dispatch/dispatch.service';

/**
 * Every figure here is defined in the README under "Dashboards". Shared conventions:
 * - Dates are delivery dates in the kitchen time zone.
 * - "Billable" = CONFIRMED or DELIVERED. Cancelled and rejected orders never count as revenue.
 * - Money is the order's stored total (prices at the time of ordering).
 */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly pricing: PricingService,
    private readonly kitchen: KitchenService,
    private readonly dispatch: DispatchService,
    private readonly clock: Clock,
  ) {}

  async admin() {
    const today = await this.settings.today();
    const cutoffs = await this.settings.cutoffSettings();
    const now = this.clock.now();
    const d = (x: IsoDate) => toDbDate(x);

    // Pipeline: today and the next 7 days, by status.
    const horizon = addDays(today, 7);
    const pipelineRows = await this.prisma.order.groupBy({
      by: ['deliveryDate', 'status'],
      where: { deliveryDate: { gte: d(today), lte: d(horizon) } },
      _count: true,
      _sum: { totalCents: true },
    });
    const pipeline = [];
    for (let date = today; date <= horizon; date = addDays(date, 1)) {
      const rows = pipelineRows.filter((r) => fromDbDate(r.deliveryDate) === date);
      const n = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
      const cents = (s: string) => rows.find((r) => r.status === s)?._sum.totalCents ?? 0;
      const cutoffAt = cutoffInstant(date, cutoffs);
      pipeline.push({
        date,
        cutoffAt,
        cutoffPassed: now >= cutoffAt,
        drafts: n('DRAFT'),
        placed: n('PLACED'),
        confirmed: n('CONFIRMED') + n('DELIVERED'),
        cancelled: n('CANCELLED') + n('REJECTED'),
        // Placed + confirmed + delivered: what the day is worth if nothing else changes.
        bookedCents: cents('PLACED') + cents('CONFIRMED') + cents('DELIVERED'),
      });
    }

    // Delivery performance and cancellations: the last 14 delivery dates before today.
    const from14 = addDays(today, -14);
    const delivered = await this.prisma.order.groupBy({
      by: ['deliveryDate', 'onTime'],
      where: { deliveryDate: { gte: d(from14), lt: d(today) }, status: 'DELIVERED' },
      _count: true,
    });
    const onTimeTotal = delivered.filter((r) => r.onTime === true).reduce((a, r) => a + r._count, 0);
    const lateTotal = delivered.filter((r) => r.onTime === false).reduce((a, r) => a + r._count, 0);
    const unknownTotal = delivered.filter((r) => r.onTime === null).reduce((a, r) => a + r._count, 0);
    const byDay = [];
    for (let date = from14; date < today; date = addDays(date, 1)) {
      const rows = delivered.filter((r) => fromDbDate(r.deliveryDate) === date);
      byDay.push({
        date,
        onTime: rows.find((r) => r.onTime === true)?._count ?? 0,
        late: rows.find((r) => r.onTime === false)?._count ?? 0,
      });
    }
    const [placedEver, cancelledAfterPlacing] = await Promise.all([
      this.prisma.order.count({ where: { deliveryDate: { gte: d(from14), lt: d(today) }, placedAt: { not: null } } }),
      this.prisma.order.count({ where: { deliveryDate: { gte: d(from14), lt: d(today) }, placedAt: { not: null }, status: { in: ['CANCELLED', 'REJECTED'] } } }),
    ]);

    // Revenue by company: billable orders delivered in the last 30 days, before today.
    const from30 = addDays(today, -30);
    const [revenue, companies] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['companyId'],
        where: { deliveryDate: { gte: d(from30), lt: d(today) }, status: { in: ['CONFIRMED', 'DELIVERED'] } },
        _count: true,
        _sum: { totalCents: true },
      }),
      this.prisma.company.findMany({ select: { id: true, name: true } }),
    ]);

    // Billing exposure: everything billable not yet on an invoice, any date.
    const [uninvoiced, unpaid, oldest] = await Promise.all([
      this.prisma.order.aggregate({ where: { invoiceId: null, status: { in: ['CONFIRMED', 'DELIVERED'] } }, _count: true, _sum: { totalCents: true } }),
      this.prisma.invoice.aggregate({ where: { status: 'ISSUED' }, _count: true, _sum: { totalCents: true } }),
      this.prisma.order.findFirst({ where: { invoiceId: null, status: { in: ['CONFIRMED', 'DELIVERED'] } }, orderBy: { deliveryDate: 'asc' }, select: { deliveryDate: true } }),
    ]);

    // Menu gaps: active dishes with no price on a tier that at least one company uses.
    const tiers = await this.prisma.priceTier.findMany({ include: { _count: { select: { companies: true } } } });
    const inUse = tiers.filter((t) => t.isDefault || t._count.companies > 0);
    const activeDishes = await this.prisma.dish.findMany({ where: { active: true }, select: { id: true } });
    const gaps = [];
    for (const t of inUse) {
      const book = await this.pricing.priceBook(t.id);
      gaps.push({ tierId: t.id, tier: t.name, missing: activeDishes.filter((x) => book.dish.get(x.id)?.cents == null).length });
    }

    return {
      today,
      now,
      pipeline,
      delivery: { from: from14, to: addDays(today, -1), onTime: onTimeTotal, late: lateTotal, unknown: unknownTotal, byDay },
      cancellations: { from: from14, to: addDays(today, -1), placed: placedEver, cancelledOrRejected: cancelledAfterPlacing },
      revenueByCompany: revenue
        .map((r) => ({ company: companies.find((c) => c.id === r.companyId)!, orders: r._count, cents: r._sum.totalCents ?? 0 }))
        .sort((a, b) => b.cents - a.cents),
      revenueWindow: { from: from30, to: addDays(today, -1) },
      billing: {
        uninvoicedOrders: uninvoiced._count,
        uninvoicedCents: uninvoiced._sum.totalCents ?? 0,
        oldestUninvoiced: oldest ? fromDbDate(oldest.deliveryDate) : null,
        unpaidInvoices: unpaid._count,
        unpaidCents: unpaid._sum.totalCents ?? 0,
      },
      pricingGaps: gaps,
    };
  }

  async kitchenDash() {
    const today = await this.settings.today();
    const tomorrow = addDays(today, 1);
    const board = await this.kitchen.board(today);
    const next = await this.kitchen.board(tomorrow);
    const open = board.units.filter((u) => !u.doneAt);
    const nextDue = open.reduce<Date | null>((m, u) => (!m || u.order.plannedKitchenReadyAt < m ? u.order.plannedKitchenReadyAt : m), null);
    return {
      today,
      now: board.now,
      stations: board.stations,
      totals: {
        units: board.units.length,
        portions: board.units.reduce((a, u) => a + u.quantity, 0),
        remainingPortions: open.reduce((a, u) => a + u.quantity, 0),
        late: open.filter((u) => u.urgency === 'LATE').length,
        atRisk: open.filter((u) => u.urgency === 'AT_RISK').length,
        ordersReady: new Set(board.units.map((u) => u.order.id)).size - new Set(open.map((u) => u.order.id)).size,
        orders: new Set(board.units.map((u) => u.order.id)).size,
      },
      nextDue,
      batches: board.batches.filter((b) => b.remaining > 0).slice(0, 12),
      tomorrow: {
        date: tomorrow,
        // Only confirmed orders: tomorrow's placed orders can still change until cut-off.
        stations: next.stations.filter((s) => s.units > 0).map((s) => ({ id: s.id, name: s.name, portions: s.portions })),
        confirmedOrders: new Set(next.units.map((u) => u.order.id)).size,
      },
    };
  }

  async dispatchDash() {
    const today = await this.settings.today();
    const board = await this.dispatch.board(today);
    const drops = board.drops;
    const count = (stage: string) => drops.filter((x) => x.stage === stage).length;
    const drivers = new Map<string, { id: string; name: string; drops: number; meals: number; remaining: number }>();
    for (const x of drops) {
      if (!x.driver) continue;
      const r = drivers.get(x.driver.id) ?? { ...x.driver, drops: 0, meals: 0, remaining: 0 };
      r.drops++;
      r.meals += x.mealCount;
      if (x.stage !== 'DELIVERED') r.remaining++;
      drivers.set(x.driver.id, r);
    }
    const deliveredDrops = drops.filter((x) => x.stage === 'DELIVERED');
    return {
      today,
      now: board.now,
      drops: drops.length,
      byStage: {
        waiting: count('WAITING') + count('COOKING'),
        kitchenReady: count('KITCHEN_READY'),
        dispatchReady: count('DISPATCH_READY'),
        outForDelivery: count('OUT_FOR_DELIVERY'),
        delivered: count('DELIVERED'),
      },
      unassigned: drops.filter((x) => !x.driver && x.stage !== 'DELIVERED').map((x) => ({ id: x.id, company: x.company.name, time: x.deliveryTime })),
      attention: drops
        .filter((x) => x.urgency === 'LATE' || x.urgency === 'AT_RISK')
        .map((x) => ({ id: x.id, company: x.company.name, time: x.deliveryTime, stage: x.stage, urgency: x.urgency, driver: x.driver?.name ?? null })),
      drivers: [...drivers.values()].sort((a, b) => a.name.localeCompare(b.name)),
      onTime: { delivered: deliveredDrops.length, onTime: deliveredDrops.filter((x) => x.onTime).length },
    };
  }
}
