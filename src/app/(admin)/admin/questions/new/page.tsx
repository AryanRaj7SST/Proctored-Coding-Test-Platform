import { requireAdmin } from '@/lib/authz';
import { QuestionForm } from '@/components/admin/QuestionForm';

export const dynamic = 'force-dynamic';

export default async function NewQuestionPage() {
  await requireAdmin();
  return <QuestionForm />;
}
