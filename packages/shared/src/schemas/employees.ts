import { z } from 'zod';
import { id, nonEmpty } from './common';

export const employeeSchema = z.object({
  companyId: id,
  name: nonEmpty('Name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  canChooseAddress: z.boolean().default(false),
  canChangeDeliveryTime: z.boolean().default(false),
  canChangePackaging: z.boolean().default(false),
  allergenIds: z.array(id).default([]),
  dietaryTagIds: z.array(id).default([]),
  active: z.boolean().default(true),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export interface CsvImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}
