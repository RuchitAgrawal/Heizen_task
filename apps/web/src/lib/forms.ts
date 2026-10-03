'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * Wraps a mutation so server field errors land next to the right input and the
 * top-level message is shown once. Invalidates the given query keys on success.
 */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, opts: { invalidate?: unknown[][]; onSuccess?: (r: TResult) => void } = {}) {
  const qc = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: fn,
    onMutate: () => setFieldErrors({}),
    onSuccess: async (r) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      opts.onSuccess?.(r);
    },
    onError: (e) => setFieldErrors(e instanceof ApiError ? e.fieldErrors : {}),
  });
  const error = m.error instanceof ApiError ? m.error.message : m.error ? 'Something went wrong' : null;
  return { ...m, fieldErrors, error, run: m.mutate, runAsync: m.mutateAsync };
}
