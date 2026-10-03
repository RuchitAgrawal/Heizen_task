import { z } from 'zod';
import { cents, id, isoDate } from './common';

export const boardQuery = z.object({ date: isoDate.optional(), stationId: z.string().optional() });

export const assignDriverSchema = z.object({ driverId: id.nullable() });
export const dropAdvanceSchema = z.object({ stage: z.enum(['DISPATCH_READY', 'OUT_FOR_DELIVERY']) });
export const deliverSchema = z.object({
  note: z.string().trim().max(1000).default(''),
  /** data: URL of a JPEG/PNG/WebP, compressed in the browser. */
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
