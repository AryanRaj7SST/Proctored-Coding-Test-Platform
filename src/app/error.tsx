'use client';

import * as React from 'react';
import { Button } from '@/components/ui';

/**
 * Global error boundary. Deliberately shows no stack trace or digest detail to
 * the user; the server log carries the diagnosis.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-100">Something went wrong</h1>
      <p className="max-w-md text-sm text-slate-400">
        The page could not be displayed. Any exam work you had saved is safe — autosave writes to the server, not the
        browser.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => window.location.assign('/')}>
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}
