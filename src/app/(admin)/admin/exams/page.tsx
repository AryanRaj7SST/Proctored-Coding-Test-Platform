import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDateTime, statusTone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ExamsPage() {
  await requireAdmin();
  const exams = await prisma.exam.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { questions: true, assignments: true, attempts: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Exams</h1>
          <p className="mt-1 text-sm text-slate-400">
            Assemble questions, set the duration, assign students.
          </p>
        </div>
        <Link
          href="/admin/exams/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New exam
        </Link>
      </div>

      <Card>
        <CardHeader title="All exams" subtitle={`${exams.length} total`} />
        <CardBody className="p-0">
          {exams.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No exams yet"
                description="Create an exam and attach validated questions to it."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Duration</Th>
                  <Th>Questions</Th>
                  <Th>Assigned</Th>
                  <Th>Attempts</Th>
                  <Th>Window</Th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      <Link
                        href={`/admin/exams/${e.id}`}
                        className="font-medium text-slate-100 hover:underline"
                      >
                        {e.title}
                      </Link>
                      {e.batch ? <p className="text-xs text-slate-500">batch {e.batch}</p> : null}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(e.status)}>{e.status.toLowerCase()}</Badge>
                    </Td>
                    <Td className="text-slate-400">{e.durationMinutes} min</Td>
                    <Td className="text-slate-400">{e._count.questions}</Td>
                    <Td className="text-slate-400">{e._count.assignments}</Td>
                    <Td className="text-slate-400">
                      {e._count.attempts > 0 ? (
                        <Link
                          href={`/admin/attempts?examId=${e.id}`}
                          className="text-brand-300 hover:underline"
                          title="View all attempts for this exam"
                        >
                          {e._count.attempts}
                        </Link>
                      ) : (
                        e._count.attempts
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {e.startTime ? formatDateTime(e.startTime) : 'anytime'} →{' '}
                      {e.endTime ? formatDateTime(e.endTime) : 'no close'}
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
