import { Injectable } from '@nestjs/common';
import { DishInput, OptionGroupInput, OptionInput } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { invalid, notFound } from '../common/errors';

const dishInclude = {
  station: true,
  allergens: true,
  dietaryTags: true,
  groups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      items: { orderBy: { sortOrder: 'asc' }, include: { option: { include: { portionSizes: true } } } },
      portions: { include: { portionSize: true }, orderBy: { portionSize: { sortOrder: 'asc' } } },
    },
  },
} as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listDishes(q?: string, includeInactive = true) {
    return this.prisma.dish.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q } }] } : {}),
      },
      include: { station: true, allergens: true, dietaryTags: true, _count: { select: { groups: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async getDish(id: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id }, include: dishInclude });
    if (!dish) throw notFound('Dish');
    return dish;
  }

  createDish(input: DishInput) {
    const { allergenIds, dietaryTagIds, ...rest } = input;
    return this.prisma.dish.create({
      data: {
        ...rest,
        allergens: { connect: allergenIds.map((id) => ({ id })) },
        dietaryTags: { connect: dietaryTagIds.map((id) => ({ id })) },
      },
    });
  }

  async updateDish(id: string, input: DishInput) {
    await this.getDish(id);
    const { allergenIds, dietaryTagIds, ...rest } = input;
    return this.prisma.dish.update({
      where: { id },
      data: {
        ...rest,
        allergens: { set: allergenIds.map((x) => ({ id: x })) },
        dietaryTags: { set: dietaryTagIds.map((x) => ({ id: x })) },
      },
    });
  }

  listOptions() {
    return this.prisma.option.findMany({
      include: { allergens: true, dietaryTags: true, portionSizes: true, _count: { select: { groupItems: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  createOption(input: OptionInput) {
    const { allergenIds, dietaryTagIds, portionSizeIds, ...rest } = input;
    return this.prisma.option.create({
      data: {
        ...rest,
        allergens: { connect: allergenIds.map((id) => ({ id })) },
        dietaryTags: { connect: dietaryTagIds.map((id) => ({ id })) },
        portionSizes: { connect: portionSizeIds.map((id) => ({ id })) },
      },
    });
  }

  async updateOption(id: string, input: OptionInput) {
    const { allergenIds, dietaryTagIds, portionSizeIds, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.option.findUnique({ where: { id } }))) throw notFound('Option');
      // Removing a size is blocked while a portioned group that sells this option needs it.
      const groups = await tx.optionGroup.findMany({
        where: { usesPortions: true, items: { some: { optionId: id } } },
        include: { portions: { include: { portionSize: true } }, dish: true },
      });
      for (const g of groups) {
        const missing = g.portions.filter((p) => !portionSizeIds.includes(p.portionSizeId));
        if (missing.length) {
          throw invalid('This option is sold in sizes it would no longer support', {
            portionSizeIds: `"${g.dish.name} › ${g.name}" needs ${missing.map((m) => m.portionSize.name).join(', ')}`,
          });
        }
      }
      return tx.option.update({
        where: { id },
        data: {
          ...rest,
          allergens: { set: allergenIds.map((x) => ({ id: x })) },
          dietaryTags: { set: dietaryTagIds.map((x) => ({ id: x })) },
          portionSizes: { set: portionSizeIds.map((x) => ({ id: x })) },
        },
      });
    });
  }

  /** Portion rule: a portioned group lists its sizes, and every option in it supports all of them. */
  private async checkGroup(tx: Tx, input: OptionGroupInput) {
    if (new Set(input.optionIds).size !== input.optionIds.length) {
      throw invalid('An option is listed twice', { optionIds: 'Each option can appear once' });
    }
    const options = await tx.option.findMany({ where: { id: { in: input.optionIds } }, include: { portionSizes: true } });
    if (options.length !== input.optionIds.length) throw invalid('Unknown option', { optionIds: 'Unknown option' });
    if (!input.usesPortions) {
      if (input.portions.length) throw invalid('Sizes given for a group without portions', { portions: 'Turn on portions first' });
      return;
    }
    if (!input.portions.length) throw invalid('A portioned group needs sizes', { portions: 'Add at least one size' });
    for (const o of options) {
      const supported = new Set(o.portionSizes.map((p) => p.id));
      const missing = input.portions.filter((p) => !supported.has(p.portionSizeId));
      if (missing.length) {
        throw invalid(`${o.name} does not come in every size this group sells`, {
          optionIds: `${o.name} is missing a size. Add it on the option first.`,
        });
      }
    }
  }

  async createGroup(dishId: string, input: OptionGroupInput) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.dish.findUnique({ where: { id: dishId } }))) throw notFound('Dish');
      await this.checkGroup(tx, input);
      return tx.optionGroup.create({
        data: {
          dishId,
          name: input.name,
          required: input.required,
          sortOrder: input.sortOrder,
          usesPortions: input.usesPortions,
          items: { create: input.optionIds.map((optionId, i) => ({ optionId, sortOrder: i })) },
          portions: { create: input.portions },
        },
      });
    });
  }

  async updateGroup(groupId: string, input: OptionGroupInput) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.optionGroup.findUnique({ where: { id: groupId } }))) throw notFound('Option group');
      await this.checkGroup(tx, input);
      await tx.optionGroupItem.deleteMany({ where: { groupId } });
      await tx.optionGroupPortion.deleteMany({ where: { groupId } });
      return tx.optionGroup.update({
        where: { id: groupId },
        data: {
          name: input.name,
          required: input.required,
          sortOrder: input.sortOrder,
          usesPortions: input.usesPortions,
          items: { create: input.optionIds.map((optionId, i) => ({ optionId, sortOrder: i })) },
          portions: { create: input.portions },
        },
      });
    });
  }

  /** Safe to delete: orders keep their own copy of group and option names. */
  async deleteGroup(groupId: string) {
    await this.prisma.optionGroup.delete({ where: { id: groupId } });
  }
}
