import { Spinner } from '@/components/ui';

/**
 * The exam page sits outside the student layout (no site chrome), so it gets
 * its own full-screen fallback while access and timing are checked.
 */
export default function ExamLoading() {
  return (
    <div
      aria-live="polite"
      className="loading-delay flex min-h-screen items-center justify-center gap-3 text-sm text-slate-300"
    >
      <Spinner className="h-5 w-5" />
      Opening your test…
    </div>
  );
}
