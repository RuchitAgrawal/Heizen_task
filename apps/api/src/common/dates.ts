import type { IsoDate } from '@fernleaf/shared';

/** Prisma maps `date` columns to a JS Date at UTC midnight. These convert both ways. */
export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}
