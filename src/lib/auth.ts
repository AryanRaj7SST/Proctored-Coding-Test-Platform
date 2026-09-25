import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { normalizeEmail, maskEmail } from './email';
import { logger } from './logger';
import { env } from './env';
import { authCallbacks } from './auth-callbacks';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: 'STUDENT' | 'ADMIN'; batch?: string | null } & DefaultSession['user'];
  }
}

/**
 * Google authenticates; the application authorises by role. The sign-in,
 * token and session rules live in ./auth-callbacks (no invite list: any
 * Google-verified address may sign in, new accounts are STUDENTs, and the
 * session role always comes from the users table).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: env.googleId,
      clientSecret: env.googleSecret,
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: env.authTrustHost,
  callbacks: authCallbacks,
  events: {
    async signOut(message) {
      const email = 'token' in message ? normalizeEmail(message.token?.email) : '';
      if (email) logger.info('auth.signout', { email: maskEmail(email) });
    },
  },
});
