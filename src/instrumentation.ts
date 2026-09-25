/**
 * Runs once when the Next.js server starts. A server missing required
 * configuration refuses to start with a message naming the variables, rather
 * than failing later on the first sign-in or graded run.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertServerEnv } = await import('./lib/env');
  assertServerEnv();
}
