'use client';

import { SessionProvider } from '@/lib/session';
import { Nav } from '@/components/nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Nav />
        <main className="min-w-0 flex-1 px-5 py-6 md:px-8">{children}</main>
      </div>
    </SessionProvider>
  );
}
