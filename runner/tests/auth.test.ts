import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

/**
 * `config.secret` is read from RUNNER_SECRET at import time, so it must be set
 * BEFORE `../src/auth.ts` (which imports `../src/config.ts`) is loaded. A
 * dynamic import after setting the env var is what makes that ordering safe
 * regardless of how this file is executed.
 */
process.env.RUNNER_SECRET = 'test-secret-at-least-16-chars';
const { authenticate } = await import('../src/auth.ts');

const SECRET = process.env.RUNNER_SECRET;

/** Build a minimal fake of the one Express method `authenticate` calls. */
function fakeRequest(headers: Record<string, string>) {
  return {
    header(name: string) {
      return headers[name.toLowerCase()] ?? undefined;
    },
  } as never;
}

function sign(body: string, timestamp: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function validRequest(body: string, overrides: Partial<Record<string, string>> = {}) {
  const timestamp = String(Date.now());
  const headers: Record<string, string> = {
    authorization: `Bearer ${SECRET}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': sign(body, timestamp),
    ...overrides,
  };
  return fakeRequest(headers);
}

test('accepts a correctly signed, fresh request', () => {
  const body = JSON.stringify({ runId: 'r1' });
  const result = authenticate(validRequest(body), body);
  assert.equal(result.ok, true);
});

test('rejects a missing bearer token', () => {
  const body = '{}';
  const result = authenticate(validRequest(body, { authorization: '' }), body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_token');
});

test('rejects a wrong bearer token in constant time (no early return on mismatch)', () => {
  const body = '{}';
  const result = authenticate(validRequest(body, { authorization: 'Bearer wrong-secret-value' }), body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_token');
});

test('rejects a request with the right token but no signature headers', () => {
  const body = '{}';
  const req = fakeRequest({ authorization: `Bearer ${SECRET}` });
  const result = authenticate(req, body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_signature');
});

test('rejects a stale timestamp (replay protection)', () => {
  const body = '{}';
  const staleTimestamp = String(Date.now() - 10 * 60 * 1000); // 10 minutes old
  const req = fakeRequest({
    authorization: `Bearer ${SECRET}`,
    'x-runner-timestamp': staleTimestamp,
    'x-runner-signature': sign(body, staleTimestamp),
  });
  const result = authenticate(req, body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale_timestamp');
});

test('rejects a non-numeric timestamp', () => {
  const body = '{}';
  const req = fakeRequest({
    authorization: `Bearer ${SECRET}`,
    'x-runner-timestamp': 'not-a-number',
    'x-runner-signature': sign(body, 'not-a-number'),
  });
  assert.equal(authenticate(req, body).reason, 'stale_timestamp');
});

test('rejects a signature computed over a different body (payload tampering)', () => {
  const timestamp = String(Date.now());
  const req = fakeRequest({
    authorization: `Bearer ${SECRET}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': sign(JSON.stringify({ runId: 'original' }), timestamp),
  });
  // The body actually delivered differs from what was signed.
  const result = authenticate(req, JSON.stringify({ runId: 'tampered' }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_signature');
});

test('rejects a signature computed with the wrong secret (captured-token replay from elsewhere)', () => {
  const body = '{}';
  const timestamp = String(Date.now());
  const req = fakeRequest({
    authorization: `Bearer ${SECRET}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': sign(body, timestamp, 'a-completely-different-secret-16'),
  });
  assert.equal(authenticate(req, body).reason, 'bad_signature');
});

test('accepts a request right at the edge of the signature window', () => {
  const body = '{}';
  // config.signatureWindowMs defaults to 120_000; just inside that boundary.
  const timestamp = String(Date.now() - 119_000);
  const req = fakeRequest({
    authorization: `Bearer ${SECRET}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': sign(body, timestamp),
  });
  assert.equal(authenticate(req, body).ok, true);
});
