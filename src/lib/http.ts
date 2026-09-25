import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { logger, sanitizeError } from './logger';
import { AppError, badRequest, tooLarge, type ApiErrorBody } from './errors';

// Route handlers import the error helpers from here alongside the responders.
export {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  tooLarge,
  tooManyRequests,
  unauthorized,
  validationError,
} from './errors';

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data as object, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** Map Prisma's known request errors to a safe client error; null for anything else. */
function fromPrismaError(err: unknown): AppError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (err.code) {
    case 'P2002':
      return new AppError(409, 'A record with these details already exists.', 'CONFLICT');
    case 'P2003':
      return new AppError(409, 'This record is referenced by other data.', 'CONFLICT');
    case 'P2025':
      return new AppError(404, 'Not found.', 'NOT_FOUND');
    default:
      return null;
  }
}

/**
 * Convert any thrown value into a safe JSON response ({code, message, details?}).
 * Internal errors never leak stack traces, SQL, Prisma internals or file paths.
 */
export function errorResponse(err: unknown, context?: Record<string, unknown>): NextResponse {
  const known = err instanceof AppError ? err : fromPrismaError(err);
  if (known) {
    if (known.status >= 500) logger.error(known.message, { ...context, code: known.code });
    return NextResponse.json(known.toBody(), { status: known.status });
  }

  logger.error('Unhandled API error', { ...context, error: sanitizeError(err) });
  const body: ApiErrorBody = { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
  return NextResponse.json(body, { status: 500 });
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
  const text = await readText(req, maxBytes);
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
