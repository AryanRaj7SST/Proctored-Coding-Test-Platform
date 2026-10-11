import { Skeleton } from '@/components/ui';

/**
 * Route-level loading fallback shared by the student and admin areas.
 *
 * Rendered by Next.js (loading.tsx) the instant a navigation starts, while the
 * server is still fetching the next page. Announced politely to screen readers,
 * and hidden for the first 150 ms (see `.loading-delay` in globals.css) so
 * quick navigations do not flicker.
 */
export function PageSkeleton({ cards = 6, label = 'Loading…' }: { cards?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="loading-delay space-y-5">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
