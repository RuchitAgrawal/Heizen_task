'use client';

import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import type { Me, Permission } from '@fernleaf/shared';
import { api, ApiError } from './api';

interface Clock {
  timeZone: string;
  today: string;
  now: string;
}

interface Session {
  me: Me;
  clock: Clock;
  can: (...p: Permission[]) => boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false, staleTime: 60_000 });
  const clock = useQuery({ queryKey: ['clock'], queryFn: () => api<Clock>('/settings/clock'), enabled: me.isSuccess, refetchInterval: 60_000 });

  const unauth = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauth) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauth, router, pathname]);

  if (me.isError && !unauth) return <p className="p-8 text-red-700">Could not reach the server. Refresh to try again.</p>;
  if (!me.data || !clock.data) return <p className="p-8 text-stone-500">Loading…</p>;

  const perms = new Set(me.data.permissions);
  const value: Session = { me: me.data, clock: clock.data, can: (...p) => p.some((x) => perms.has(x)) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export function useTz() {
  return useSession().clock.timeZone;
}
