import { requireAdmin } from '@/lib/authz';
import { QuestionWizard } from '@/components/admin/questions/QuestionWizard';
import { normalizeQuestion } from '@/components/admin/questions/draft';
import { isWizardStep } from '@/components/admin/questions/types';
import { loadAdminQuestion } from '../../_lib/load-question';
import { loadQuestionTaxonomy } from '../../_lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  await requireAdmin();
  const [{ id }, { step }] = await Promise.all([params, searchParams]);
  const [question, taxonomy] = await Promise.all([loadAdminQuestion(id), loadQuestionTaxonomy()]);

  return (
    <QuestionWizard
      // A fresh editor per question when moving between edit pages.
      key={question.id}
      initialQuestion={normalizeQuestion(question)}
      initialStep={isWizardStep(step) ? step : undefined}
      categories={taxonomy.categories}
      knownTags={taxonomy.tags}
    />
  );
}
