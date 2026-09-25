import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { linkPendingAssignments } from './assignments';

/**
 * Accounts at the authentication boundary.
 *
 * Google establishes WHO someone is; the users table establishes WHAT they may
 * do. Anyone Google authenticates with a verified address may sign in -- there
 * is no invite list. A first sign-in always creates a STUDENT; an existing
 * account keeps the role and active state an administrator gave it. Nothing
 * from the Google profile, the request or the client can set a role.
 */

/** What Auth.js hands us from Google. Every field is untrusted input. */
export interface GoogleProfile {
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

/** Login page error codes (see app/(auth)/login/page.tsx). */
export type SignInRejection = 'AccessDenied' | 'EmailNotVerified' | 'AccountDisabled';

export type SignInDecision =
  | { ok: true; created: boolean; user: { id: string; email: string; role: Role } }
  | { ok: false; reason: SignInRejection; email: string | null };

function profileName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
}

function profileImage(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') && value.length <= 2048 ? value : null;
}

/**
 * Accept a Google-authenticated person and create or refresh their account.
 *
 *  - new address         -> STUDENT, active
 *  - existing account    -> role and active state untouched; name, picture and last sign-in refreshed
 *  - deactivated account -> refused (an administrator switched it off; signing in never re-enables it)
 *
 * The student roster (AllowedEmail) is consulted only for a pre-registered
 * batch; it never decides whether someone may sign in or what role they get.
 */
export async function acceptGoogleSignIn(profile: GoogleProfile): Promise<SignInDecision> {
  const email = normalizeEmail(profile.email);
  if (!email || !isValidEmail(email)) return { ok: false, reason: 'AccessDenied', email: null };
  // Accounts are keyed by address, so an unverified one could claim someone else's account.
  if (profile.email_verified !== true) return { ok: false, reason: 'EmailNotVerified', email };

  const existing = await prisma.user.findUnique({ where: { email }, select: { active: true } });
  if (existing && !existing.active) return { ok: false, reason: 'AccountDisabled', email };

  const roster = await prisma.allowedEmail.findUnique({ where: { email }, select: { batch: true } });
  const name = profileName(profile.name);
  const image = profileImage(profile.picture);
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      image,
      role: 'STUDENT',
      active: true,
      batch: roster?.batch ?? null,
      lastLogin: now,
    },
    // Deliberately no `role` and no `active`: those belong to administrators.
    update: {
      ...(name ? { name } : {}),
      ...(image ? { image } : {}),
      ...(roster ? { batch: roster.batch } : {}),
      lastLogin: now,
    },
    select: { id: true, email: true, role: true },
  });

  // Tests assigned to this address before the first sign-in now belong to the account.
  await linkPendingAssignments(email, user.id);
  return { ok: true, created: !existing, user };
}

export interface TokenAccount {
  id: string;
  role: Role;
  batch: string | null;
}

/**
 * The account behind a session token, re-read from the database on every
 * token refresh so a role change or deactivation applies on the next request.
 * Null when the account is missing or deactivated.
 */
export async function accountForToken(email: unknown): Promise<TokenAccount | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, role: true, batch: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, role: user.role, batch: user.batch };
}
