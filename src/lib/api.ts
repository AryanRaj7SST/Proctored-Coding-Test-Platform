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
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'Network request failed. Please check your internet connection and try again.',
      'NETWORK_ERROR',
    );
  }

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
export function apiErrorFrom(status: number, payload: unknown, fallback?: string) {
  const body = (payload ?? {}) as Partial<ApiErrorBody>;
  let defaultMessage = fallback;
  if (!defaultMessage) {
    if (status === 429) {
      defaultMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (status === 409) {
      defaultMessage = 'Action could not be completed due to a conflict. Please try again.';
    } else if (status === 502 || status === 503 || status === 504) {
      defaultMessage = 'The service is temporarily unavailable. Please try again in a few moments.';
    } else if (status >= 500) {
      defaultMessage = 'A server error occurred. Please try again.';
    } else {
      defaultMessage = 'Something went wrong. Please try again.';
    }
  }
  return new ApiError(status, body.message ?? defaultMessage, body.code, body.details);
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? '{}' : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
