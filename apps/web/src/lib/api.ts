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

export async function api<T>(path: string, opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<T> {
  const qs = opts.query
    ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
    : '';
  const res = await fetch(`/api${path}${qs}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  if (text) {
    try { data = JSON.parse(text); } catch { data = undefined; }
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fernleaf:unauthenticated'));
    const body = data && typeof data === 'object' && 'message' in data
      ? data as ApiErrorBody
      : { code: 'HTTP_' + res.status, message: text && !text.trimStart().startsWith('<') ? text : res.statusText || 'Request failed' };
    throw new ApiError(res.status, body);
  }
  if (text && data === undefined) throw new ApiError(res.status, { code: 'INVALID_RESPONSE', message: 'The server returned an unreadable response' });
  return data as T;
}

export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
