import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { signIn } from '@/lib/auth';
import { LoginButton } from './LoginButton';

export const dynamic = 'force-dynamic';

/**
 * Sign-in failures we can explain. Anyone Google authenticates may sign in;
 * these are the only reasons the application itself refuses (lib/auth-callbacks).
 * Unknown codes fall back to AccessDenied.
 */
const ERRORS: Record<string, string> = {
  EmailNotVerified: 'Google has not verified that email address. Verify it with Google and try again.',
  AccountDisabled: 'This account has been deactivated. Contact your mentor if you think this is a mistake.',
  AccessDenied: 'Sign-in was refused. Please try again with your Google account.',
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
    <main id="main" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-4 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/scaler-logo.png" alt="Scaler" className="h-10 w-auto object-contain" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Coding Assessment Platform</h1>
          <p className="mt-1 text-xs text-slate-600">Sign in with your Google account to continue.</p>
        </div>

        {message ? (
          <div
            className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
            role="alert"
          >
            {message}
          </div>
        ) : null}

        <form action={doSignIn}>
          <LoginButton />
        </form>

        <p className="mt-6 text-center text-[11px] leading-5 text-slate-500">
          Any Google account can sign in. Test sessions are proctored: tab switches, focus loss and clipboard
          activity are recorded.
        </p>
      </div>
    </main>
  );
}
