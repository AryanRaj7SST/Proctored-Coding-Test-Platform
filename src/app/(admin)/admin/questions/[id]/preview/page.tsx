import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/authz';
import { toStudentQuestion } from '@/server/services/questions';
import { Badge, Card, CardBody, CardHeader, StatusBadge } from '@/components/ui';
import { Notice } from '@/components/admin/questions/bits';
import { normalizeQuestion } from '@/components/admin/questions/draft';
import { formatMarks, marksWord, splitSummary, equalShare } from '@/components/admin/questions/marks';
import { StudentPreview } from '@/components/admin/questions/StudentPreview';
import { readableTest } from '@/components/admin/questions/student-view';
import { loadAdminQuestion } from '../../_lib/load-question';
import { QuestionPreviewRunner } from './QuestionPreviewRunner';

export const dynamic = 'force-dynamic';

/**
 * The saved question exactly as a student will see it (built by the same
 * server function the exam uses), next to the admin-only view of its test
 * cases and reference solution.
 */
export default async function QuestionPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const raw = await loadAdminQuestion(id);
  const question = normalizeQuestion(raw);
  const studentView = toStudentQuestion(raw, raw.marks);

  const enabledCount = question.tests.filter((t) => t.enabled).length;
  const { share } = equalShare(question.marks, enabledCount);
  const hasReference = Boolean(question.referenceHtml || question.referenceCss || question.referenceJs);
  const cannotValidateReason =
    question.status === 'ARCHIVED'
      ? 'Restore this question before validating it.'
      : !hasReference
        ? 'Add a reference solution before validating.'
        : enabledCount === 0
          ? 'Enable at least one test case before validating.'
          : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <Link
            href="/admin/questions"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Questions
          </Link>
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">Preview: {question.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusBadge status={question.status} />
            <Badge
              tone={
                question.validation === 'PASSED' ? 'ok' : question.validation === 'FAILED' ? 'bad' : 'warn'
              }
            >
              validation {question.validation.replace('_', ' ').toLowerCase()}
            </Badge>
            <span>v{question.version}</span>
            <span>Saved version · students see the left-hand panels</span>
          </div>
        </div>
        <Link
          href={`/admin/questions/${question.id}/edit`}
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
        >
          Edit
        </Link>
      </div>

      {question.status === 'ARCHIVED' ? (
        <Notice tone="warn">
          <p>This question is archived: it cannot be edited or added to tests until it is restored.</p>
        </Notice>
      ) : question.status === 'PUBLISHED' ? (
        <Notice tone="ok">
          <p>Published: this question can be added to tests.</p>
        </Notice>
      ) : question.blockers.length > 0 ? (
        <Notice tone="warn" title="Not ready to publish yet:">
          <ul className="list-disc space-y-0.5 pl-4">
            {question.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <Notice tone="ok">
          <p>Validated and ready to publish from the editor’s Publish step.</p>
        </Notice>
      )}

      <Card>
        <CardHeader
          title="Student view"
          subtitle="Exactly what the test workspace renders for this question"
        />
        <CardBody>
          <StudentPreview question={studentView} summary={splitSummary(question.marks, enabledCount)} />
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={`Test cases (${question.tests.length})`}
            subtitle="Admin view: includes disabled test cases and each body's JSON"
          />
          <CardBody className="space-y-2">
            {question.tests.length === 0 ? (
              <p className="text-xs text-slate-500">No test cases yet.</p>
            ) : null}
            {question.tests.map((t, i) => {
              const readable = readableTest(t.testCode);
              return (
                <details key={t.id} className="rounded-md bg-white border border-slate-200 shadow-xs">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium text-slate-800">
                    <span className="text-xs text-slate-500">#{i + 1}</span>
                    {t.name}
                    {t.enabled ? (
                      <span className="ml-auto font-mono text-xs text-slate-500">
                        {formatMarks(share)} {marksWord(share)}
                      </span>
                    ) : (
                      <Badge tone="neutral" className="ml-auto">
                        disabled · not counted
                      </Badge>
                    )}
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-xs">
                    {t.expectedBehavior || t.description ? (
                      <p className="text-slate-600">{t.expectedBehavior || t.description}</p>
                    ) : null}
                    {readable ? (
                      <>
                        {readable.steps.length ? (
                          <ol className="list-decimal space-y-0.5 pl-4 text-slate-600">
                            {readable.steps.map((s, si) => (
                              <li key={si}>{s}</li>
                            ))}
                          </ol>
                        ) : null}
                        <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
                          {readable.checks.map((c, ci) => (
                            <li key={ci}>{c}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="text-rose-600 font-medium">This test body is not a valid specification.</p>
                    )}
                    <pre className="max-h-64 overflow-auto rounded bg-slate-50 border border-slate-200 p-2 font-mono text-[11px] text-slate-700">
                      {t.testCode}
                    </pre>
                  </div>
                </details>
              );
            })}
          </CardBody>
        </Card>

        <QuestionPreviewRunner
          questionId={question.id}
          canValidate={cannotValidateReason === undefined}
          cannotValidateReason={cannotValidateReason}
          starter={{ html: question.starterHtml, css: question.starterCss, js: question.starterJs }}
          reference={{
            html: question.referenceHtml ?? '',
            css: question.referenceCss ?? '',
            js: question.referenceJs ?? '',
          }}
        />
      </div>
    </div>
  );
}
