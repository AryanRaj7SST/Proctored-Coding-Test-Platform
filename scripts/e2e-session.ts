/**
 * LOCAL END-TO-END TESTING ONLY -- signs a person in without Google's login page.
 *
 *   E2E_AUTH_SECRET=<throwaway secret the local server was started with> \
 *   DATABASE_URL=postgresql://localhost:5432/<disposable db> \
 *   npx tsx scripts/e2e-session.ts <email> --base-url http://localhost:3100 --out state.json
 *
 * It does exactly what the real Google sign-in does after Google has
 * authenticated someone -- the same acceptGoogleSignIn() rule (an existing
 * account keeps its role, a new address becomes a STUDENT, a deactivated
 * account is refused) -- and then writes a genuine Auth.js session cookie as a
 * Playwright storage-state file. Every request made with it goes through the
 * real session decoding, the database role lookup and every authorisation check.
 *
 * It cannot become a production bypass:
 *  - it is a CLI script, not part of the application: no route, no provider, no flag in the app;
 *  - it takes no role -- the database decides, exactly as for a Google sign-in;
 *  - it refuses unless NODE_ENV is not production, DATABASE_URL is a local
 *    database and the target URL is local;
 *  - it signs with E2E_AUTH_SECRET, which must be a throwaway secret different
 *    from the real AUTH_SECRET, so its cookies are worthless against any
 *    deployment that was not started with that same throwaway secret.
 */
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'next-auth/jwt';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const COOKIE = 'authjs.session-token'; // the non-__Secure name Auth.js uses over plain http
const MAX_AGE = 2 * 60 * 60;

function fail(message: string): never {
  console.error(`e2e-session: ${message}`);
  process.exit(1);
}

function hostOf(url: string, what: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return fail(`${what} is missing or not a valid URL.`);
  }
}

/** The real secret from .env, if there is one, so it can never be reused here. */
function realAuthSecret(): string | undefined {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*AUTH_SECRET\s*=/.test(l));
  return line
    ?.replace(/^\s*AUTH_SECRET\s*=\s*/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args[0];
  if (!email || email.startsWith('--')) {
    fail('usage: e2e-session.ts <email> --out state.json [--base-url http://localhost:3100]');
  }
  const baseUrl = argValue(args, '--base-url') ?? 'http://localhost:3000';
  const out = argValue(args, '--out');
  if (!out) fail('--out <file> is required (a Playwright storage-state file).');

  if (process.env.NODE_ENV === 'production') fail('refusing to run with NODE_ENV=production.');
  const dbHost = hostOf(process.env.DATABASE_URL ?? '', 'DATABASE_URL');
  if (!LOCAL_HOSTS.has(dbHost))
    fail(`refusing to sign anyone in against a non-local database ("${dbHost}").`);
  const appHost = hostOf(baseUrl, '--base-url');
  if (!LOCAL_HOSTS.has(appHost)) fail(`refusing to create a session for a non-local app ("${appHost}").`);
  if (new URL(baseUrl).protocol !== 'http:') fail('--base-url must be plain http (a local server).');

  const secret = process.env.E2E_AUTH_SECRET ?? '';
  if (secret.length < 32) fail('E2E_AUTH_SECRET must be a throwaway secret of at least 32 characters.');
  if (secret === realAuthSecret()) {
    fail('E2E_AUTH_SECRET must not be the real AUTH_SECRET; start the local server with a throwaway one.');
  }

  // Imported only after the guards pass, so nothing touches a database before them.
  const { acceptGoogleSignIn } = await import('../src/server/services/accounts');
  const { prisma } = await import('../src/lib/prisma');
  try {
    const decision = await acceptGoogleSignIn({
      email,
      email_verified: true,
      name: email.split('@')[0],
    });
    if (!decision.ok) fail(`sign-in refused: ${decision.reason}.`);

    const value = await encode({
      token: { email: decision.user.email, name: email.split('@')[0], sub: decision.user.id },
      secret,
      salt: COOKIE,
      maxAge: MAX_AGE,
    });
    const state = {
      cookies: [
        {
          name: COOKIE,
          value,
          domain: appHost,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + MAX_AGE,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    };
    fs.writeFileSync(out, JSON.stringify(state, null, 2), { mode: 0o600 });
    console.log(
      `e2e-session: ${decision.user.email} signed in as ${decision.user.role}` +
        `${decision.created ? ' (new account)' : ''} -> ${out}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
