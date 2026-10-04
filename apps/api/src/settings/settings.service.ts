import { Injectable } from '@nestjs/common';
import type { KitchenSettings } from '@prisma/client';
import { CutoffSettings, IsoDate, SettingsInput, asWeekdays, cutoffInstant, todayIn } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { fromDbDate, toDbDate } from '../common/dates';
import { conflict } from '../common/errors';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async get(db: Tx | PrismaService = this.prisma): Promise<KitchenSettings> {
    return db.kitchenSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  update(input: SettingsInput) {
    return this.prisma.kitchenSettings.upsert({ where: { id: 1 }, create: { id: 1, ...input }, update: input });
  }

  async cutoffSettings(db: Tx | PrismaService = this.prisma): Promise<CutoffSettings> {
    const [s, holidays] = await Promise.all([this.get(db), db.kitchenHoliday.findMany()]);
    return {
      cutoffDays: s.cutoffDays,
      cutoffTimeMin: s.cutoffTimeMin,
      workingDays: asWeekdays(s.workingDays),
      timeZone: s.timeZone,
      holidays: new Set(holidays.map((h) => fromDbDate(h.date))),
    };
  }

  async today(): Promise<IsoDate> {
    return todayIn((await this.get()).timeZone, this.clock.now());
  }

  async cutoffFor(deliveryDate: IsoDate): Promise<Date> {
    return cutoffInstant(deliveryDate, await this.cutoffSettings());
  }

  listHolidays() {
    return this.prisma.kitchenHoliday
      .findMany({ orderBy: { date: 'asc' } })
      .then((rows) => rows.map((h) => ({ date: fromDbDate(h.date), name: h.name })));
  }

  async addHoliday(date: IsoDate, name: string) {
    const exists = await this.prisma.kitchenHoliday.findUnique({ where: { date: toDbDate(date) } });
    if (exists) throw conflict('DUPLICATE', `${date} is already a kitchen holiday`);
    await this.prisma.kitchenHoliday.create({ data: { date: toDbDate(date), name } });
  }

  async removeHoliday(date: IsoDate) {
    await this.prisma.kitchenHoliday.deleteMany({ where: { date: toDbDate(date) } });
  }
}
