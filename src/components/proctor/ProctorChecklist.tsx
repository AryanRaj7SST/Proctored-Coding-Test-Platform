import { cn } from '@/lib/utils';

export interface CheckItem {
  label: string;
  ok: boolean;
  /** Shown under the label while the check is failing. */
  hint?: string | null;
}

/** ✓ / ✗ list shared by the pre-test system check and the in-test gate. */
export function ProctorChecklist({ items, tone = 'dark' }: { items: CheckItem[]; tone?: 'dark' | 'light' }) {
  return (
    <ul className="space-y-2" aria-label="Requirements">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2 text-sm">
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              item.ok ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500',
            )}
          >
            {item.ok ? '✓' : '✗'}
          </span>
          <span>
            <span className={cn(tone === 'dark' ? 'text-slate-100' : 'text-slate-800')}>
              {item.label}
              <span className="sr-only">{item.ok ? ': ready' : ': not ready'}</span>
            </span>
            {!item.ok && item.hint ? (
              <span className={cn('block text-xs', tone === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                {item.hint}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
