import { formatMultiplier } from '@fernleaf/shared';

interface TierRuleView { rule: 'MANUAL' | 'COST_MULTIPLIER' | 'TIER_MARKUP'; multiplierBp: number | null; baseTier: { name: string } | null }

export function ruleText(t: TierRuleView) {
  if (t.rule === 'MANUAL') return 'Typed in';
  if (t.rule === 'COST_MULTIPLIER') return `Cost × ${formatMultiplier(t.multiplierBp!)}`;
  const pctChange = Math.round((t.multiplierBp! - 10_000) / 100 * 100) / 100;
  return `${t.baseTier?.name} ${pctChange >= 0 ? '+' : ''}${pctChange}%`;
}

