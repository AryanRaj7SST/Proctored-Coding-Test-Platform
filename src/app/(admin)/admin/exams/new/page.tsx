import { requireAdmin } from '@/lib/authz';
import { TestBuilder } from '@/components/admin/tests/TestBuilder';

export const dynamic = 'force-dynamic';

/**
 * Create a test. Only the first step is available here: the first save
 * creates a DRAFT and continues at /admin/exams/[id]?step=questions.
 */
export default async function NewTestPage() {
  await requireAdmin();
  return <TestBuilder initial={null} categories={[]} tags={[]} />;
}
