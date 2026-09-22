import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const VALIDATION_TONE = { PASSED: 'ok', FAILED: 'bad', NOT_VALIDATED: 'warn' } as const;

export default async function QuestionsPage() {
  await requireAdmin();
  const questions = await prisma.question.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { tests: true, examQuestions: true, attempts: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Questions</h1>
          <p className="mt-1 text-sm text-slate-400">
            A question must pass validation against its reference solution before it can go into a published exam.
          </p>
        </div>
        <Link
          href="/admin/questions/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New question
        </Link>
      </div>

      <Card>
        <CardHeader title="All questions" subtitle={`${questions.length} total`} />
        <CardBody className="p-0">
          {questions.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No questions yet"
                description="Create your first question, add behaviour tests, then validate it against a reference solution."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Difficulty</Th>
                  <Th>Tests</Th>
                  <Th>Points</Th>
                  <Th>Validation</Th>
                  <Th>Used by</Th>
                  <Th>Updated</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <Td>
                      <Link href={`/admin/questions/${q.id}/edit`} className="font-medium text-slate-100 hover:underline">
                        {q.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        /{q.slug} · v{q.version}
                        {q.active ? '' : ' · inactive'}
                      </p>
                    </Td>
                    <Td className="text-slate-400">{q.difficulty.toLowerCase()}</Td>
                    <Td className="text-slate-400">{q._count.tests}</Td>
                    <Td className="text-slate-400">{q.points}</Td>
                    <Td>
                      <Badge tone={VALIDATION_TONE[q.validation as keyof typeof VALIDATION_TONE] ?? 'warn'}>
                        {q.validation.replace('_', ' ').toLowerCase()}
                      </Badge>
                    </Td>
                    <Td className="text-slate-400">
                      {q._count.examQuestions} exam{q._count.examQuestions === 1 ? '' : 's'} · {q._count.attempts}{' '}
                      attempt{q._count.attempts === 1 ? '' : 's'}
                    </Td>
                    <Td className="text-slate-500">{formatDateTime(q.updatedAt)}</Td>
                    <Td>
                      <div className="flex gap-2 text-xs">
                        <Link href={`/admin/questions/${q.id}/preview`} className="text-brand-300 hover:underline">
                          Preview
                        </Link>
                        <Link href={`/admin/questions/${q.id}/edit`} className="text-brand-300 hover:underline">
                          Edit
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
