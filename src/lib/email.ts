/**
 * Email normalisation + validation.
 * Allowlisting is EXACT-MATCH on the normalised address. We deliberately do NOT
 * strip gmail dots or +tags: two different Google accounts can own
 * `a.b@gmail.com` and `ab@gmail.com` is the same account, but treating them as
 * equal would let an allowlisted student mint unlimited aliases. Exact match on
 * the lowercase address is the safest rule for an allowlist. (docs/security.md)
 */
const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/;

export function normalizeEmail(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase();
}

export function isValidEmail(input: unknown): boolean {
  const email = normalizeEmail(input);
  if (!email || email.length > 254) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at > 64) return false;
  return EMAIL_RE.test(email);
}

/** Mask an address for logs: `stu***@example.com`. */
export function maskEmail(input: string): string {
  const email = normalizeEmail(input);
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}
