import { describe, expect, it } from 'vitest';
import { deriveRoundedUp5, formatCents, parseDollars, parseMultiplier } from './money';

describe('deriveRoundedUp5', () => {
  it('rounds up to the next 5 cents, as in the brief ($2.11 → $2.15)', () => {
    expect(deriveRoundedUp5(211, 10_000)).toBe(215);
  });
  it('leaves exact multiples of 5 alone', () => {
    expect(deriveRoundedUp5(215, 10_000)).toBe(215);
    expect(deriveRoundedUp5(0, 24_000)).toBe(0);
  });
  it('cost × 2.4: $3.37 → $8.088 → $8.10', () => {
    expect(deriveRoundedUp5(337, 24_000)).toBe(810);
  });
  it('+15% on $9.99 → $11.4885 → $11.50', () => {
    expect(deriveRoundedUp5(999, 11_500)).toBe(1150);
  });
  it('a hair above a boundary still rounds up (no float drift)', () => {
    // 100 × 1.0001 = 100.01 → 100.05
    expect(deriveRoundedUp5(100, 10_001)).toBe(105);
    // 0.1 + 0.2 style trap: 3 × 1.1 = 3.3 exactly → 5
    expect(deriveRoundedUp5(3, 11_000)).toBe(5);
  });
  it('rejects non-integer inputs', () => {
    expect(() => deriveRoundedUp5(2.5, 10_000)).toThrow();
  });
});

describe('parsing', () => {
  it('parses dollars to cents without floats', () => {
    expect(parseDollars('12.5')).toBe(1250);
    expect(parseDollars('0.07')).toBe(7);
    expect(parseDollars('19.999')).toBeNull();
    expect(parseDollars('-1')).toBeNull();
  });
  it('parses multipliers to basis points', () => {
    expect(parseMultiplier('2.4')).toBe(24_000);
    expect(parseMultiplier('1.15')).toBe(11_500);
  });
  it('formats', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-5)).toBe('-$0.05');
  });
});
