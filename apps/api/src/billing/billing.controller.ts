import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { adjustmentSchema, invoiceCreateSchema, pageQuery } from '@fernleaf/shared';
import { z } from 'zod';
import { CurrentUser, Requires } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { BillingService } from './billing.service';

const listQuery = pageQuery.extend({ companyId: z.string().optional(), status: z.enum(['ISSUED', 'PAID']).optional() });

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Requires('billing.read')
  @Get('summary')
  summary() {
    return this.billing.summary();
  }

  @Requires('billing.read')
  @Get('queue/:companyId')
  queue(@Param('companyId') companyId: string) {
    return this.billing.queue(companyId);
  }

  @Requires('billing.read')
  @Get('invoices')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.billing.list(q);
  }

  @Requires('billing.read')
  @Get('invoices/:id')
  get(@Param('id') id: string) {
    return this.billing.get(id);
  }

  @Requires('billing.write')
  @Post('invoices')
  create(@Body(new ZodPipe(invoiceCreateSchema)) body: z.infer<typeof invoiceCreateSchema>, @CurrentUser() user: AuthUser) {
    return this.billing.create(body, user);
  }

  @Requires('billing.write')
  @Post('invoices/:id/paid')
  paid(@Param('id') id: string) {
    return this.billing.markPaid(id);
  }

  @Requires('billing.write')
  @Post('adjustments')
  adjust(@Body(new ZodPipe(adjustmentSchema)) body: z.infer<typeof adjustmentSchema>, @CurrentUser() user: AuthUser) {
    return this.billing.addAdjustment(body, user);
  }
}
