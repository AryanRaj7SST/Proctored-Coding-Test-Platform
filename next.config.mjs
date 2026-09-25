/** @type {import('next').NextConfig} */
// Content-Security-Policy for the application shell.
// NOTE: the student preview runs inside a sandboxed iframe with a null origin
// (srcdoc + sandbox="allow-scripts"), so it is not governed by this policy's
// script-src for the parent document -- see docs/security.md.
const csp = [
  "default-src 'self'",
  // Monaco loads its worker/AMD bundle from the app itself; 'unsafe-eval' is
  // required by Monaco's tokenizer in dev and by its worker bootstrap.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://d3dyfaf3iutrxo.cloudfront.net https://s3-ap-southeast-1.amazonaws.com https://cdn.jsdelivr.net",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // camera=(self): the test page shows the student a LOCAL camera preview
  // (never recorded or uploaded). No other origin -- including the sandboxed
  // student-code preview iframes, whose origin is opaque -- may use it.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // HTTPS only from the first visit onward. Production builds only: browsers
  // ignore it over plain http, and it must never stick to localhost in dev.
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
