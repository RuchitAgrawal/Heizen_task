import { describe, expect, it } from 'vitest';
import { combinationSignature, GroupRule, priceCombination, validateCombinations } from './combinations';

const groups: GroupRule[] = [
  { id: 'rice', name: 'Choose your rice', required: true, usesPortions: false, optionIds: ['brown', 'jeera'], portionExtras: new Map() },
  { id: 'side', name: 'Add a side', required: false, usesPortions: true, optionIds: ['raita'], portionExtras: new Map([['reg', 0], ['lg', 100]]) },
];

describe('validateCombinations', () => {
  it('accepts the brief example: 10 bowls = 6 brown + 4 jeera', () => {
    const issues = validateCombinations(10, [
      { quantity: 6, choices: [{ groupId: 'rice', optionId: 'brown' }] },
      { quantity: 4, choices: [{ groupId: 'rice', optionId: 'jeera' }] },
    ], groups);
    expect(issues).toEqual([]);
  });
  it('rejects quantities that do not add up', () => {
    const issues = validateCombinations(10, [
      { quantity: 6, choices: [{ groupId: 'rice', optionId: 'brown' }] },
      { quantity: 3, choices: [{ groupId: 'rice', optionId: 'jeera' }] },
    ], groups);
    expect(issues.map((i) => i.message)).toContain('Combination quantities add up to 9, expected 10');
  });
  it('rejects a combination missing a required group', () => {
    const issues = validateCombinations(2, [{ quantity: 2, choices: [] }], groups);
    expect(issues).toEqual([{ path: 'combinations.0', message: '"Choose your rice" is required' }]);
  });
  it('rejects options not in the group, two picks in one group, and foreign groups', () => {
    const issues = validateCombinations(1, [{
      quantity: 1,
      choices: [
        { groupId: 'rice', optionId: 'raita' },
        { groupId: 'rice', optionId: 'brown' },
        { groupId: 'other', optionId: 'x' },
      ],
    }], groups);
    expect(issues.map((i) => i.message)).toEqual([
      'Option is not offered in "Choose your rice"',
      'Pick one option for "Choose your rice"',
      'Option group does not belong to this dish',
    ]);
  });
  it('requires a size in a portioned group and forbids one elsewhere', () => {
    const issues = validateCombinations(1, [{
      quantity: 1,
      choices: [
        { groupId: 'rice', optionId: 'brown', portionSizeId: 'lg' },
        { groupId: 'side', optionId: 'raita' },
      ],
    }], groups);
    expect(issues.map((i) => i.message)).toEqual(['"Choose your rice" is not sold in sizes', 'Choose a size for "Add a side"']);
  });
  it('rejects duplicate combinations regardless of choice order', () => {
    const a = [{ groupId: 'rice', optionId: 'brown' }, { groupId: 'side', optionId: 'raita', portionSizeId: 'lg' }];
    const issues = validateCombinations(2, [
      { quantity: 1, choices: a },
      { quantity: 1, choices: [...a].reverse() },
    ], groups);
    expect(issues.map((i) => i.message)).toContain('Duplicate combination; merge the quantities instead');
  });
  it('rejects zero and fractional quantities', () => {
    const issues = validateCombinations(1, [{ quantity: 0.5, choices: [{ groupId: 'rice', optionId: 'brown' }] }], groups);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('pricing and identity', () => {
  it('(dish + options) × quantity', () => {
    expect(priceCombination(1100, [150, 100], 4)).toEqual({ unitCents: 1350, totalCents: 5400 });
  });
  it('signature is order-independent', () => {
    expect(combinationSignature([{ groupId: 'a', optionId: '1' }, { groupId: 'b', optionId: '2' }]))
      .toBe(combinationSignature([{ groupId: 'b', optionId: '2' }, { groupId: 'a', optionId: '1' }]));
  });
});
