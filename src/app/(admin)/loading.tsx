import { PageSkeleton } from '@/components/ui/PageSkeleton';

/** Shown inside the admin layout while any admin page loads. The sidebar stays interactive. */
export default function AdminLoading() {
  return <PageSkeleton cards={6} label="Loading…" />;
}
