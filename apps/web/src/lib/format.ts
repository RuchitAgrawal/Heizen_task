import { formatCents, formatMinutes } from '@fernleaf/shared';

export const money = formatCents;
export const hhmm = formatMinutes;

/** Instants are always shown in the kitchen time zone, whatever the browser's zone is. */
export function time(value: string | Date | null | undefined, tz: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function dateTime(value: string | Date | null | undefined, tz: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

/** "2026-10-05" → "Mon 5 Oct". Calendar dates have no zone; format them as UTC. */
export function day(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00Z`));
}

export function pct(n: number, d: number) {
  return d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;
}
