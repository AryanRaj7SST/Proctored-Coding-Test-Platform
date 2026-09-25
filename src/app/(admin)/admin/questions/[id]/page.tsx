import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/authz';

export const dynamic = 'force-dynamic';

/** /admin/questions/[id] has no page of its own: the editor is the question's home. */
export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  redirect(`/admin/questions/${encodeURIComponent(id)}/edit`);
}
