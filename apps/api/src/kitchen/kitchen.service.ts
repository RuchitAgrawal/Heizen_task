import { Injectable } from '@nestjs/common';
import { IsoDate, urgency } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { conflict, notFound } from '../common/errors';
import { toDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../auth/auth.types';
import { logEvent } from '../orders/order-events';

export const UNASSIGNED = 'unassigned';

/**
 * A prep unit is one OrderCombination: a distinct combination on an order line, cooked as one batch.
 *
 * Concurrency: every action locks the unit's order row (SELECT ... FOR UPDATE) first, so actions
 * on the same order run one after another. The unit update itself is conditional
 * (WHERE "startedAt" IS NULL / "doneAt" IS NULL), so two people pressing "done" at once
 * yields one success and one "already done", and "kitchen ready" is set exactly once.
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  async board(date: IsoDate, stationId?: string) {
    const [settings, stations] = await Promise.all([this.settings.get(), this.prisma.kitchenStation.findMany({ orderBy: { sortOrder: 'asc' } })]);
    const now = this.clock.now();
    // One query, narrow select: a 400-order day is ~1,000 units and stays well under 100 ms.
    const units = await this.prisma.orderCombination.findMany({
      where: {
        order: { deliveryDate: toDbDate(date), status: { in: ['CONFIRMED', 'DELIVERED'] } },
        ...(stationId ? { stationId: stationId === UNASSIGNED ? null : stationId } : {}),
      },
      select: {
        id: true, quantity: true, label: true, stationId: true, startedAt: true, doneAt: true,
        line: { select: { dishName: true, temperature: true } },
        order: {
          select: {
            id: true, number: true, status: true, deliveryTimeMin: true, plannedKitchenReadyAt: true, kitchenReadyAt: true,
            company: { select: { name: true } }, employee: { select: { name: true } },
          },
        },
      },
      orderBy: [{ order: { plannedKitchenReadyAt: 'asc' } }, { order: { number: 'asc' } }],
    });

    const rows = units.map((u) => ({
      id: u.id,
      quantity: u.quantity,
      dishName: u.line.dishName,
      temperature: u.line.temperature,
      label: u.label,
      stationId: u.stationId ?? UNASSIGNED,
      startedAt: u.startedAt,
      doneAt: u.doneAt,
      order: {
        id: u.order.id,
        number: u.order.number,
        status: u.order.status,
        company: u.order.company.name,
        employee: u.order.employee.name,
        deliveryTimeMin: u.order.deliveryTimeMin,
        plannedKitchenReadyAt: u.order.plannedKitchenReadyAt,
      },
      urgency: urgency(u.order.plannedKitchenReadyAt, u.doneAt, now, settings.atRiskWindowMin),
    }));

    // Batch view: identical dish + combination across orders, so the line can cook them together.
    const batches = new Map<string, { dishName: string; label: string; stationId: string; quantity: number; remaining: number; earliestDue: Date }>();
    for (const r of rows) {
      const key = `${r.stationId}|${r.dishName}|${r.label}`;
      const b = batches.get(key) ?? { dishName: r.dishName, label: r.label, stationId: r.stationId, quantity: 0, remaining: 0, earliestDue: r.order.plannedKitchenReadyAt };
      b.quantity += r.quantity;
      if (!r.doneAt) b.remaining += r.quantity;
      if (r.order.plannedKitchenReadyAt < b.earliestDue) b.earliestDue = r.order.plannedKitchenReadyAt;
      batches.set(key, b);
    }

    const stationSummary = [...stations.map((s) => ({ id: s.id, name: s.name })), { id: UNASSIGNED, name: 'Unassigned' }].map((s) => {
      const mine = rows.filter((r) => r.stationId === s.id);
      return {
        ...s,
        units: mine.length,
        portions: mine.reduce((a, r) => a + r.quantity, 0),
        notStarted: mine.filter((r) => !r.startedAt).length,
        inProgress: mine.filter((r) => r.startedAt && !r.doneAt).length,
        done: mine.filter((r) => r.doneAt).length,
        late: mine.filter((r) => r.urgency === 'LATE').length,
        atRisk: mine.filter((r) => r.urgency === 'AT_RISK').length,
      };
    });

    return { date, now, units: rows, batches: [...batches.values()].sort((a, b) => +a.earliestDue - +b.earliestDue), stations: stationSummary };
  }

  /** Locks the unit's order and checks it can be worked on. */
  private async lockForUnit(tx: Tx, unitId: string) {
    const unit = await tx.orderCombination.findUnique({ where: { id: unitId }, select: { orderId: true } });
    if (!unit) throw notFound('Prep unit');
    const [order] = await tx.$queryRaw<{ id: string; status: string; kitchenStartedAt: Date | null }[]>`
      SELECT id, status::text, "kitchenStartedAt" FROM "Order" WHERE id = ${unit.orderId} FOR UPDATE`;
    if (order.status !== 'CONFIRMED') throw conflict('NOT_CONFIRMED', 'Only confirmed orders can be worked on');
    return order;
  }

  async start(unitId: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockForUnit(tx, unitId);
      const now = this.clock.now();
      const res = await tx.orderCombination.updateMany({
        where: { id: unitId, startedAt: null },
        data: { startedAt: now, startedById: user.id },
      });
      if (res.count === 0) throw conflict('ALREADY_STARTED', 'This unit has already been started');
      await this.markOrderStarted(tx, order, now, user);
      return tx.orderCombination.findUnique({ where: { id: unitId } });
    });
  }

  /** Done without a start is allowed and records the start at the same moment. */
  async done(unitId: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockForUnit(tx, unitId);
      const now = this.clock.now();
      const changed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "OrderCombination"
        SET "doneAt" = ${now}, "doneById" = ${user.id},
            "startedAt" = COALESCE("startedAt", ${now}), "startedById" = COALESCE("startedById", ${user.id})
        WHERE id = ${unitId} AND "doneAt" IS NULL
        RETURNING id`;
      if (changed.length === 0) throw conflict('ALREADY_DONE', 'This unit is already done');
      await this.markOrderStarted(tx, order, now, user);
      await this.markOrderReadyIfComplete(tx, order.id, now, user);
      return tx.orderCombination.findUnique({ where: { id: unitId } });
    });
  }

  /** Admin: finish every remaining unit of an order at once. */
  async forceComplete(orderId: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<{ id: string; status: string; kitchenStartedAt: Date | null; kitchenReadyAt: Date | null }[]>`
        SELECT id, status::text, "kitchenStartedAt", "kitchenReadyAt" FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      if (!order) throw notFound('Order');
      if (order.status !== 'CONFIRMED') throw conflict('NOT_CONFIRMED', 'Only confirmed orders can be worked on');
      if (order.kitchenReadyAt) throw conflict('ALREADY_DONE', 'The kitchen has already finished this order');
      const now = this.clock.now();
      await tx.$executeRaw`
        UPDATE "OrderCombination"
        SET "doneAt" = ${now}, "doneById" = ${user.id},
            "startedAt" = COALESCE("startedAt", ${now}), "startedById" = COALESCE("startedById", ${user.id})
        WHERE "orderId" = ${orderId} AND "doneAt" IS NULL`;
      await this.markOrderStarted(tx, order, now, user);
      await this.markOrderReadyIfComplete(tx, orderId, now, user, 'Admin force-completed the kitchen work');
      return tx.order.findUnique({ where: { id: orderId } });
    });
  }

  private async markOrderStarted(tx: Tx, order: { id: string; kitchenStartedAt: Date | null }, now: Date, user: AuthUser) {
    if (order.kitchenStartedAt) return;
    await tx.order.update({ where: { id: order.id }, data: { kitchenStartedAt: now } });
    await logEvent(tx, order.id, 'KITCHEN_STARTED', 'Kitchen started', user);
  }

  private async markOrderReadyIfComplete(tx: Tx, orderId: string, now: Date, user: AuthUser, message = 'All prep units done') {
    const remaining = await tx.orderCombination.count({ where: { orderId, doneAt: null } });
    if (remaining > 0) return;
    const res = await tx.order.updateMany({ where: { id: orderId, kitchenReadyAt: null }, data: { kitchenReadyAt: now } });
    if (res.count) await logEvent(tx, orderId, 'KITCHEN_READY', message, user);
  }
}
