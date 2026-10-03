'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DASHBOARD_ORDER, Me } from '@fernleaf/shared';
import { ApiError, post } from '@/lib/api';
import { Button, ErrorText, Field, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await post<Me>('/auth/login', { email, password });
      qc.setQueryData(['me'], me);
      const home = DASHBOARD_ORDER.find((d) => me.permissions.includes(d.permission))?.path ?? '/orders';
      const next = params.get('next');
      router.replace(next && next !== '/' && next.startsWith('/') && !next.startsWith('//') ? next : home);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setFieldErrors(err instanceof ApiError ? err.fieldErrors : {});
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-emerald-900">Fernleaf Kitchen</h1>
        <p className="text-sm text-stone-500">Staff sign in</p>
      </div>
      <Field label="Email" error={fieldErrors.email}>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field label="Password" error={fieldErrors.password}>
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
