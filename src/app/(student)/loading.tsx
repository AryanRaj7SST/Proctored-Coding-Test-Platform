import { PageSkeleton } from '@/components/ui/PageSkeleton';

/** Shown inside the student layout while a student page loads (dashboard, results, practice). */
export default function StudentLoading() {
  return <PageSkeleton cards={3} label="Loading your tests…" />;
}
