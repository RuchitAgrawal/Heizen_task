import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { employeeSchema, EmployeeInput, pageQuery } from '@fernleaf/shared';
import { z } from 'zod';
import { Requires } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesService } from './employees.service';

const listQuery = pageQuery.extend({ companyId: z.string().optional() });
const importBody = z.object({ companyId: z.string().min(1), csv: z.string().min(1).max(2_000_000) });

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Requires('employees.read', 'orders.write')
  @Get()
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.employees.list(q);
  }

  @Requires('employees.read', 'orders.write')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @Requires('employees.write')
  @Post()
  create(@Body(new ZodPipe(employeeSchema)) body: EmployeeInput) {
    return this.employees.create(body);
  }

  @Requires('employees.write')
  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(employeeSchema)) body: EmployeeInput) {
    return this.employees.update(id, body);
  }

  /** CSV sent as text in JSON, so the API needs no multipart handling. */
  @Requires('employees.write')
  @Post('import')
  import(@Body(new ZodPipe(importBody)) body: z.infer<typeof importBody>) {
    return this.employees.importCsv(body.companyId, body.csv);
  }
}
