import { Injectable } from '@nestjs/common';
import { EmployeeMenu, MenuCategory, MenuDish, MenuGroup } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { notFound } from '../common/errors';
import { PricingService } from '../pricing/pricing.service';

type Db = Tx | PrismaService;

export interface MenuScope {
  /** 'listed' = what the employee browses. 'all' = also secret categories (for order validation). */
  secret: 'listed' | 'all' | { slug: string };
}

/**
 * The single source of truth for what an employee can order and at what price.
 * Order validation calls the same function, so the preview cannot drift from enforcement.
 *
 * A dish is on the menu when: its category is active and not hidden for the company,
 * its category item is active, the dish is active and not hidden for the company,
 * and it has a price on the employee's tier. Options without a price on the tier are
 * dropped from their group; if a required group is left empty the dish cannot be
 * ordered, so it is dropped too.
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async forEmployee(employeeId: string, scope: MenuScope, db: Db = this.prisma): Promise<EmployeeMenu> {
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        allergens: true,
        company: { include: { hiddenCategories: true, hiddenDishes: true } },
      },
    });
    if (!employee) throw notFound('Employee');
    const company = employee.company;
    const { tier, isCompanyTier } = await this.pricing.tierForCompany(company.priceTierId, db);
    const book = await this.pricing.priceBook(tier.id, db);

    const hiddenCats = new Set(company.hiddenCategories.map((h) => h.categoryId));
    const hiddenDishes = new Set(company.hiddenDishes.map((h) => h.dishId));
    const myAllergens = new Set(employee.allergens.map((a) => a.id));

    const categories = await db.category.findMany({
      where: { active: true, id: { notIn: [...hiddenCats] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: { active: true, dish: { active: true } },
          orderBy: { sortOrder: 'asc' },
          include: {
            dish: {
              include: {
                allergens: true,
                dietaryTags: true,
                groups: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    items: {
                      orderBy: { sortOrder: 'asc' },
                      include: { option: { include: { allergens: true, dietaryTags: true, portionSizes: true } } },
                    },
                    portions: { include: { portionSize: true }, orderBy: { portionSize: { sortOrder: 'asc' } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    let excludedForNoPrice = 0;
    const out: MenuCategory[] = [];
    for (const c of categories) {
      const include =
        !c.secret || scope.secret === 'all' || (typeof scope.secret === 'object' && scope.secret.slug === c.slug);
      if (!include) continue;

      const dishes: MenuDish[] = [];
      for (const item of c.items) {
        const d = item.dish;
        if (hiddenDishes.has(d.id)) continue;
        const price = book.dish.get(d.id)?.cents;
        if (price == null) {
          excludedForNoPrice++;
          continue;
        }
        const groups: MenuGroup[] = d.groups.map((g) => ({
          id: g.id,
          name: g.name,
          required: g.required,
          usesPortions: g.usesPortions,
          portions: g.portions
            .filter((p) => p.portionSize.active)
            .map((p) => ({ portionSizeId: p.portionSizeId, name: p.portionSize.name, extraCents: p.extraCents })),
          options: g.items
            .filter((i) => i.option.active && book.option.get(i.optionId)?.cents != null)
            .map((i) => ({
              id: i.option.id,
              name: i.option.name,
              priceCents: book.option.get(i.optionId)!.cents!,
              allergens: i.option.allergens.map((a) => a.name),
              dietaryTags: i.option.dietaryTags.map((t) => t.name),
              portionSizeIds: i.option.portionSizes.map((p) => p.id),
            })),
        }));
        if (groups.some((g) => g.required && (g.options.length === 0 || (g.usesPortions && g.portions.length === 0)))) {
          excludedForNoPrice++;
          continue;
        }
        dishes.push({
          id: d.id,
          name: d.name,
          description: d.description,
          imageUrl: d.imageUrl,
          temperature: d.temperature,
          priceCents: price,
          minOrderQty: d.minOrderQty,
          allergens: d.allergens.map((a) => a.name),
          dietaryTags: d.dietaryTags.map((t) => t.name),
          allergenConflicts: d.allergens.filter((a) => myAllergens.has(a.id)).map((a) => a.name),
          groups,
        });
      }
      if (dishes.length) out.push({ id: c.id, name: c.name, slug: c.slug, secret: c.secret, dishes });
    }

    return {
      employeeId,
      companyId: company.id,
      tier: { id: tier.id, name: tier.name, isCompanyTier },
      categories: out,
      excludedForNoPrice,
    };
  }

  /** Orderable dishes keyed by id, including secret categories (reachable = orderable). */
  async orderableDishes(employeeId: string, db: Db = this.prisma) {
    const menu = await this.forEmployee(employeeId, { secret: 'all' }, db);
    const dishes = new Map<string, MenuDish>();
    for (const c of menu.categories) for (const d of c.dishes) dishes.set(d.id, d);
    return { menu, dishes };
  }
}
