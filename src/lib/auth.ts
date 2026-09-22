import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { prisma } from './prisma';
import { normalizeEmail, isValidEmail, maskEmail } from './email';
import { logger } from './logger';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: 'STUDENT' | 'ADMIN'; batch?: string | null } & DefaultSession['user'];
  }
}

/**
 * Sign-in policy (product requirement #6):
 *  1. Google identity present
 *  2. email present
 *  3. email verified by Google
 *  4. normalised (lowercase) email present in AllowedEmail -- EXACT match
 *  5. that AllowedEmail row is active
 * Anything else is rejected. Domain suffix checks are deliberately NOT used.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false;

      const email = normalizeEmail(profile?.email);
      if (!email || !isValidEmail(email)) {
        logger.warn('auth.rejected', { reason: 'missing_or_invalid_email' });
        return '/login?error=AccessDenied';
      }
      if (profile?.email_verified !== true) {
        logger.warn('auth.rejected', { reason: 'email_not_verified', email: maskEmail(email) });
        return '/login?error=EmailNotVerified';
      }

      const allowed = await prisma.allowedEmail.findUnique({ where: { email } });
      if (!allowed || !allowed.active) {
        logger.warn('auth.rejected', { reason: 'not_allowlisted', email: maskEmail(email) });
        return '/login?error=NotAllowlisted';
      }

      // Upsert the local user; role always comes from the allowlist, never the client.
      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          name: (profile?.name as string | undefined) ?? null,
          image: (profile?.picture as string | undefined) ?? null,
          role: allowed.role,
          batch: allowed.batch,
          lastLogin: new Date(),
        },
        update: {
          name: (profile?.name as string | undefined) ?? undefined,
          image: (profile?.picture as string | undefined) ?? undefined,
          role: allowed.role,
          batch: allowed.batch,
          active: true,
          lastLogin: new Date(),
        },
      });

      logger.info('auth.success', { email: maskEmail(email), role: allowed.role });
      return true;
    },

    async jwt({ token }) {
      const email = normalizeEmail(token.email);
      if (!email) return token;
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, batch: true, active: true },
      });
      if (!user || !user.active) return { ...token, userId: undefined, role: undefined };
      token.userId = user.id;
      token.role = user.role;
      token.batch = user.batch;
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? '';
        session.user.role = (token.role as 'STUDENT' | 'ADMIN') ?? 'STUDENT';
        session.user.batch = (token.batch as string | null) ?? null;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      const email = 'token' in message ? normalizeEmail(message.token?.email) : '';
      if (email) logger.info('auth.signout', { email: maskEmail(email) });
    },
  },
});
