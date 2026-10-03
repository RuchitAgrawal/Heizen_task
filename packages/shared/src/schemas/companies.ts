import { z } from 'zod';
import { id, isoDate, minutesOfDay, nonEmpty, weekdays } from './common';

/** Domains no company may claim. Checked on the server. */
export const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com',
  'yandex.com', 'zoho.com', 'rediffmail.com',
];

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'Not a valid domain')
  .refine((d) => !PUBLIC_EMAIL_DOMAINS.includes(d), 'Public email domains are not allowed');

export const addressSchema = z.object({
  id: id.optional(),
  label: nonEmpty('Label'),
  line1: nonEmpty('Address'),
  line2: z.string().trim().default(''),
  city: nonEmpty('City'),
  postalCode: nonEmpty('Postal code'),
  isDefault: z.boolean().default(false),
});

export const companySchema = z
  .object({
    name: nonEmpty('Name'),
    domains: z.array(domain).min(1, 'Add at least one email domain'),
    addresses: z.array(addressSchema).min(1, 'Add at least one delivery address'),
    billingName: nonEmpty('Billing contact'),
    billingEmail: z.string().trim().email('Enter a valid email'),
    billingPhone: z.string().trim().default(''),
    ownerEmployeeId: id.nullable().default(null),
    workingDays: weekdays.min(1, 'Pick at least one working day').default([1, 2, 3, 4, 5]),
    defaultDeliveryTimeMin: minutesOfDay,
    deliveryLeadMin: z.number().int().min(0).max(600).default(60),
    defaultPackagingTypeId: id,
    driverInstructions: z.string().trim().default(''),
    defaultDriverId: id.nullable().default(null),
    priceTierId: id.nullable().default(null),
    hiddenCategoryIds: z.array(id).default([]),
    hiddenDishIds: z.array(id).default([]),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.domains).size !== c.domains.length) {
      ctx.addIssue({ code: 'custom', path: ['domains'], message: 'Domains are listed twice' });
    }
  });
export type CompanyInput = z.infer<typeof companySchema>;

export const holidaySchema = z.object({ date: isoDate, name: nonEmpty('Name') });
