import { z } from 'zod';
import { id, isoDate, nonEmpty } from './common';

export const categorySchema = z.object({
  name: nonEmpty('Name'),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and dashes'),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  secret: z.boolean().default(false),
});

export const categoryItemsSchema = z.object({
  items: z.array(z.object({ dishId: id, sortOrder: z.number().int(), active: z.boolean() })),
});

export const menuPreviewQuery = z.object({
  employeeId: id,
  /** Secret categories are included only when reached by slug. */
  categorySlug: z.string().optional(),
  date: isoDate.optional(),
});

export interface MenuOption {
  id: string;
  name: string;
  priceCents: number;
  allergens: string[];
  dietaryTags: string[];
  portionSizeIds: string[];
}
export interface MenuGroup {
  id: string;
  name: string;
  required: boolean;
  usesPortions: boolean;
  portions: { portionSizeId: string; name: string; extraCents: number }[];
  options: MenuOption[];
}
export interface MenuDish {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  temperature: 'HOT' | 'COLD';
  priceCents: number;
  minOrderQty: number | null;
  allergens: string[];
  dietaryTags: string[];
  /** Allergens on the dish that the employee is allergic to. */
  allergenConflicts: string[];
  groups: MenuGroup[];
}
export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  secret: boolean;
  dishes: MenuDish[];
}
export interface EmployeeMenu {
  employeeId: string;
  companyId: string;
  tier: { id: string; name: string; isCompanyTier: boolean };
  categories: MenuCategory[];
  /** Dishes left out because the tier has no price, so staff can see why. */
  excludedForNoPrice: number;
}
