import type { ApiErrorBody } from './errors';

/**
 * Tiny client-side fetch wrapper.
 *
 * Surfaces the server's user-facing `message` (the API never returns stack
 * traces or internals) and keeps every call same-origin so the session cookie
 * is sent and CSRF surface stays minimal.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;

  constructor(status: number, message: string, code = 'INTERNAL_ERROR', details?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) throw apiErrorFrom(res.status, payload);
  return payload as T;
}

/** Build an ApiError from a non-2xx response body in the standard error shape. */
export function apiErrorFrom(
  status: number,
  payload: unknown,
  fallback = 'Something went wrong. Please try again.',
) {
  const body = (payload ?? {}) as Partial<ApiErrorBody>;
  return new ApiError(status, body.message ?? fallback, body.code, body.details);
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? '{}' : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
