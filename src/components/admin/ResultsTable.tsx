import Link from 'next/link';
import { Badge, EmptyState, Table, Td, Th } from '@/components/ui';
import type { ResultRow } from '@/server/services/results';
import { ClickableRow } from './results/ClickableRow';
import { SITTING_STATE, formatInZone, formatPercent, formatScore } from './results/format';

/**
 * Results list: one row per sitting (by default each student's best sitting
 * per test). Every number is the stored, server-computed grade.
 * Server component; only the row click is client-side.
 */
export function ResultsTable({
  rows,
  timeZones = {},
  view = 'best',
  filtered = false,
}: {
  rows: ResultRow[];
  /** examId -> the test's IANA zone, used for the submitted timestamp. */
  timeZones?: Record<string, string>;
  /** In the best-sitting view each row shows "best of N" from its sitting count. */
  view?: 'best' | 'all';
  filtered?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title={filtered ? 'No results match these filters' : 'No results yet'}
          description={
            filtered
              ? 'Try another test, batch or status, or reset the filters.'
              : 'Results appear here once students start a test.'
          }
        />
      </div>
    );
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>Student</Th>
          <Th>Test</Th>
          <Th>Attempt</Th>
          <Th>Result</Th>
          <Th className="text-right">Score</Th>
          <Th className="text-right">%</Th>
          <Th>Submitted</Th>
          <Th className="text-right">Violations</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = `/admin/results/${r.sessionId}`;
          const state = SITTING_STATE[r.state];
          const sittings = view === 'best' ? r.sittingCount : 0;
          const zone = timeZones[r.examId];
          return (
            <ClickableRow key={r.sessionId} href={href}>
              <Td>
                <Link
                  href={href}
                  className="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                >
                  {r.studentName}
                </Link>
                <p className="text-xs text-slate-500">
                  {r.studentEmail}
                  {r.batch ? ` · ${r.batch}` : ''}
                </p>
              </Td>
              <Td className="font-medium text-slate-700">{r.examTitle}</Td>
              <Td className="whitespace-nowrap">
                <span className="font-medium text-slate-800">#{r.attemptNumber}</span>
                {sittings > 1 ? <p className="text-xs text-slate-500">best of {sittings}</p> : null}
              </Td>
              <Td>
                <Badge tone={state.tone}>{state.label}</Badge>
              </Td>
              <Td className="whitespace-nowrap text-right font-mono text-xs font-semibold text-slate-900">
                <span title={r.score !== null ? `${r.score} / ${r.maxScore}` : 'No score yet'}>
                  {formatScore(r.score, r.maxScore)}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-right font-mono text-xs font-medium text-slate-800">
                {formatPercent(r.percentage)}
              </Td>
              <Td className="whitespace-nowrap text-xs text-slate-500">
                {r.submittedAt ? (
                  <span title={formatInZone(r.submittedAt, zone, true)}>
                    {formatInZone(r.submittedAt, zone)}
                  </span>
                ) : (
                  <span className="text-slate-400">Not submitted</span>
                )}
              </Td>
              <Td className="text-right">
                <Badge tone={r.violationCount > 0 ? 'bad' : 'neutral'}>{r.violationCount}</Badge>
              </Td>
            </ClickableRow>
          );
        })}
      </tbody>
    </Table>
  );
}
