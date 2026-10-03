import { z } from 'zod';
import { cents, id, nonEmpty } from './common';

export const tierSchema = z
  .object({
    name: nonEmpty('Name'),
    rule: z.enum(['MANUAL', 'COST_MULTIPLIER', 'TIER_MARKUP']),
    multiplierBp: z.number().int().min(1).max(1_000_000).nullable().default(null),
    baseTierId: id.nullable().default(null),
  })
  .superRefine((t, ctx) => {
    if (t.rule !== 'MANUAL' && t.multiplierBp === null) {
      ctx.addIssue({ code: 'custom', path: ['multiplierBp'], message: 'A derived tier needs a multiplier' });
    }
    if (t.rule === 'TIER_MARKUP' && !t.baseTierId) {
      ctx.addIssue({ code: 'custom', path: ['baseTierId'], message: 'Choose the tier to mark up' });
    }
  });
export type TierInput = z.infer<typeof tierSchema>;

/** Bulk edit of one tier's grid. cents = null removes the stored price (falls back to derived, or none). */
export const priceUpdatesSchema = z.object({
  updates: z
    .array(z.object({ kind: z.enum(['dish', 'option']), itemId: id, cents: cents.nullable() }))
    .min(1)
    .max(1000),
});
export type PriceUpdatesInput = z.infer<typeof priceUpdatesSchema>;

export interface TierGridRow {
  kind: 'dish' | 'option';
  itemId: string;
  name: string;
  sku: string | null;
  active: boolean;
  costCents: number;
  storedCents: number | null;
  effectiveCents: number | null;
  source: 'OVERRIDE' | 'DERIVED' | 'NONE';
}
