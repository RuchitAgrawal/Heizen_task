import { Injectable } from '@nestjs/common';
import { IsoDate, formatMinutes, urgency } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { conflict, forbidden, invalid, notFound } from '../common/errors';
import { fromDbDate, toDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import { can, AuthUser } from '../auth/auth.types';
import { logEvents } from '../orders/order-events';

export type Stage = 'WAITING' | 'COOKING' | 'KITCHEN_READY' | 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
const STAGE_ORDER: Stage[] = ['WAITING', 'COOKING', 'KITCHEN_READY', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

interface StageFields {
  kitchenStartedAt: Date | null;
  kitchenReadyAt: Date | null;
  dispatchReadyAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
}

export function orderStage(o: StageFields): Stage {
  if (o.deliveredAt) return 'DELIVERED';
  if (o.outForDeliveryAt) return 'OUT_FOR_DELIVERY';
  if (o.dispatchReadyAt) return 'DISPATCH_READY';
  if (o.kitchenReadyAt) return 'KITCHEN_READY';
  if (o.kitchenStartedAt) return 'COOKING';
  return 'WAITING';
}

/** A drop is as far along as its least advanced order. */
export function dropStage(orders: StageFields[]): Stage {
  return orders.map(orderStage).reduce((min, s) => (STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(min) ? s : min), 'DELIVERED' as Stage);
}

const ACTIVE = ['CONFIRMED', 'DELIVERED'] as const;

const dropInclude = {
  company: { select: { id: true, name: true, driverInstructions: true } },
  address: true,
  driver: { select: { id: true, name: true } },
  photo: { select: { createdAt: true } },
  orders: {
    where: { status: { in: [...ACTIVE] } },
    orderBy: { number: 'asc' as const },
    select: {
      id: true, number: true, status: true, deliveryAt: true, plannedDispatchReadyAt: true, packagingName: true,
      kitchenStartedAt: true, kitchenReadyAt: true, dispatchReadyAt: true, outForDeliveryAt: true, deliveredAt: true, onTime: true,
      employee: { select: { name: true } },
      lines: { select: { dishName: true, quantity: true, combinations: { select: { quantity: true, label: true } } } },
    },
  },
};

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  private shape(d: Awaited<ReturnType<typeof this.fetchDrops>>[number], atRiskWindowMin: number) {
    const now = this.clock.now();
    const stage = dropStage(d.orders);
    const plannedDispatchReadyAt = d.orders.reduce<Date | null>((m, o) => (!m || o.plannedDispatchReadyAt < m ? o.plannedDispatchReadyAt : m), null);
    const deliveryAt = d.orders[0]?.deliveryAt ?? null;
    return {
      id: d.id,
      deliveryDate: fromDbDate(d.deliveryDate),
      deliveryTimeMin: d.deliveryTimeMin,
      deliveryTime: formatMinutes(d.deliveryTimeMin),
      deliveryAt,
      company: d.company,
      address: d.address,
      driver: d.driver,
      stage,
      // Late/at risk against leaving the kitchen until it has left, then against the delivery slot.
      urgency:
        stage === 'DELIVERED'
          ? 'DONE'
          : stage === 'OUT_FOR_DELIVERY'
            ? urgency(deliveryAt!, null, now, atRiskWindowMin)
            : urgency(plannedDispatchReadyAt!, null, now, atRiskWindowMin),
      plannedDispatchReadyAt,
      deliveredAt: d.deliveredAt,
      onTime: d.onTime,
      deliveryNote: d.deliveryNote,
      hasPhoto: !!d.photo,
      orderCount: d.orders.length,
      mealCount: d.orders.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.quantity, 0), 0),
      stageCounts: Object.fromEntries(STAGE_ORDER.map((s) => [s, d.orders.filter((o) => orderStage(o) === s).length])),
      orders: d.orders.map((o) => ({
        id: o.id, number: o.number, employee: o.employee.name, packaging: o.packagingName, stage: orderStage(o), onTime: o.onTime,
        items: o.lines.flatMap((l) => l.combinations.map((c) => ({ dishName: l.dishName, quantity: c.quantity, label: c.label }))),
      })),
    };
  }

  private fetchDrops(where: object) {
    return this.prisma.drop.findMany({
      where: { ...where, orders: { some: { status: { in: [...ACTIVE] } } } },
      include: dropInclude,
      orderBy: [{ deliveryTimeMin: 'asc' }, { company: { name: 'asc' } }],
    });
  }

  async board(date: IsoDate) {
    const s = await this.settings.get();
    const drops = (await this.fetchDrops({ deliveryDate: toDbDate(date) })).map((d) => this.shape(d, s.atRiskWindowMin));
    return { date, now: this.clock.now(), drops };
  }

  /** Driver view: only the caller's own drops, today only, in time order. */
  async myDrops(user: AuthUser) {
    const s = await this.settings.get();
    const today = await this.settings.today();
    const drops = (await this.fetchDrops({ deliveryDate: toDbDate(today), driverId: user.id })).map((d) => this.shape(d, s.atRiskWindowMin));
    return { date: today, now: this.clock.now(), drops };
  }

  private async lockDrop(tx: Tx, dropId: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Drop" WHERE id = ${dropId} FOR UPDATE`;
    if (!row) throw notFound('Drop');
    return tx.drop.findUniqueOrThrow({
      where: { id: dropId },
      include: { orders: { where: { status: 'CONFIRMED' } } },
    });
  }

  async assignDriver(dropId: string, driverId: string | null, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);
      if (drop.orders.some((o) => o.outForDeliveryAt)) throw conflict('OUT_FOR_DELIVERY', 'This drop has already left with its driver');
      if (driverId) {
        const driver = await tx.staffUser.findFirst({ where: { id: driverId, active: true, role: { permissions: { has: 'deliveries.own' } } } });
        if (!driver) throw invalid('Not an active driver', { driverId: 'Pick a driver' });
      }
      await tx.drop.update({ where: { id: dropId }, data: { driverId } });
      const name = driverId ? (await tx.staffUser.findUnique({ where: { id: driverId } }))!.name : 'nobody';
      await logEvents(tx, drop.orders.map((o) => o.id), 'DRIVER', `Driver set to ${name}`, user);
      return { ok: true };
    });
  }

  /** kitchen ready → dispatch ready → out for delivery. Each step needs the previous one and runs once. */
  async advance(dropId: string, stage: 'DISPATCH_READY' | 'OUT_FOR_DELIVERY', user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);
      const orders = drop.orders;
      if (!orders.length) throw conflict('EMPTY', 'This drop has no confirmed orders');
      const now = this.clock.now();
      if (stage === 'DISPATCH_READY') {
        const notReady = orders.filter((o) => !o.kitchenReadyAt);
        if (notReady.length) throw conflict('KITCHEN_NOT_READY', `${notReady.length} order(s) in this drop are still in the kitchen`);
        const todo = orders.filter((o) => !o.dispatchReadyAt);
        if (!todo.length) throw conflict('ALREADY_DONE', 'This drop is already marked dispatch ready');
        await tx.order.updateMany({ where: { id: { in: todo.map((o) => o.id) }, dispatchReadyAt: null }, data: { dispatchReadyAt: now } });
        await logEvents(tx, todo.map((o) => o.id), 'DISPATCH_READY', 'Packed and ready to dispatch', user);
      } else {
        if (!drop.driverId) throw conflict('NO_DRIVER', 'Assign a driver before sending this drop out');
        const notReady = orders.filter((o) => !o.dispatchReadyAt);
        if (notReady.length) throw conflict('NOT_DISPATCH_READY', `${notReady.length} order(s) are not dispatch ready yet`);
        const todo = orders.filter((o) => !o.outForDeliveryAt);
        if (!todo.length) throw conflict('ALREADY_DONE', 'This drop is already out for delivery');
        await tx.order.updateMany({ where: { id: { in: todo.map((o) => o.id) }, outForDeliveryAt: null }, data: { outForDeliveryAt: now } });
        await logEvents(tx, todo.map((o) => o.id), 'OUT_FOR_DELIVERY', 'Out for delivery', user);
      }
      return { ok: true };
    });
  }

  /**
   * Out for delivery → delivered. A driver may only deliver their own drop, and only today's.
   * On time = delivered no later than the delivery slot plus the grace minutes in settings.
   */
  async deliver(dropId: string, input: { note: string; photoDataUrl: string | null }, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const drop = await this.lockDrop(tx, dropId);
      if (!can(user, 'dispatch.work')) {
        if (drop.driverId !== user.id) throw forbidden('This is not your delivery');
        if (fromDbDate(drop.deliveryDate) !== (await this.settings.today())) throw forbidden('You can only deliver today’s drops');
      }
      const orders = drop.orders;
      if (!orders.length) throw conflict('ALREADY_DONE', 'This drop has already been delivered');
      const notOut = orders.filter((o) => !o.outForDeliveryAt);
      if (notOut.length) throw conflict('NOT_OUT', 'This drop has not left the kitchen yet');

      const now = this.clock.now();
      const grace = (await this.settings.get(tx)).onTimeGraceMin;
      const deliveryAt = orders[0].deliveryAt;
      const onTime = now.getTime() <= deliveryAt.getTime() + grace * 60_000;
      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) }, status: 'CONFIRMED' },
        data: { status: 'DELIVERED', deliveredAt: now, onTime },
      });
      await tx.drop.update({ where: { id: dropId }, data: { deliveredAt: now, deliveredById: user.id, onTime, deliveryNote: input.note } });
      if (input.photoDataUrl) {
        const [, mimeType, b64] = /^data:(image\/\w+);base64,(.*)$/s.exec(input.photoDataUrl) ?? [];
        if (!b64) throw invalid('Photo could not be read', { photoDataUrl: 'Unreadable image' });
        const data = Buffer.from(b64, 'base64');
        await tx.deliveryPhoto.upsert({ where: { dropId }, create: { dropId, mimeType, data }, update: { mimeType, data } });
      }
      const late = onTime ? '' : ` (late by ${Math.round((now.getTime() - deliveryAt.getTime()) / 60_000)} min)`;
      await logEvents(tx, orders.map((o) => o.id), 'DELIVERED', `Delivered${late}${input.note ? `: ${input.note}` : ''}`, user);
      return { ok: true, onTime };
    });
  }

  async photo(dropId: string, user: AuthUser) {
    const drop = await this.prisma.drop.findUnique({ where: { id: dropId }, include: { photo: true } });
    if (!drop?.photo) throw notFound('Photo');
    if (!can(user, 'dispatch.read') && !can(user, 'orders.read') && drop.driverId !== user.id) throw forbidden();
    return drop.photo;
  }
}
