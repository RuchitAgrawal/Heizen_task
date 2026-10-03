import { Cents, deriveRoundedUp5 } from './money';

export type TierRule = 'MANUAL' | 'COST_MULTIPLIER' | 'TIER_MARKUP';

export interface TierDef {
  id: string;
  rule: TierRule;
  /** Basis points. COST_MULTIPLIER: cost × m. TIER_MARKUP: base tier price × m. */
  multiplierBp: number | null;
  baseTierId: string | null;
}

export type PriceSource = 'OVERRIDE' | 'DERIVED' | 'NONE';

export interface ResolvedPrice {
  cents: Cents | null;
  source: PriceSource;
}

/**
 * Effective price of one item (dish or option) on one tier.
 * A stored price always wins (manual tier value or a staff override on a derived tier).
 * Otherwise a derived tier computes from cost or from its base tier, rounding up to 5 cents.
 * A MANUAL tier with no stored price has no price: the item is not sold on that tier.
 */
export function resolvePrice(
  tierId: string,
  tiers: ReadonlyMap<string, TierDef>,
  costCents: Cents,
  storedByTier: ReadonlyMap<string, Cents>,
  seen: Set<string> = new Set(),
): ResolvedPrice {
  const stored = storedByTier.get(tierId);
  if (stored !== undefined) return { cents: stored, source: 'OVERRIDE' };

  const tier = tiers.get(tierId);
  if (!tier || tier.rule === 'MANUAL' || tier.multiplierBp === null) {
    return { cents: null, source: 'NONE' };
  }
  if (seen.has(tierId)) throw new Error(`Price tier cycle at ${tierId}`);
  seen.add(tierId);

  if (tier.rule === 'COST_MULTIPLIER') {
    return { cents: deriveRoundedUp5(costCents, tier.multiplierBp), source: 'DERIVED' };
  }
  if (!tier.baseTierId) return { cents: null, source: 'NONE' };
  const base = resolvePrice(tier.baseTierId, tiers, costCents, storedByTier, seen);
  if (base.cents === null) return { cents: null, source: 'NONE' };
  return { cents: deriveRoundedUp5(base.cents, tier.multiplierBp), source: 'DERIVED' };
}

/** True if pointing `tierId` at `baseTierId` would create a cycle. */
export function wouldCreateCycle(
  tierId: string,
  baseTierId: string,
  tiers: ReadonlyMap<string, TierDef>,
): boolean {
  let cursor: string | null = baseTierId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === tierId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = tiers.get(cursor)?.rule === 'TIER_MARKUP' ? (tiers.get(cursor)?.baseTierId ?? null) : null;
  }
  return false;
}

/** Employee's tier: their company's tier, else the default tier. */
export function effectiveTierId(companyTierId: string | null, defaultTierId: string): string {
  return companyTierId ?? defaultTierId;
}
