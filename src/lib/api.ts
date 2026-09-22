/**
 * Tiny client-side fetch wrapper.
 *
 * Surfaces the server's user-facing `error` message (the API never returns
 * stack traces or internals) and keeps every call same-origin so the session
 * cookie is sent and CSRF surface stays minimal.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;

  constructor(status: number, message: string, code = 'error', details?: Record<string, string>) {
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

  if (!res.ok) {
    const body = (payload ?? {}) as { error?: string; code?: string; details?: Record<string, string> };
    throw new ApiError(res.status, body.error ?? 'Something went wrong. Please try again.', body.code, body.details);
  }
  return payload as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? '{}' : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
