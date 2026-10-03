import { z } from 'zod';
import { cents, id, nonEmpty } from './common';

export const referenceKinds = ['allergens', 'dietary-tags', 'stations', 'portion-sizes', 'packaging-types'] as const;
export type ReferenceKind = (typeof referenceKinds)[number];

export const referenceSchema = z.object({
  name: nonEmpty('Name'),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const dishSchema = z.object({
  name: nonEmpty('Name'),
  description: z.string().trim().default(''),
  imageUrl: z.string().trim().url('Must be a URL').or(z.literal('')).default(''),
  sku: z.string().trim().regex(/^\d{3,10}$/, 'SKU is a 3 to 10 digit number'),
  temperature: z.enum(['HOT', 'COLD']),
  costCents: cents,
  stationId: id.nullable().default(null),
  minOrderQty: z.number().int().min(1).nullable().default(null),
  active: z.boolean().default(true),
  allergenIds: z.array(id).default([]),
  dietaryTagIds: z.array(id).default([]),
});
export type DishInput = z.infer<typeof dishSchema>;

export const optionSchema = z.object({
  name: nonEmpty('Name'),
  costCents: cents,
  active: z.boolean().default(true),
  allergenIds: z.array(id).default([]),
  dietaryTagIds: z.array(id).default([]),
  /** Sizes this option can be sold in. */
  portionSizeIds: z.array(id).default([]),
});
export type OptionInput = z.infer<typeof optionSchema>;

export const optionGroupSchema = z.object({
  name: nonEmpty('Name'),
  required: z.boolean(),
  sortOrder: z.number().int().default(0),
  usesPortions: z.boolean().default(false),
  optionIds: z.array(id).min(1, 'Add at least one option'),
  portions: z.array(z.object({ portionSizeId: id, extraCents: cents })).default([]),
});
export type OptionGroupInput = z.infer<typeof optionGroupSchema>;
