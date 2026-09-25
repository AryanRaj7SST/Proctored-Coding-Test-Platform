import { requireAdmin } from '@/lib/authz';
import { QuestionWizard } from '@/components/admin/questions/QuestionWizard';
import { isWizardStep } from '@/components/admin/questions/types';
import { loadQuestionTaxonomy } from '../_lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  await requireAdmin();
  const [{ step }, taxonomy] = await Promise.all([searchParams, loadQuestionTaxonomy()]);
  return (
    <QuestionWizard
      initialQuestion={null}
      initialStep={isWizardStep(step) ? step : undefined}
      categories={taxonomy.categories}
      knownTags={taxonomy.tags}
    />
  );
}
