import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { staffCreateSchema, staffUpdateSchema } from '@fernleaf/shared';
import { z } from 'zod';
import { Requires } from '../auth/decorators';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { notFound } from '../common/errors';

const publicFields = { id: true, email: true, name: true, active: true, roleId: true, role: { select: { id: true, name: true } } } as const;

@Controller('staff')
export class StaffController {
  constructor(private readonly prisma: PrismaService) {}

  @Requires('staff.manage')
  @Get()
  list() {
    return this.prisma.staffUser.findMany({ select: publicFields, orderBy: { name: 'asc' } });
  }

  @Requires('staff.manage')
  @Get('roles')
  roles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  /** Staff who can take deliveries: anyone whose role has deliveries.own. No role names involved. */
  @Requires('dispatch.read', 'companies.read')
  @Get('drivers')
  drivers() {
    return this.prisma.staffUser.findMany({
      where: { active: true, role: { permissions: { has: 'deliveries.own' } } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  @Requires('staff.manage')
  @Post()
  async create(@Body(new ZodPipe(staffCreateSchema)) body: z.infer<typeof staffCreateSchema>) {
    const { password, ...rest } = body;
    return this.prisma.staffUser.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, 10) },
      select: publicFields,
    });
  }

  @Requires('staff.manage')
  @Patch(':id')
  async update(@Param('id') id: string, @Body(new ZodPipe(staffUpdateSchema)) body: z.infer<typeof staffUpdateSchema>) {
    if (!(await this.prisma.staffUser.findUnique({ where: { id } }))) throw notFound('Staff member');
    const { password, ...rest } = body;
    return this.prisma.staffUser.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select: publicFields,
    });
  }
}
