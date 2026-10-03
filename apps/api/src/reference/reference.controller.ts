import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { referenceKinds, referenceSchema, ReferenceKind } from '@fernleaf/shared';
import { z } from 'zod';
import { Requires } from '../auth/decorators';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { notFound } from '../common/errors';

type RefInput = z.infer<typeof referenceSchema>;

/**
 * Allergens, dietary tags, stations, portion sizes and packaging types share one shape
 * (name, order, active), so they share one controller. Deactivate rather than delete:
 * catalogue rows and orders point at them.
 */
@Controller('reference')
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(kind: ReferenceKind) {
    const map = {
      allergens: this.prisma.allergen,
      'dietary-tags': this.prisma.dietaryTag,
      stations: this.prisma.kitchenStation,
      'portion-sizes': this.prisma.portionSize,
      'packaging-types': this.prisma.packagingType,
    } as const;
    // Each delegate has the same name/sortOrder/active columns; the union is not callable, so narrow to one.
    return map[kind] as unknown as typeof this.prisma.allergen;
  }

  /** Reference lists are needed to render most screens, so any read permission is enough. */
  @Requires('catalog.read', 'companies.read', 'employees.read', 'orders.read', 'kitchen.read', 'dispatch.read')
  @Get()
  async all() {
    const entries = await Promise.all(
      referenceKinds.map(async (k) => [k, await this.delegate(k).findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })] as const),
    );
    return Object.fromEntries(entries);
  }

  @Requires('catalog.write')
  @Post(':kind')
  create(@Param('kind', new ZodPipe(z.enum(referenceKinds))) kind: ReferenceKind, @Body(new ZodPipe(referenceSchema)) body: RefInput) {
    return this.delegate(kind).create({ data: body });
  }

  @Requires('catalog.write')
  @Put(':kind/:id')
  async update(
    @Param('kind', new ZodPipe(z.enum(referenceKinds))) kind: ReferenceKind,
    @Param('id') id: string,
    @Body(new ZodPipe(referenceSchema)) body: RefInput,
  ) {
    const d = this.delegate(kind);
    if (!(await d.findUnique({ where: { id } }))) throw notFound('Item');
    return d.update({ where: { id }, data: body });
  }
}
