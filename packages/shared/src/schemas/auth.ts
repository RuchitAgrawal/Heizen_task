import { z } from 'zod';
import { id } from './common';
import type { Permission } from '../permissions';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface Me {
  id: string;
  email: string;
  name: string;
  role: { id: string; name: string };
  permissions: Permission[];
}

export const staffCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8, 'At least 8 characters'),
  roleId: id,
});
export const staffUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  roleId: id.optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});
