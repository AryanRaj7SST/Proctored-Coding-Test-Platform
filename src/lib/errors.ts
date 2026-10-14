/**
 * Application errors and the one JSON shape every API error uses:
 *
 *   { "code": "NOT_FOUND", "message": "Attempt not found.", "details"?: {...} }
 *
 * Dependency-free (no next/server, no Prisma) so services, zod helpers and
 * client components can all import it.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'RUNNER_UNAVAILABLE'
  | 'RUNNER_TIMEOUT'
  | 'RUNNER_BUSY'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, string>;

  constructor(status: number, message: string, code: ErrorCode, details?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

export const badRequest = (m = 'Invalid request.', d?: Record<string, string>) =>
  new AppError(400, m, 'BAD_REQUEST', d);
export const validationError = (m = 'Invalid request.', d?: Record<string, string>) =>
  new AppError(400, m, 'VALIDATION_ERROR', d);
export const unauthorized = (m = 'You must sign in to continue.') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'You are not authorized to perform this action.') =>
  new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found.') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m = 'This action conflicts with the current state.') =>
  new AppError(409, m, 'CONFLICT');
export const tooLarge = (m = 'Payload too large.') => new AppError(413, m, 'PAYLOAD_TOO_LARGE');
export const tooManyRequests = (m = 'Too many requests. Please slow down.') =>
  new AppError(429, m, 'RATE_LIMITED');
export const serviceUnavailable = (
  m = 'Service temporarily unavailable. Please try again.',
  d?: Record<string, string>,
) => new AppError(503, m, 'SERVICE_UNAVAILABLE', d);
