/** All money is integer cents. Multipliers are integer basis points (1.0 = 10_000). */
export type Cents = number;

export const BP_ONE = 10_000;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`Not an integer cent amount: ${value}`);
  return value;
}

/** ceil(a / b) for non-negative integers, without going through floats. */
function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/** base × (bp / 10_000), rounded up to the next 5 cents. 211 → 215, 215 → 215. */
export function deriveRoundedUp5(baseCents: Cents, multiplierBp: number): Cents {
  assertCents(baseCents);
  assertCents(multiplierBp);
  if (baseCents < 0 || multiplierBp < 0) throw new Error('Negative price derivation');
  return ceilDiv(baseCents * multiplierBp, BP_ONE * 5) * 5;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => acc + assertCents(v), 0);
}

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** "12.5" → 1250. Rejects more than 2 decimals instead of rounding silently. */
export function parseDollars(input: string): Cents | null {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** "2.4" → 24000 bp, "15%" markup is passed as "1.15". Up to 4 decimals. */
export function parseMultiplier(input: string): number | null {
  const m = /^\s*(\d+)(?:\.(\d{1,4}))?\s*$/.exec(input);
  if (!m) return null;
  return Number(m[1]) * BP_ONE + Number((m[2] ?? '').padEnd(4, '0'));
}

export function formatMultiplier(bp: number): string {
  return (bp / BP_ONE).toString();
}
