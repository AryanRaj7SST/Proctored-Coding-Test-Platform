import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { signIn } from '@/lib/auth';
import { LoginButton } from './LoginButton';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  NotAllowlisted:
    'That Google account is not on the invite list for this platform. Ask your mentor to add your exact email address.',
  EmailNotVerified: 'Google has not verified that email address. Verify it with Google and try again.',
  AccessDenied: 'Sign-in was refused. Use the Google account your mentor invited.',
  Configuration: 'Sign-in is not configured correctly. Please contact your mentor.',
  Verification: 'That sign-in link is no longer valid. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'ADMIN' ? '/admin' : '/dashboard');

  const params = await searchParams;
  const message = params.error ? (ERRORS[params.error] ?? ERRORS.AccessDenied) : null;

  // Only same-origin relative paths are accepted as a post-login destination,
  // so a crafted ?callbackUrl cannot turn this into an open redirect.
  const raw = params.callbackUrl ?? '';
  const callbackUrl = /^\/(?!\/)/.test(raw) ? raw : '/';

  async function doSignIn() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-xl bg-ink-850 p-8 ring-1 ring-ink-700">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            &lt;/&gt;
          </div>
          <h1 className="text-lg font-semibold text-slate-50">Coding Assessment Platform</h1>
          <p className="mt-1 text-xs text-slate-400">Sign in with the Google account your mentor invited.</p>
        </div>

        {message ? (
          <div className="mb-4 rounded-md bg-bad/10 p-3 text-xs text-rose-200 ring-1 ring-bad/30" role="alert">
            {message}
          </div>
        ) : null}

        <form action={doSignIn}>
          <LoginButton />
        </form>

        <p className="mt-6 text-center text-[11px] leading-5 text-slate-500">
          Access is limited to individually invited addresses. Exam sessions are proctored: tab switches, focus loss and
          clipboard activity are recorded.
        </p>
      </div>
    </main>
  );
}
