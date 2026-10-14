'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type ToastTone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'ring-brand-500/40 text-brand-100',
  success: 'ring-ok/40 text-emerald-100',
  error: 'ring-bad/40 text-rose-100',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const push = React.useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = React.useMemo(
    () => ({
      push,
      success: (message: string) => push(message, 'success'),
      error: (message: string) => push(message, 'error'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live so screen readers announce results without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto animate-fade-in rounded-md bg-ink-850 px-3 py-2 text-xs shadow-lg ring-1',
              TONE_CLASS[t.tone],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}
