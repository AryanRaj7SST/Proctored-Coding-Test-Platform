import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { listStudentExams } from '@/server/services/exams';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDateTime, percentage } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Student results view (product requirement #31): scores per question, but
 * never the hidden test bodies and never another student's work.
 */
export default async function StudentExamsPage() {
  const user = await requireUser();
  const exams = await listStudentExams(user.id);

  const attempts = await prisma.attempt.findMany({
    where: { userId: user.id, status: { not: 'IN_PROGRESS' } },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      score: true,
      maxScore: true,
      status: true,
      submittedAt: true,
      exam: { select: { id: true, title: true } },
      question: { select: { title: true } },
      testResults: { where: { final: true }, select: { passed: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">My assessments</h1>
        <p className="mt-1 text-sm text-slate-400">
          Scores appear as soon as a question is graded. Hidden test cases stay hidden.
        </p>
      </div>

      <Card>
        <CardHeader title="Assigned exams" subtitle={`${exams.length} total`} />
        <CardBody className="p-0">
          {exams.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nothing assigned yet" />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Exam</Th>
                  <Th>Status</Th>
                  <Th>Questions</Th>
                  <Th>Score</Th>
                  <Th>Closes</Th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id}>
                    <Td className="font-medium text-slate-100">{e.title}</Td>
                    <Td>
                      <Badge tone={e.availability === 'SUBMITTED' ? 'ok' : 'neutral'}>
                        {e.availability.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </Td>
                    <Td className="text-slate-400">
                      {e.submittedCount}/{e.questionCount}
                    </Td>
                    <Td className="text-slate-300">
                      {e.score !== null
                        ? `${e.score}/${e.maxScore} (${percentage(e.score, e.maxScore ?? 0)}%)`
                        : '—'}
                    </Td>
                    <Td className="text-slate-500">{e.endTime ? formatDateTime(e.endTime) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Graded questions" subtitle={`${attempts.length} submitted`} />
        <CardBody className="p-0">
          {attempts.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No submissions yet"
                description="Questions you submit will be listed here."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Question</Th>
                  <Th>Exam</Th>
                  <Th>Tests passed</Th>
                  <Th>Score</Th>
                  <Th>Submitted</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium text-slate-100">{a.question.title}</Td>
                    <Td className="text-slate-400">{a.exam.title}</Td>
                    <Td className="text-slate-400">
                      {a.testResults.filter((r) => r.passed).length}/{a.testResults.length}
                    </Td>
                    <Td className="text-slate-200">
                      {a.score}/{a.maxScore}
                    </Td>
                    <Td className="text-slate-500">{formatDateTime(a.submittedAt)}</Td>
                    <Td>
                      <a
                        href={`/practice/${a.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20"
                      >
                        Practice
                      </a>
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
