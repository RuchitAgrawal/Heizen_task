import { z } from 'zod';
import { cents, id, isoDate, minutesOfDay } from './common';

export const boardQuery = z.object({ date: isoDate.optional(), stationId: z.string().optional() });

export const dropKeySchema = z.object({
  deliveryDate: isoDate,
  companyId: id,
  addressId: id,
  deliveryTimeMin: minutesOfDay,
});
export type DropKey = z.infer<typeof dropKeySchema>;

export const assignDriverSchema = dropKeySchema.extend({ driverId: id.nullable() });
export const dropAdvanceSchema = dropKeySchema.extend({
  stage: z.enum(['DISPATCH_READY', 'OUT_FOR_DELIVERY']),
});
export const deliverSchema = dropKeySchema.extend({
  note: z.string().trim().max(1000).default(''),
  /** data: URL of a compressed JPEG, at most ~1.5 MB. */
  photoDataUrl: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Photo must be an image')
    .max(2_000_000, 'Photo is too large')
    .nullable()
    .default(null),
});

export const invoiceCreateSchema = z.object({
  companyId: id,
  orderIds: z.array(id).default([]),
  adjustmentIds: z.array(id).default([]),
}).refine((v) => v.orderIds.length + v.adjustmentIds.length > 0, 'Select at least one order');

export const adjustmentSchema = z.object({
  orderId: id,
  /** Negative = credit to the company. */
  amountCents: z.number().int().min(-100_000_00).max(100_000_00).refine((v) => v !== 0, 'Amount cannot be zero'),
  reason: z.string().trim().min(3, 'Give a reason'),
});

export { cents };
