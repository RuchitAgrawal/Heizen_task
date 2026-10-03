import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { assignDriverSchema, boardQuery, deliverSchema, dropAdvanceSchema } from '@fernleaf/shared';
import { z } from 'zod';
import { CurrentUser, Requires } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { SettingsService } from '../settings/settings.service';
import { DispatchService } from './dispatch.service';

@Controller()
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly settings: SettingsService,
  ) {}

  @Requires('dispatch.read')
  @Get('dispatch/board')
  async board(@Query(new ZodPipe(boardQuery)) q: z.infer<typeof boardQuery>) {
    return this.dispatch.board(q.date ?? (await this.settings.today()));
  }

  @Requires('dispatch.work')
  @Post('dispatch/drops/:id/driver')
  assign(@Param('id') id: string, @Body(new ZodPipe(assignDriverSchema)) body: z.infer<typeof assignDriverSchema>, @CurrentUser() user: AuthUser) {
    return this.dispatch.assignDriver(id, body.driverId, user);
  }

  @Requires('dispatch.work')
  @Post('dispatch/drops/:id/advance')
  advance(@Param('id') id: string, @Body(new ZodPipe(dropAdvanceSchema)) body: z.infer<typeof dropAdvanceSchema>, @CurrentUser() user: AuthUser) {
    return this.dispatch.advance(id, body.stage, user);
  }

  @Requires('deliveries.own')
  @Get('driver/drops')
  mine(@CurrentUser() user: AuthUser) {
    return this.dispatch.myDrops(user);
  }

  /** Drivers deliver their own drops; dispatch can record a delivery on a driver's behalf. */
  @Requires('deliveries.own', 'dispatch.work')
  @Post('dispatch/drops/:id/deliver')
  deliver(@Param('id') id: string, @Body(new ZodPipe(deliverSchema)) body: z.infer<typeof deliverSchema>, @CurrentUser() user: AuthUser) {
    return this.dispatch.deliver(id, body, user);
  }

  @Requires('deliveries.own', 'dispatch.read', 'orders.read')
  @Get('dispatch/drops/:id/photo')
  async photo(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const p = await this.dispatch.photo(id, user);
    res.setHeader('Content-Type', p.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(p.data));
  }
}
