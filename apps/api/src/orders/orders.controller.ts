import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  cutoffRunSchema, isoDate, orderCreateSchema, orderListQuery, orderOverrideSchema, orderUpdateSchema, OrderListQuery,
} from '@fernleaf/shared';
import { z } from 'zod';
import { CurrentUser, Requires } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { OrdersService } from './orders.service';
import { CutoffService } from './cutoff.service';

const versionBody = z.object({ version: z.number().int() });
const cancelBody = versionBody.extend({ reason: z.string().trim().max(300).default('') });
const rangeQuery = z.object({ from: isoDate, to: isoDate });

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly cutoff: CutoffService,
  ) {}

  @Requires('orders.read')
  @Get()
  list(@Query(new ZodPipe(orderListQuery)) q: OrderListQuery) {
    return this.orders.list(q);
  }

  @Requires('cutoff.run')
  @Get('cutoff/status')
  cutoffStatus(@Query(new ZodPipe(rangeQuery)) q: z.infer<typeof rangeQuery>) {
    return this.cutoff.status(q.from, q.to);
  }

  @Requires('cutoff.run')
  @Post('cutoff/run')
  runCutoff(@Body(new ZodPipe(cutoffRunSchema)) body: z.infer<typeof cutoffRunSchema>, @CurrentUser() user: AuthUser) {
    return this.cutoff.process(body.deliveryDate, 'manual', user);
  }

  @Requires('orders.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.get(id, user);
  }

  @Requires('orders.write')
  @Post()
  create(@Body(new ZodPipe(orderCreateSchema)) body: z.infer<typeof orderCreateSchema>, @CurrentUser() user: AuthUser) {
    return this.orders.create(body, user);
  }

  @Requires('orders.write')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(orderUpdateSchema.extend({ place: z.boolean().optional() }))) body: z.infer<typeof orderUpdateSchema> & { place?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.update(id, body, user);
  }

  @Requires('orders.write')
  @Post(':id/place')
  place(@Param('id') id: string, @Body(new ZodPipe(versionBody)) body: z.infer<typeof versionBody>, @CurrentUser() user: AuthUser) {
    return this.orders.place(id, body.version, user);
  }

  @Requires('orders.write')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body(new ZodPipe(cancelBody)) body: z.infer<typeof cancelBody>, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, body.version, body.reason, user);
  }

  @Requires('orders.override')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body(new ZodPipe(cancelBody)) body: z.infer<typeof cancelBody>, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, body.version, body.reason, user, 'REJECTED');
  }

  @Requires('orders.override')
  @Post(':id/override')
  override(@Param('id') id: string, @Body(new ZodPipe(orderOverrideSchema)) body: z.infer<typeof orderOverrideSchema>, @CurrentUser() user: AuthUser) {
    return this.orders.override(id, body, user);
  }
}
