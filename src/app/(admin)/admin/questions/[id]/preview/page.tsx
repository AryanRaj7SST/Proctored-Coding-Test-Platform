import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { toStudentQuestion, publishBlockers } from '@/server/services/questions';
import { QuestionPanel } from '@/components/exam/QuestionPanel';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { QuestionPreviewRunner } from './QuestionPreviewRunner';

export const dynamic = 'force-dynamic';

/**
 * See the question exactly as a student will, next to the answer-key view that
 * only an admin gets. This is the "does my wording match my tests" check.
 */
export default async function QuestionPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const question = await prisma.question.findUnique({
    where: { id },
    include: { tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) notFound();

  const studentView = toStudentQuestion(question);
  const blockers = publishBlockers(question);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Preview: {question.title}</h1>
          <p className="mt-1 text-sm text-slate-400">Left is the student view. Right is admin-only.</p>
        </div>
        <Link
          href={`/admin/questions/${question.id}/edit`}
          className="rounded-md px-3 py-1.5 text-sm text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
        >
          Edit
        </Link>
      </div>

      {blockers.length > 0 ? (
        <div className="rounded-md bg-warn/10 p-3 text-xs text-amber-200 ring-1 ring-warn/30">
          <p className="font-medium">Not ready for a published exam:</p>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md bg-ok/10 p-3 text-xs text-emerald-200 ring-1 ring-ok/30">
          This question is validated and ready to be added to an exam.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-h-[520px] overflow-hidden">
          <CardHeader title="Student view" subtitle="Exactly what the exam panel renders" />
          <div className="h-[520px]">
            <QuestionPanel question={studentView} earned={null} maxScore={question.points} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Test suite (admin only)"
              subtitle="Test bodies are never sent to a student's browser"
            />
            <CardBody className="space-y-2">
              {question.tests.map((t) => (
                <details key={t.id} className="rounded-md bg-ink-900 p-3 ring-1 ring-ink-700">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-slate-200">
                    {t.name}
                    <Badge tone={t.hidden ? 'neutral' : 'info'}>{t.hidden ? 'hidden' : 'visible'}</Badge>
                    <span className="text-xs text-slate-500">{t.points} pts</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto font-mono text-[11px] text-slate-400">{t.testCode}</pre>
                </details>
              ))}
              {question.tests.length === 0 ? <p className="text-xs text-slate-500">No tests defined.</p> : null}
            </CardBody>
          </Card>

          <QuestionPreviewRunner
            questionId={question.id}
            hasReference={Boolean(question.referenceHtml || question.referenceCss || question.referenceJs)}
            starter={{ html: question.starterHtml, css: question.starterCss, js: question.starterJs }}
            reference={{
              html: question.referenceHtml ?? '',
              css: question.referenceCss ?? '',
              js: question.referenceJs ?? '',
            }}
          />
        </div>
      </div>
    </div>
  );
}
