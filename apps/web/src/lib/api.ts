import type { ApiErrorBody, PageMeta } from '@afyalink/shared';

/**
 * Browser API client.
 * - Access token lives in memory only (never localStorage).
 * - Refresh token is an httpOnly cookie the browser sends to /api/v1/auth only.
 * - Refresh is de-duplicated in-tab and serialised across tabs (Web Locks) because the server revokes the
 *   whole session family if a rotated refresh token is replayed.
 */
export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let clinicId: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;
let onTokens: ((data: unknown) => void) | null = null;

export const session = {
  setToken: (t: string | null) => (accessToken = t),
  getToken: () => accessToken,
  setClinic: (id: string | null) => (clinicId = id),
  getClinic: () => clinicId,
  onExpired: (fn: () => void) => (onSessionExpired = fn),
  onRefreshed: (fn: (data: unknown) => void) => (onTokens = fn),
};

async function doRefresh(): Promise<boolean> {
  const run = async () => {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'afyalink' },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data: { accessToken: string } };
    accessToken = body.data.accessToken;
    onTokens?.(body.data);
    return true;
  };
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? locks.request('afyalink-refresh', run) : run();
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Override or suppress (null) the active clinic header. */
  clinic?: string | null;
  signal?: AbortSignal;
}

async function raw(path: string, opts: RequestOptions, retry = true): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const tenant = opts.clinic === undefined ? clinicId : opts.clinic;
  if (tenant) headers['X-Clinic-Id'] = tenant;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
    signal: opts.signal,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return raw(path, opts, false);
    onSessionExpired?.();
  }
  return res;
}

async function parse<T>(res: Response): Promise<{ data: T; meta?: PageMeta & { unread?: number } }> {
  if (res.status === 204) return { data: undefined as T };
  const body = (await res.json().catch(() => null)) as ({ data: T; meta?: PageMeta } & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? 'NETWORK_ERROR', err?.message ?? 'Something went wrong. Please try again.', err?.details as never);
  }
  return body as { data: T; meta?: PageMeta };
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await parse<T>(await raw(path, opts))).data;
}

export async function apiPage<T>(path: string, opts: RequestOptions = {}) {
  const r = await parse<T[]>(await raw(path, opts));
  return { items: r.data, meta: r.meta! };
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong. Please try again.';
}
