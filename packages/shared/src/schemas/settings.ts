import { z } from 'zod';
import { minutesOfDay, weekdays } from './common';

export const settingsSchema = z.object({
  timeZone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone'),
  cutoffTimeMin: minutesOfDay,
  cutoffDays: z.number().int().min(0).max(14),
  workingDays: weekdays.min(1, 'Pick at least one kitchen day'),
  kitchenBufferMin: z.number().int().min(0).max(240),
  atRiskWindowMin: z.number().int().min(0).max(240),
  onTimeGraceMin: z.number().int().min(0).max(120),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
