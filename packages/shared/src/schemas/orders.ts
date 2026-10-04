import { z } from 'zod';
import { id, isoDate, minutesOfDay } from './common';
import { ORDER_STATUSES } from '../domain/order-status';

export const choiceSchema = z.object({ groupId: id, optionId: id, portionSizeId: id.nullable().optional() });

export const orderLineSchema = z.object({
  dishId: id,
  quantity: z.number().int().min(1).max(500),
  combinations: z
    .array(z.object({ quantity: z.number().int().min(1).max(500), choices: z.array(choiceSchema).max(50) }))
    .min(1, 'Add at least one combination')
    .max(500, 'Too many combinations'),
});

export const orderDraftSchema = z.object({
  employeeId: id,
  deliveryDate: isoDate,
  /** Omitted fields fall back to company defaults. */
  addressId: id.nullable().optional(),
  deliveryTimeMin: minutesOfDay.nullable().optional(),
  packagingTypeId: id.nullable().optional(),
  notes: z.string().trim().max(500).default(''),
  lines: z.array(orderLineSchema).max(50),
});
export type OrderDraftInput = z.infer<typeof orderDraftSchema>;

export const orderCreateSchema = orderDraftSchema.extend({ place: z.boolean().default(false) });
export const orderUpdateSchema = orderDraftSchema.omit({ employeeId: true }).extend({ version: z.number().int() });

export const orderOverrideSchema = z.object({
  version: z.number().int(),
  addressId: id.optional(),
  deliveryTimeMin: minutesOfDay.optional(),
  packagingTypeId: id.optional(),
});

export const orderListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  companyId: id.optional(),
  invoiced: z.enum(['yes', 'no']).optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const cutoffRunSchema = z.object({ deliveryDate: isoDate });
