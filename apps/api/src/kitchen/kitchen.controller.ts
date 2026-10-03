import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { boardQuery } from '@fernleaf/shared';
import { z } from 'zod';
import { CurrentUser, Requires } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { SettingsService } from '../settings/settings.service';
import { KitchenService } from './kitchen.service';

@Controller('kitchen')
export class KitchenController {
  constructor(
    private readonly kitchen: KitchenService,
    private readonly settings: SettingsService,
  ) {}

  @Requires('kitchen.read')
  @Get('board')
  async board(@Query(new ZodPipe(boardQuery)) q: z.infer<typeof boardQuery>) {
    return this.kitchen.board(q.date ?? (await this.settings.today()), q.stationId);
  }

  @Requires('kitchen.work')
  @Post('units/:id/start')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.kitchen.start(id, user);
  }

  @Requires('kitchen.work')
  @Post('units/:id/done')
  done(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.kitchen.done(id, user);
  }

  @Requires('kitchen.forceComplete')
  @Post('orders/:id/force-complete')
  forceComplete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.kitchen.forceComplete(id, user);
  }
}
