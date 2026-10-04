'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

function QueryErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const error = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    const clear = () => setMessage(null);
    window.addEventListener('fernleaf:query-error', error);
    window.addEventListener('fernleaf:query-success', clear);
    return () => { window.removeEventListener('fernleaf:query-error', error); window.removeEventListener('fernleaf:query-success', clear); };
  }, []);
  if (!message) return null;
  return <div role="alert" className="fixed inset-x-4 top-4 z-50 rounded-md bg-red-700 px-4 py-3 text-sm text-white shadow-lg">{message} <button className="ml-2 underline" onClick={() => window.location.reload()}>Retry</button></div>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => window.dispatchEvent(new CustomEvent('fernleaf:query-error', { detail: error instanceof Error ? error.message : 'Could not load data' })),
        onSuccess: () => window.dispatchEvent(new Event('fernleaf:query-success')),
      }),
      defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
    }),
  );
  useEffect(() => {
    const unauthenticated = () => {
      // A wrong password is also a 401; on the login page that is a form error, not a redirect.
      if (window.location.pathname === '/login') return;
      client.clear();
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    };
    window.addEventListener('fernleaf:unauthenticated', unauthenticated);
    return () => window.removeEventListener('fernleaf:unauthenticated', unauthenticated);
  }, [client]);
  return <QueryClientProvider client={client}><QueryErrorBanner />{children}</QueryClientProvider>;
}
