import Link from 'next/link';
import { requireAuth } from '@/lib/authz';
import { listMySittings } from '@/server/services/results';
import { Badge, Card, CardBody, EmptyState, Table, Td, Th } from '@/components/ui';
import { displayMarks, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATE: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' }> = {
  IN_PROGRESS: { label: 'In progress', tone: 'warn' },
  GRADING_PENDING: { label: 'Grading pending', tone: 'warn' },
  PASSED: { label: 'Passed', tone: 'ok' },
  FAILED: { label: 'Not passed', tone: 'bad' },
};

/**
 * Every attempt the student has made. Scores follow each test's result
 * visibility; the detail page shows the per-question breakdown when allowed.
 */
export default async function MyResultsPage() {
  const user = await requireAuth();
  const sittings = await listMySittings(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">My results</h1>
        <p className="mt-1 text-sm text-slate-400">Every test attempt you have made, newest first.</p>
      </div>
      <Card>
        <CardBody className="p-0">
          {sittings.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No attempts yet" description="Tests you start will be listed here." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Test</Th>
                  <Th>Attempt</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th>Submitted</Th>
                  <Th>
                    <span className="sr-only">Details</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sittings.map((s) => {
                  const state = s.resultsHidden && s.state !== 'IN_PROGRESS' ? null : STATE[s.state];
                  return (
                    <tr key={s.sessionId}>
                      <Td className="font-medium text-slate-100">{s.examTitle}</Td>
                      <Td className="text-slate-400">#{s.attemptNumber}</Td>
                      <Td>
                        {state ? (
                          <Badge tone={state.tone}>{state.label}</Badge>
                        ) : (
                          <Badge tone="info">Submitted</Badge>
                        )}
                      </Td>
                      <Td className="text-slate-300">
                        {s.score !== null
                          ? `${displayMarks(s.score)}/${displayMarks(s.maxScore)} (${displayMarks(s.percentage)}%)`
                          : '—'}
                      </Td>
                      <Td className="text-xs text-slate-400">{formatDateTime(s.submittedAt)}</Td>
                      <Td>
                        {s.state !== 'IN_PROGRESS' ? (
                          <Link
                            href={`/results/${s.sessionId}`}
                            className="text-xs text-brand-300 hover:underline"
                          >
                            View
                          </Link>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
