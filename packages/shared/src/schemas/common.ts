import { z } from 'zod';

export const id = z.string().min(1);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const cents = z.number().int('Must be whole cents').min(0, 'Cannot be negative').max(100_000_00);
export const minutesOfDay = z.number().int().min(0).max(24 * 60 - 1);
export const weekdays = z.array(z.number().int().min(1).max(7)).max(7);
export const nonEmpty = (label: string) => z.string().trim().min(1, `${label} is required`);

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().optional(),
});

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Shape of every error the API returns. */
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}
