import { DateTime } from 'luxon';

/** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

/** A calendar date with no time zone, "YYYY-MM-DD". */
export type IsoDate = string;

export interface WorkCalendar {
  workingDays: readonly number[];
  holidays: ReadonlySet<IsoDate>;
}

export function parseIsoDate(date: IsoDate): DateTime {
  const dt = DateTime.fromISO(date, { zone: 'UTC' });
  if (!dt.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`);
  return dt;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return parseIsoDate(date).plus({ days }).toISODate()!;
}

export function weekdayOf(date: IsoDate): Weekday {
  return parseIsoDate(date).weekday as Weekday;
}

export function isWorkingDay(date: IsoDate, cal: WorkCalendar): boolean {
  return cal.workingDays.includes(weekdayOf(date)) && !cal.holidays.has(date);
}

/** Wall-clock time in a zone → UTC instant. Handles DST via Luxon. */
export function zonedInstant(date: IsoDate, minutesAfterMidnight: number, timeZone: string): Date {
  const d = parseIsoDate(date);
  const dt = DateTime.fromObject(
    { year: d.year, month: d.month, day: d.day, hour: Math.floor(minutesAfterMidnight / 60), minute: minutesAfterMidnight % 60 },
    { zone: timeZone },
  );
  if (!dt.isValid) throw new Error(`Invalid zoned time ${date} ${minutesAfterMidnight} ${timeZone}`);
  return dt.toJSDate();
}

/** The calendar date "today" in the kitchen zone, independent of server and browser zones. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return DateTime.fromJSDate(now).setZone(timeZone).toISODate()!;
}

export function formatMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function parseHhMm(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
