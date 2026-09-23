import { NextResponse } from 'next/server';
import { logger, sanitizeError } from './logger';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (m = 'Invalid request.', d?: unknown) => new HttpError(400, m, 'bad_request', d);
export const unauthorized = (m = 'You must sign in to continue.') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this resource.') =>
  new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found.') => new HttpError(404, m, 'not_found');
export const conflict = (m = 'This action conflicts with the current state.') =>
  new HttpError(409, m, 'conflict');
export const tooLarge = (m = 'Payload too large.') => new HttpError(413, m, 'payload_too_large');
export const tooManyRequests = (m = 'Too many requests. Please slow down.') =>
  new HttpError(429, m, 'rate_limited');

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data as object, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Convert any thrown value into a safe JSON response.
 * Internal errors never leak stack traces, SQL, or filesystem paths.
 */
export function errorResponse(err: unknown, context?: Record<string, unknown>): NextResponse {
  if (err instanceof HttpError) {
    if (err.status >= 500) logger.error(err.message, { ...context, code: err.code });
    return NextResponse.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      { status: err.status },
    );
  }
  // Validation errors are thrown by src/lib/validation.ts, which deliberately
  // does not import next/server so the schemas stay importable from client
  // components. They carry {status, code, details} instead of being HttpErrors.
  if (
    err &&
    typeof err === 'object' &&
    'status' in err &&
    typeof (err as { status?: unknown }).status === 'number' &&
    (err as { status: number }).status < 500
  ) {
    const e = err as { status: number; message?: string; code?: string; details?: unknown };
    return NextResponse.json(
      {
        error: e.message || 'Invalid request.',
        code: e.code || 'bad_request',
        ...(e.details ? { details: e.details } : {}),
      },
      { status: e.status },
    );
  }

  logger.error('Unhandled API error', { ...context, error: sanitizeError(err) });
  return NextResponse.json(
    { error: 'Something went wrong. Please try again.', code: 'internal_error' },
    { status: 500 },
  );
}

/** Wrap a route handler so every thrown error becomes a safe response. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Read a JSON body with a hard size ceiling (defence against memory abuse). */
export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw tooLarge();
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw tooLarge();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest('Request body must be valid JSON.');
  }
}

export async function readText(req: Request, maxBytes = 2_000_000): Promise<string> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw tooLarge();
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw tooLarge();
  return text;
}
