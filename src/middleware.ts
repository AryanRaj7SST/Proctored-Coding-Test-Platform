import { NextResponse, type NextRequest } from 'next/server';

/**
 * UX-level route protection ONLY.
 *
 * This middleware runs on the Edge runtime, where Prisma is unavailable, so it
 * deliberately does no database work and makes no authorisation decision beyond
 * "is there a session cookie at all". The real boundary is
 * `requireUser()` / `requireAdmin()`, which every protected page, layout and API
 * route calls independently (see src/lib/authz.ts and docs/security.md).
 *
 * Never weaken a server-side check because this file already redirected.
 */

const PROTECTED = [/^\/dashboard/, /^\/exams(\/|$)/, /^\/exam\//, /^\/admin(\/|$)/, /^\/results(\/|$)/];

function hasSessionCookie(req: NextRequest): boolean {
  // Auth.js v5 names the cookie `authjs.session-token`, or
  // `__Secure-authjs.session-token` when the deployment is HTTPS.
  return Boolean(
    req.cookies.get('authjs.session-token')?.value ||
    req.cookies.get('__Secure-authjs.session-token')?.value ||
    // Chunked cookies are used when the JWT exceeds the 4 KB cookie limit.
    req.cookies.get('authjs.session-token.0')?.value ||
    req.cookies.get('__Secure-authjs.session-token.0')?.value,
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();
  if (hasSessionCookie(req)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*', '/exams/:path*', '/exam/:path*', '/admin/:path*', '/results/:path*'],
};
