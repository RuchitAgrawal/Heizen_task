'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DASHBOARD_ORDER } from '@fernleaf/shared';
import { useSession } from '@/lib/session';

/** Each role lands on its own dashboard: the first one its permissions allow. */
export default function Home() {
  const { can } = useSession();
  const router = useRouter();
  const target = DASHBOARD_ORDER.find((d) => can(d.permission))?.path ?? '/orders';
  useEffect(() => router.replace(target), [router, target]);
  return null;
}
