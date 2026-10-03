import type { ApiErrorBody } from '@fernleaf/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
  get fieldErrors(): Record<string, string> {
    return this.body.fieldErrors ?? {};
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export async function api<T>(path: string, opts: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const qs = opts.query
    ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
    : '';
  const res = await fetch(`/api${path}${qs}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, data ?? { code: 'HTTP_' + res.status, message: res.statusText || 'Request failed' });
  }
  return data as T;
}

export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
