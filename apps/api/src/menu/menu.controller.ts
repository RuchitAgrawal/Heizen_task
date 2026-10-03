import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { categoryItemsSchema, categorySchema, menuPreviewQuery } from '@fernleaf/shared';
import { z } from 'zod';
import { Requires } from '../auth/decorators';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { invalid, notFound } from '../common/errors';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
  ) {}

  @Requires('menu.read', 'orders.write')
  @Get('preview')
  preview(@Query(new ZodPipe(menuPreviewQuery)) q: z.infer<typeof menuPreviewQuery>) {
    return this.menu.forEmployee(q.employeeId, { secret: q.categorySlug ? { slug: q.categorySlug } : 'listed' });
  }

  /** Dishes an employee can order, including secret categories. Used by the order form. */
  @Requires('orders.write')
  @Get('orderable/:employeeId')
  orderable(@Param('employeeId') employeeId: string) {
    return this.menu.forEmployee(employeeId, { secret: 'all' });
  }

  @Requires('menu.read')
  @Get('categories')
  categories() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { dish: { select: { id: true, name: true, sku: true, active: true } } } },
        hiddenFor: { include: { company: { select: { id: true, name: true } } } },
      },
    });
  }

  @Requires('menu.write')
  @Post('categories')
  create(@Body(new ZodPipe(categorySchema)) body: z.infer<typeof categorySchema>) {
    return this.prisma.category.create({ data: body });
  }

  @Requires('menu.write')
  @Put('categories/:id')
  async update(@Param('id') id: string, @Body(new ZodPipe(categorySchema)) body: z.infer<typeof categorySchema>) {
    if (!(await this.prisma.category.findUnique({ where: { id } }))) throw notFound('Category');
    return this.prisma.category.update({ where: { id }, data: body });
  }

  /** Replaces the category's item list (order, active flag) in one go. */
  @Requires('menu.write')
  @Put('categories/:id/items')
  async setItems(@Param('id') id: string, @Body(new ZodPipe(categoryItemsSchema)) body: z.infer<typeof categoryItemsSchema>) {
    const ids = body.items.map((i) => i.dishId);
    if (new Set(ids).size !== ids.length) throw invalid('A dish is listed twice in this category');
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.category.findUnique({ where: { id } }))) throw notFound('Category');
      await tx.categoryItem.deleteMany({ where: { categoryId: id, dishId: { notIn: ids } } });
      for (const item of body.items) {
        await tx.categoryItem.upsert({
          where: { categoryId_dishId: { categoryId: id, dishId: item.dishId } },
          create: { categoryId: id, ...item },
          update: { sortOrder: item.sortOrder, active: item.active },
        });
      }
      return tx.category.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    });
  }
}
