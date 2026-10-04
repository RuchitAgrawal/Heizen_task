'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@fernleaf/shared';
import { useSession } from '@/lib/session';
import { post } from '@/lib/api';
import { day } from '@/lib/format';

/** Each link shows only if the user has one of its permissions. The server enforces the same. */
const NAV: { href: string; label: string; any: Permission[] }[] = [
  { href: '/dashboard/admin', label: 'Overview', any: ['dashboard.admin'] },
  { href: '/dashboard/kitchen', label: 'Kitchen today', any: ['dashboard.kitchen'] },
  { href: '/dashboard/dispatch', label: 'Dispatch today', any: ['dashboard.dispatch'] },
  { href: '/orders', label: 'Orders', any: ['orders.read'] },
  { href: '/kitchen', label: 'Kitchen board', any: ['kitchen.read'] },
  { href: '/dispatch', label: 'Dispatch board', any: ['dispatch.read'] },
  { href: '/driver', label: 'My deliveries', any: ['deliveries.own'] },
  { href: '/companies', label: 'Companies', any: ['companies.read'] },
  { href: '/employees', label: 'Employees', any: ['employees.read'] },
  { href: '/catalog', label: 'Catalogue', any: ['catalog.read'] },
  { href: '/menu', label: 'Menu', any: ['menu.read'] },
  { href: '/pricing', label: 'Pricing', any: ['pricing.read'] },
  { href: '/billing', label: 'Billing', any: ['billing.read'] },
  { href: '/settings', label: 'Settings', any: ['settings.write', 'staff.manage'] },
];

export function Nav() {
  const { me, can, clock } = useSession();
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const links = NAV.filter((n) => can(...n.any));

  async function signOut() {
    await post('/auth/logout');
    qc.clear();
    router.replace('/login');
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 bg-stone-50 px-4 py-5 md:sticky md:top-0 md:h-screen md:w-56">
      <div>
        <div className="text-base font-semibold text-emerald-900">Fernleaf Kitchen</div>
        <div className="mt-0.5 text-xs text-stone-500">{day(clock.today)}, {clock.timeZone.replace('_', ' ')}</div>
      </div>
      <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={path.startsWith(l.href) ? 'page' : undefined}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-sm',
              path.startsWith(l.href) ? 'bg-emerald-100 font-medium text-emerald-950' : 'text-stone-700 hover:bg-stone-100',
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t border-stone-200 pt-3">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-xs font-semibold text-white"
          >
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-stone-900">{me.name}</div>
            <div className="truncate text-xs text-stone-500">{me.role.name}</div>
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-2 text-xs text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
