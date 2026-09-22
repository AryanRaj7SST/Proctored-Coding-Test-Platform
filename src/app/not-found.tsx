import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">404</p>
      <h1 className="text-xl font-semibold text-slate-100">We could not find that page</h1>
      <p className="max-w-md text-sm text-slate-400">
        The link may be out of date, or the item may belong to someone else. If you were sitting an exam, your work is
        saved — go back to your dashboard and resume from there.
      </p>
      <Link href="/" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Back to my dashboard
      </Link>
    </main>
  );
}
