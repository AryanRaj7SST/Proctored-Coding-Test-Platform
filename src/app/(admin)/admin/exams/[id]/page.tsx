import { requireAdmin } from '@/lib/authz';
import { getExamForAdmin } from '@/server/services/exams';
import { isStepId } from '@/components/admin/tests/builder-state';
import { TestBuilder } from '@/components/admin/tests/TestBuilder';
import type { TestDetail } from '@/components/admin/tests/types';
import { asJson, loadQuestionFacets, orNotFound } from '../_lib/data';

export const dynamic = 'force-dynamic';

export default async function EditTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  await requireAdmin();
  const [{ id }, { step }] = await Promise.all([params, searchParams]);

  const [detail, facets] = await Promise.all([orNotFound(() => getExamForAdmin(id)), loadQuestionFacets()]);

  return (
    <TestBuilder
      // Remount with fresh state if the admin navigates between tests.
      key={id}
      initial={asJson<TestDetail>(detail)}
      initialStep={isStepId(step) ? step : 'basics'}
      assignedCount={detail.assignedCount}
      categories={facets.categories}
      tags={facets.tags}
    />
  );
}
