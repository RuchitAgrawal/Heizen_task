import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { companySchema, CompanyInput, holidaySchema } from '@fernleaf/shared';
import { z } from 'zod';
import { Requires } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Requires('companies.read', 'orders.write', 'billing.read')
  @Get()
  list(@Query('q') q?: string) {
    return this.companies.list(q);
  }

  @Requires('companies.read', 'orders.write')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.companies.get(id);
  }

  @Requires('companies.write')
  @Post()
  create(@Body(new ZodPipe(companySchema)) body: CompanyInput) {
    return this.companies.create(body);
  }

  @Requires('companies.write')
  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(companySchema)) body: CompanyInput) {
    return this.companies.update(id, body);
  }

  @Requires('companies.write')
  @Post(':id/holidays')
  addHoliday(@Param('id') id: string, @Body(new ZodPipe(holidaySchema)) body: z.infer<typeof holidaySchema>) {
    return this.companies.addHoliday(id, body.date, body.name);
  }

  @Requires('companies.write')
  @Delete(':id/holidays/:holidayId')
  removeHoliday(@Param('id') id: string, @Param('holidayId') holidayId: string) {
    return this.companies.removeHoliday(id, holidayId);
  }
}
