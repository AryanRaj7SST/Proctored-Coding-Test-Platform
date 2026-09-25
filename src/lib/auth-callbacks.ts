import type { NextAuthConfig } from 'next-auth';
import { maskEmail } from './email';
import { logger } from './logger';
import { accountForToken, acceptGoogleSignIn } from '@/server/services/accounts';

/**
 * Auth.js callbacks, kept apart from the NextAuth() instance so they can be
 * exercised directly in tests.
 *
 * Sign-in policy: Google authenticates; the application authorises by role.
 *  1. the provider is Google
 *  2. the email is present, valid and verified by Google
 *  3. the account, if one exists, has not been deactivated by an administrator
 * Everyone else Google authenticates is let in. New accounts are STUDENTs. The
 * role in the session is always the database role, re-read on every refresh --
 * never the Google profile, a request field or anything the browser holds.
 */
export const authCallbacks = {
  async signIn({ account, profile }) {
    if (account?.provider !== 'google') return false;

    const decision = await acceptGoogleSignIn(profile ?? {});
    if (!decision.ok) {
      logger.warn('auth.rejected', {
        reason: decision.reason,
        ...(decision.email ? { email: maskEmail(decision.email) } : {}),
      });
      return `/login?error=${decision.reason}`;
    }

    logger.info('auth.success', {
      email: maskEmail(decision.user.email),
      role: decision.user.role,
      created: decision.created,
    });
    return true;
  },

  async jwt({ token }) {
    const account = await accountForToken(token.email);
    if (!account) return { ...token, userId: undefined, role: undefined, batch: undefined };
    return { ...token, userId: account.id, role: account.role, batch: account.batch };
  },

  async session({ session, token }) {
    if (session.user) {
      // No userId means no active account: getSessionUser() treats that as signed out.
      session.user.id = typeof token.userId === 'string' ? token.userId : '';
      session.user.role = token.role === 'ADMIN' ? 'ADMIN' : 'STUDENT';
      session.user.batch = typeof token.batch === 'string' ? token.batch : null;
    }
    return session;
  },
} satisfies NonNullable<NextAuthConfig['callbacks']>;
