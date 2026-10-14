import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getExamContestStandings } from '@/server/services/integrity/contest-ranking';
import { Badge, Card, CardBody, CardHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ExamStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: { id: true, title: true, maxViolations: true },
  });

  if (!exam) notFound();

  const standings = await getExamContestStandings(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href={`/admin/exams/${exam.id}`} className="transition hover:text-white">
          &larr; Back to {exam.title}
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/results?examId=${exam.id}`} className="transition hover:text-white">
          Standard Results
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/exams/${exam.id}/similarity`} className="transition hover:text-white">
          Similarity Report
        </Link>
        <span>&middot;</span>
        <span className="text-slate-300">Contest Standings</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            DSA Contest Leaderboard & Standings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ranked by score (descending), then earliest last-accepted-submission time (tie-breaker) for{' '}
            <strong className="text-slate-700">{exam.title}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/api/admin/exams/${exam.id}/contest-results?format=csv`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            <span>📥 Export Standings (CSV)</span>
          </Link>
          <Link
            href={`/admin/exams/${exam.id}/similarity`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <span>🔍 Similarity Report</span>
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total Participants" value={standings.length} />
        <StatCard
          label="Top Score"
          value={standings[0] ? `${standings[0].score}/${standings[0].maxScore}` : '0'}
          hint={standings[0] ? `${standings[0].studentName}` : undefined}
        />
        <StatCard
          label="Leaderboard Tie-Breaker"
          value="Earliest Time"
          hint="Standard ICPC / DSA rule"
        />
        <StatCard
          label="CSV Protection"
          value="Formula Safe"
          hint="=, +, -, @ escaped"
        />
      </div>

      {/* Standings Table */}
      <Card>
        <CardHeader
          title={`Contest Standings (${standings.length} students)`}
          subtitle="Ranked strictly by marks achieved and time of final accepted question"
        />
        <CardBody className="p-0">
          {standings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No contest submissions recorded yet.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Rank</Th>
                  <Th>Student</Th>
                  <Th>Score</Th>
                  <Th>Solved</Th>
                  <Th>Last Accepted</Th>
                  <Th>Violations</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const isTop3 = row.rank <= 3;
                  const rankBadgeTone =
                    row.rank === 1 ? 'ok' : row.rank === 2 ? 'info' : row.rank === 3 ? 'warn' : 'neutral';
                  const stateBadgeTone =
                    row.state === 'PASSED' ? 'ok' : row.state === 'FAILED' ? 'bad' : 'neutral';
                  return (
                    <tr
                      key={row.userId}
                      className={isTop3 ? 'bg-amber-50/20 font-medium' : 'hover:bg-slate-50/50'}
                    >
                      <Td>
                        <Badge tone={rankBadgeTone}>#{row.rank}</Badge>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          <p className="font-semibold text-slate-900">{row.studentName}</p>
                          <p className="text-slate-500">{row.studentEmail}</p>
                          {row.batch && <p className="text-[10px] text-slate-400">Batch: {row.batch}</p>}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          <span className="font-mono font-semibold text-slate-900">
                            {row.score} / {row.maxScore}
                          </span>
                          <span className="ml-1 text-slate-500">({Math.round(row.percentage)}%)</span>
                        </div>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-slate-700">
                          {row.solvedCount} / {row.totalQuestions}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-slate-600">
                          {row.lastAcceptedSubmissionAt
                            ? formatDateTime(row.lastAcceptedSubmissionAt)
                            : '—'}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className={`text-xs font-mono ${
                            row.violationCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          {row.violationCount}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={stateBadgeTone}>
                          {row.state.toLowerCase()}
                        </Badge>
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
