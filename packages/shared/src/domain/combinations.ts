import { Cents, multiplyCents, sumCents } from './money';

export interface GroupRule {
  id: string;
  name: string;
  required: boolean;
  usesPortions: boolean;
  optionIds: readonly string[];
  /** portionSizeId → extra charge for this group. Empty if the group does not use portions. */
  portionExtras: ReadonlyMap<string, Cents>;
}

export interface Choice {
  groupId: string;
  optionId: string;
  portionSizeId?: string | null;
}

export interface CombinationInput {
  quantity: number;
  choices: readonly Choice[];
}

export interface LineIssue {
  path: string;
  message: string;
}

/**
 * Validates an order line split into combinations:
 * quantities are positive integers that add up to the line quantity, every required group
 * is answered once, chosen options belong to their group, portions match the group.
 */
export function validateCombinations(
  lineQuantity: number,
  combinations: readonly CombinationInput[],
  groups: readonly GroupRule[],
): LineIssue[] {
  const issues: LineIssue[] = [];
  if (!Number.isInteger(lineQuantity) || lineQuantity < 1) {
    issues.push({ path: 'quantity', message: 'Quantity must be a whole number of at least 1' });
  }
  if (combinations.length === 0) {
    issues.push({ path: 'combinations', message: 'Add at least one combination' });
  }
  const byId = new Map(groups.map((g) => [g.id, { ...g, optionIds: new Set(g.optionIds) }]));
  let total = 0;
  const seenSignatures = new Set<string>();

  combinations.forEach((combo, i) => {
    const at = `combinations.${i}`;
    if (!Number.isInteger(combo.quantity) || combo.quantity < 1) {
      issues.push({ path: `${at}.quantity`, message: 'Each combination needs a quantity of at least 1' });
    } else {
      total += combo.quantity;
    }
    const answered = new Set<string>();
    combo.choices.forEach((c, j) => {
      const g = byId.get(c.groupId);
      if (!g) return issues.push({ path: `${at}.choices.${j}`, message: 'Option group does not belong to this dish' });
      if (answered.has(g.id)) return issues.push({ path: `${at}.choices.${j}`, message: `Pick one option for "${g.name}"` });
      answered.add(g.id);
      if (!g.optionIds.has(c.optionId)) {
        issues.push({ path: `${at}.choices.${j}`, message: `Option is not offered in "${g.name}"` });
      }
      if (g.usesPortions && (!c.portionSizeId || !g.portionExtras.has(c.portionSizeId))) {
        issues.push({ path: `${at}.choices.${j}`, message: `Choose a size for "${g.name}"` });
      }
      if (!g.usesPortions && c.portionSizeId) {
        issues.push({ path: `${at}.choices.${j}`, message: `"${g.name}" is not sold in sizes` });
      }
    });
    for (const g of groups) {
      if (g.required && !answered.has(g.id)) {
        issues.push({ path: at, message: `"${g.name}" is required` });
      }
    }
    const sig = combinationSignature(combo.choices);
    if (seenSignatures.has(sig)) {
      issues.push({ path: at, message: 'Duplicate combination; merge the quantities instead' });
    }
    seenSignatures.add(sig);
  });

  if (combinations.length > 0 && total !== lineQuantity) {
    issues.push({ path: 'combinations', message: `Combination quantities add up to ${total}, expected ${lineQuantity}` });
  }
  return issues;
}

/** Stable identity of a combination: same choices in any order → same signature. */
export function combinationSignature(choices: readonly Choice[]): string {
  return choices
    .map((c) => `${c.groupId}:${c.optionId}:${c.portionSizeId ?? ''}`)
    .sort()
    .join('|');
}

/** (dish price + option prices + portion extras) × quantity. */
export function priceCombination(dishCents: Cents, choiceCents: readonly Cents[], quantity: number): {
  unitCents: Cents;
  totalCents: Cents;
} {
  const unitCents = sumCents([dishCents, ...choiceCents]);
  return { unitCents, totalCents: multiplyCents(unitCents, quantity) };
}
