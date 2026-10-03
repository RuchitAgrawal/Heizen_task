import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IsoDate, cutoffInstant } from '@fernleaf/shared';
import { PrismaService } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { conflict } from '../common/errors';
import { fromDbDate, toDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../auth/auth.types';
import { logEvents } from './order-events';

export interface CutoffResult {
  deliveryDate: IsoDate;
  cutoffAt: Date;
  cancelled: number;
  confirmed: number;
}

/**
 * When a date's cut-off passes: drafts → CANCELLED, placed → CONFIRMED (billable).
 *
 * Idempotent by construction: each status change is one UPDATE ... WHERE status = X,
 * so a second run, or two runs at once, finds nothing left to change. RETURNING tells us
 * exactly which rows this run changed, so timeline events are never written twice.
 *
 * Triggers: a cron every 5 minutes, once on boot (free hosts sleep and miss cron ticks),
 * and the admin "Run cut-off" button for any date whose cut-off has passed.
 */
@Injectable()
export class CutoffService implements OnApplicationBootstrap {
  private readonly log = new Logger('Cutoff');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    await this.processDue('boot').catch((e) => this.log.error(e));
  }

  @Cron('*/5 * * * *')
  async tick() {
    await this.processDue('schedule').catch((e) => this.log.error(e));
  }

  /** Every date that still has drafts or placed orders and whose cut-off has passed. */
  async processDue(trigger: string): Promise<CutoffResult[]> {
    const dates = await this.prisma.order.findMany({
      where: { status: { in: ['DRAFT', 'PLACED'] } },
      distinct: ['deliveryDate'],
      select: { deliveryDate: true },
    });
    const s = await this.settings.cutoffSettings();
    const now = this.clock.now();
    const due = dates.map((d) => fromDbDate(d.deliveryDate)).filter((d) => now >= cutoffInstant(d, s));
    const results: CutoffResult[] = [];
    for (const d of due.sort()) results.push(await this.process(d, trigger));
    return results;
  }

  async process(deliveryDate: IsoDate, trigger: string, actor?: AuthUser): Promise<CutoffResult> {
    const cutoffAt = cutoffInstant(deliveryDate, await this.settings.cutoffSettings());
    const now = this.clock.now();
    if (now < cutoffAt) {
      throw conflict('CUTOFF_NOT_PASSED', `The cut-off for ${deliveryDate} is ${cutoffAt.toISOString()}; it has not passed yet`);
    }
    return this.prisma.$transaction(async (tx) => {
      // Compare as text cast to date. A JS Date parameter is a timestamptz, which Postgres
      // would convert to a date in the session time zone, shifting the day off UTC servers.
      const cancelled = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Order" SET status = 'CANCELLED', "cancelledAt" = ${now}, version = version + 1, "updatedAt" = ${now}
        WHERE "deliveryDate" = ${deliveryDate}::date AND status = 'DRAFT'
        RETURNING id`;
      const confirmed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Order" SET status = 'CONFIRMED', "confirmedAt" = ${now}, version = version + 1, "updatedAt" = ${now}
        WHERE "deliveryDate" = ${deliveryDate}::date AND status = 'PLACED'
        RETURNING id`;
      await logEvents(tx, cancelled.map((r) => r.id), 'CANCELLED', 'Draft cancelled at cut-off', actor);
      await logEvents(tx, confirmed.map((r) => r.id), 'CONFIRMED', 'Confirmed at cut-off, now billable', actor);
      await tx.cutoffRun.create({
        data: { deliveryDate: toDbDate(deliveryDate), trigger, cancelled: cancelled.length, confirmed: confirmed.length },
      });
      if (cancelled.length || confirmed.length) {
        this.log.log(`${deliveryDate}: cancelled ${cancelled.length}, confirmed ${confirmed.length} (${trigger})`);
      }
      return { deliveryDate, cutoffAt, cancelled: cancelled.length, confirmed: confirmed.length };
    });
  }

  async status(from: IsoDate, to: IsoDate) {
    const s = await this.settings.cutoffSettings();
    const [open, runs] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['deliveryDate', 'status'],
        where: { deliveryDate: { gte: toDbDate(from), lte: toDbDate(to) }, status: { in: ['DRAFT', 'PLACED'] } },
        _count: true,
      }),
      this.prisma.cutoffRun.findMany({
        where: { deliveryDate: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: { ranAt: 'desc' },
      }),
    ]);
    const days: Record<string, { drafts: number; placed: number; lastRun: unknown }> = {};
    for (const row of open) {
      const d = fromDbDate(row.deliveryDate);
      days[d] ??= { drafts: 0, placed: 0, lastRun: null };
      if (row.status === 'DRAFT') days[d].drafts = row._count;
      else days[d].placed = row._count;
    }
    for (const r of runs) {
      const d = fromDbDate(r.deliveryDate);
      days[d] ??= { drafts: 0, placed: 0, lastRun: null };
      days[d].lastRun ??= { ranAt: r.ranAt, trigger: r.trigger, cancelled: r.cancelled, confirmed: r.confirmed };
    }
    return Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([deliveryDate, v]) => ({ deliveryDate, cutoffAt: cutoffInstant(deliveryDate, s), ...v }));
  }
}
