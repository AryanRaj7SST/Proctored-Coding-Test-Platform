import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from './config';

function sign(body: string, timestamp: string): string {
  return createHmac('sha256', config.secret).update(`${timestamp}.${body}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface AuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Authenticate an app -> runner request.
 *  * bearer token must match the shared secret (constant-time compare)
 *  * HMAC over `timestamp.body` must match, so a captured token cannot be
 *    replayed against a different payload
 *  * timestamp must be recent, bounding replay of the *same* payload
 */
export function authenticate(req: Request, rawBody: string): AuthResult {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, config.secret)) return { ok: false, reason: 'bad_token' };

  const timestamp = req.header('x-runner-timestamp') ?? '';
  const signature = req.header('x-runner-signature') ?? '';
  if (!timestamp || !signature) return { ok: false, reason: 'missing_signature' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > config.signatureWindowMs) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  if (!safeEqual(sign(rawBody, timestamp), signature)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}
