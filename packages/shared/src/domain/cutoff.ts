import { IsoDate, WorkCalendar, addDays, isWorkingDay, zonedInstant } from './calendar';

export interface CutoffSettings extends WorkCalendar {
  /** Kitchen working days to count back from the delivery date. */
  cutoffDays: number;
  /** Minutes after local midnight, e.g. 16:00 = 960. */
  cutoffTimeMin: number;
  timeZone: string;
}

/**
 * The date on which orders for `deliveryDate` lock: count back `cutoffDays`
 * kitchen working days, skipping kitchen non-working days and holidays.
 * 2 days, Wednesday delivery → Tuesday (1), Monday (2) → Monday.
 * The delivery date itself never counts. The company calendar plays no part.
 */
export function cutoffDate(deliveryDate: IsoDate, s: CutoffSettings): IsoDate {
  if (s.cutoffDays < 0) throw new Error('cutoffDays must be >= 0');
  let date = deliveryDate;
  let counted = 0;
  for (let guard = 0; counted < s.cutoffDays; guard++) {
    if (guard > 366) throw new Error('No kitchen working days within a year; check settings');
    date = addDays(date, -1);
    if (isWorkingDay(date, s)) counted++;
  }
  return date;
}

export function cutoffInstant(deliveryDate: IsoDate, s: CutoffSettings): Date {
  return zonedInstant(cutoffDate(deliveryDate, s), s.cutoffTimeMin, s.timeZone);
}

export function isPastCutoff(deliveryDate: IsoDate, s: CutoffSettings, now: Date = new Date()): boolean {
  return now.getTime() >= cutoffInstant(deliveryDate, s).getTime();
}
