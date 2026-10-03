import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { holidaySchema, isoDate, settingsSchema, SettingsInput } from '@fernleaf/shared';
import { z } from 'zod';
import { Requires, SignedIn } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { Clock } from '../common/clock';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** Every signed-in user needs the time zone and "today" to render dates correctly. */
  @SignedIn()
  @Get('clock')
  async clockInfo() {
    const s = await this.settings.get();
    return { timeZone: s.timeZone, today: await this.settings.today(), now: this.clock.now().toISOString() };
  }

  @Requires('settings.read')
  @Get()
  async get() {
    const [settings, holidays] = await Promise.all([this.settings.get(), this.settings.listHolidays()]);
    return { settings, holidays };
  }

  @Requires('settings.write')
  @Put()
  update(@Body(new ZodPipe(settingsSchema)) body: SettingsInput) {
    return this.settings.update(body);
  }

  @Requires('settings.write')
  @Post('holidays')
  addHoliday(@Body(new ZodPipe(holidaySchema)) body: z.infer<typeof holidaySchema>) {
    return this.settings.addHoliday(body.date, body.name);
  }

  @Requires('settings.write')
  @Delete('holidays/:date')
  removeHoliday(@Param('date', new ZodPipe(isoDate)) date: string) {
    return this.settings.removeHoliday(date);
  }
}
