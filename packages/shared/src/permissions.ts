/**
 * Every server check is against a permission, never a role name.
 * Roles are rows in the database that hold a list of these.
 */
export const PERMISSIONS = [
  'catalog.read',
  'catalog.write',
  'pricing.read',
  'pricing.write',
  'menu.read',
  'menu.write',
  'companies.read',
  'companies.write',
  'employees.read',
  'employees.write',
  'orders.read',
  'orders.write',
  'orders.override',
  'cutoff.run',
  'kitchen.read',
  'kitchen.work',
  'kitchen.forceComplete',
  'dispatch.read',
  'dispatch.work',
  'deliveries.own',
  'billing.read',
  'billing.write',
  'settings.read',
  'settings.write',
  'staff.manage',
  'dashboard.admin',
  'dashboard.kitchen',
  'dashboard.dispatch',
  'dashboard.driver',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Seed presets. Editing these does not change existing roles; roles live in the DB. */
export const ROLE_PRESETS: Record<string, { label: string; permissions: Permission[] }> = {
  admin: {
    label: 'Admin',
    // Everything except the driver-only scope and other roles' landing pages.
    permissions: PERMISSIONS.filter(
      (p) => p !== 'deliveries.own' && p !== 'dashboard.kitchen' && p !== 'dashboard.dispatch' && p !== 'dashboard.driver',
    ),
  },
  kitchen: {
    label: 'Kitchen',
    permissions: ['dashboard.kitchen', 'kitchen.read', 'kitchen.work', 'catalog.read', 'orders.read', 'settings.read'],
  },
  dispatch: {
    label: 'Dispatch',
    permissions: ['dashboard.dispatch', 'dispatch.read', 'dispatch.work', 'kitchen.read', 'orders.read', 'companies.read', 'settings.read'],
  },
  driver: { label: 'Driver', permissions: ['dashboard.driver', 'deliveries.own'] },
};

/** First dashboard a user can see, in this order. */
export const DASHBOARD_ORDER: { permission: Permission; path: string }[] = [
  { permission: 'dashboard.admin', path: '/dashboard/admin' },
  { permission: 'dashboard.kitchen', path: '/dashboard/kitchen' },
  { permission: 'dashboard.dispatch', path: '/dashboard/dispatch' },
  { permission: 'dashboard.driver', path: '/driver' },
];
