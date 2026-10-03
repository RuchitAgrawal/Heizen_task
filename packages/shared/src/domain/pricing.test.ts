import { describe, expect, it } from 'vitest';
import { resolvePrice, TierDef, wouldCreateCycle, effectiveTierId } from './pricing';

const tiers = new Map<string, TierDef>([
  ['std', { id: 'std', rule: 'MANUAL', multiplierBp: null, baseTierId: null }],
  ['cost', { id: 'cost', rule: 'COST_MULTIPLIER', multiplierBp: 24_000, baseTierId: null }],
  ['ent', { id: 'ent', rule: 'TIER_MARKUP', multiplierBp: 11_500, baseTierId: 'std' }],
  ['ent2', { id: 'ent2', rule: 'TIER_MARKUP', multiplierBp: 9_000, baseTierId: 'ent' }],
]);

describe('resolvePrice', () => {
  it('manual tier: stored price, or no price at all', () => {
    expect(resolvePrice('std', tiers, 400, new Map([['std', 1099]]))).toEqual({ cents: 1099, source: 'OVERRIDE' });
    expect(resolvePrice('std', tiers, 400, new Map())).toEqual({ cents: null, source: 'NONE' });
  });
  it('cost multiplier rounds up to 5 cents', () => {
    expect(resolvePrice('cost', tiers, 337, new Map())).toEqual({ cents: 810, source: 'DERIVED' });
  });
  it('markup of another tier: Standard + 15%', () => {
    expect(resolvePrice('ent', tiers, 400, new Map([['std', 999]]))).toEqual({ cents: 1150, source: 'DERIVED' });
  });
  it('markup with no base price has no price (dish hidden, not $0)', () => {
    expect(resolvePrice('ent', tiers, 400, new Map()).cents).toBeNull();
  });
  it('override on a derived tier wins', () => {
    expect(resolvePrice('ent', tiers, 400, new Map([['std', 999], ['ent', 1000]]))).toEqual({ cents: 1000, source: 'OVERRIDE' });
  });
  it('chains derive from the rounded base: 999 → 1150 → 1035', () => {
    expect(resolvePrice('ent2', tiers, 400, new Map([['std', 999]])).cents).toBe(1035);
  });
  it('a chain uses an override in the middle', () => {
    expect(resolvePrice('ent2', tiers, 400, new Map([['ent', 2000]])).cents).toBe(1800);
  });
  it('unknown tier has no price', () => {
    expect(resolvePrice('nope', tiers, 400, new Map()).cents).toBeNull();
  });
  it('detects cycles instead of recursing forever', () => {
    const bad = new Map<string, TierDef>([
      ['a', { id: 'a', rule: 'TIER_MARKUP', multiplierBp: 10_000, baseTierId: 'b' }],
      ['b', { id: 'b', rule: 'TIER_MARKUP', multiplierBp: 10_000, baseTierId: 'a' }],
    ]);
    expect(() => resolvePrice('a', bad, 1, new Map())).toThrow(/cycle/);
  });
});

describe('wouldCreateCycle', () => {
  it('rejects pointing a tier at its own descendant', () => {
    expect(wouldCreateCycle('std', 'ent2', tiers)).toBe(true);
    expect(wouldCreateCycle('std', 'std', tiers)).toBe(true);
    expect(wouldCreateCycle('cost', 'ent2', tiers)).toBe(false);
  });
});

describe('effectiveTierId', () => {
  it('company tier, else default', () => {
    expect(effectiveTierId('ent', 'std')).toBe('ent');
    expect(effectiveTierId(null, 'std')).toBe('std');
  });
});
