import { describe, expect, it } from 'vitest';
import { cutoffDate, cutoffInstant, isPastCutoff, CutoffSettings } from './cutoff';

const base: CutoffSettings = {
  cutoffDays: 2,
  cutoffTimeMin: 16 * 60,
  workingDays: [1, 2, 3, 4, 5],
  holidays: new Set(),
  timeZone: 'America/New_York',
};

describe('cutoffDate', () => {
  it('brief example: 2 working days at 16:00, Wednesday delivery locks Monday', () => {
    expect(cutoffDate('2026-10-07', base)).toBe('2026-10-05'); // Wed → Mon
  });
  it('skips the weekend when counting back', () => {
    expect(cutoffDate('2026-10-05', base)).toBe('2026-10-01'); // Mon → Thu
    expect(cutoffDate('2026-10-06', base)).toBe('2026-10-02'); // Tue → Fri
  });
  it('skips kitchen holidays', () => {
    const s = { ...base, holidays: new Set(['2026-10-05']) };
    expect(cutoffDate('2026-10-07', s)).toBe('2026-10-02'); // Tue, (Mon holiday), Fri
  });
  it('a weekend delivery counts back from the weekend', () => {
    expect(cutoffDate('2026-10-10', base)).toBe('2026-10-08'); // Sat → Fri(1), Thu(2)
  });
  it('0 days means the delivery day itself', () => {
    expect(cutoffDate('2026-10-07', { ...base, cutoffDays: 0 })).toBe('2026-10-07');
  });
  it('honours a 6-day kitchen week', () => {
    expect(cutoffDate('2026-10-05', { ...base, workingDays: [1, 2, 3, 4, 5, 6] })).toBe('2026-10-02'); // Mon → Sat(1), Fri(2)
  });
  it('throws instead of looping forever when there are no working days', () => {
    expect(() => cutoffDate('2026-10-07', { ...base, workingDays: [] })).toThrow();
  });
});

describe('cutoffInstant', () => {
  it('16:00 New York in EDT is 20:00 UTC', () => {
    expect(cutoffInstant('2026-10-07', base).toISOString()).toBe('2026-10-05T20:00:00.000Z');
  });
  it('16:00 New York in EST is 21:00 UTC (DST ends 1 Nov 2026)', () => {
    expect(cutoffInstant('2026-11-04', base).toISOString()).toBe('2026-11-02T21:00:00.000Z');
  });
  it('cut-off spanning a DST change uses the cut-off day offset', () => {
    // Delivery Mon 2 Nov, cut-off Thu 29 Oct (still EDT)
    expect(cutoffInstant('2026-11-02', base).toISOString()).toBe('2026-10-29T20:00:00.000Z');
  });
  it('isPastCutoff is exact to the minute and inclusive at the cut-off', () => {
    expect(isPastCutoff('2026-10-07', base, new Date('2026-10-05T19:59:59Z'))).toBe(false);
    expect(isPastCutoff('2026-10-07', base, new Date('2026-10-05T20:00:00Z'))).toBe(true);
  });
});
