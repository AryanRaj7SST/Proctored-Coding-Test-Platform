import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getQuestionSimilarityReport } from '@/server/services/integrity/similarity';
import { Badge, Card, CardBody, CardHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { SimilarityPromotionButton } from '@/components/admin/integrity/SimilarityPromotionButton';

export const dynamic = 'force-dynamic';

export default async function ExamSimilarityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ questionId?: string; threshold?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { questionId: selectedQuestionId, threshold: thresholdParam } = await searchParams;

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { question: { select: { id: true, title: true } } },
      },
    },
  });

  if (!exam) notFound();

  const activeQuestionId = selectedQuestionId ?? exam.questions[0]?.questionId;

  const threshold = thresholdParam ? Number(thresholdParam) : 0.75;
  const safeThreshold = Number.isFinite(threshold) ? Math.min(1.0, Math.max(0.1, threshold)) : 0.75;

  let report = null;
  if (activeQuestionId) {
    try {
      report = await getQuestionSimilarityReport({
        examId: id,
        questionId: activeQuestionId,
        adminId: admin.id,
        threshold: safeThreshold,
      });
    } catch {
      report = null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href={`/admin/exams/${exam.id}`} className="transition hover:text-white">
          &larr; Back to {exam.title}
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/results?examId=${exam.id}`} className="transition hover:text-white">
          Results
        </Link>
        <span>&middot;</span>
        <span className="text-slate-300">Similarity Detection</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Code Similarity & Plagiarism Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Normalised token streams (strip comments/whitespace, rename identifiers to placeholders) and
            Jaccard shingling for <strong className="text-slate-700">{exam.title}</strong>.
          </p>
        </div>
      </div>

      {/* Question Selector Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {exam.questions.map((eq, idx) => {
          const isActive = eq.questionId === activeQuestionId;
          return (
            <Link
              key={eq.questionId}
              href={`/admin/exams/${exam.id}/similarity?questionId=${eq.questionId}&threshold=${safeThreshold}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Q{idx + 1}: {eq.question.title}
            </Link>
          );
        })}
      </div>

      {/* Threshold filter */}
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Sensitivity Threshold:</span>
        {[0.65, 0.75, 0.85, 0.95].map((th) => {
          const isSelected = Math.abs(safeThreshold - th) < 0.01;
          return (
            <Link
              key={th}
              href={`/admin/exams/${exam.id}/similarity?questionId=${activeQuestionId}&threshold=${th}`}
              className={`rounded px-2.5 py-1 font-mono text-xs transition ${
                isSelected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {Math.round(th * 100)}%
            </Link>
          );
        })}
      </div>

      {/* Stats Summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Submissions Analyzed" value={report ? report.totalSubmissions : 0} />
        <StatCard
          label="Flagged Pairs"
          value={report ? report.flaggedPairs.length : 0}
          hint={report && report.flaggedPairs.length > 0 ? 'Exceeds threshold' : 'Clean'}
        />
        <StatCard
          label="Threshold"
          value={`${Math.round(safeThreshold * 100)}%`}
          hint="Jaccard 3-shingle similarity"
        />
        <StatCard label="Question" value={report?.questionTitle ?? 'N/A'} />
      </div>

      {/* Flagged Pairs Table */}
      <Card>
        <CardHeader
          title={report ? `Flagged Submission Pairs (${report.flaggedPairs.length})` : 'Similarity Report'}
          subtitle={`Pairs with normalised Jaccard similarity ≥ ${Math.round(safeThreshold * 100)}%`}
        />
        <CardBody className="p-0">
          {!report || report.flaggedPairs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No submission pairs exceeded the {Math.round(safeThreshold * 100)}% similarity threshold for
              this question.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Similarity</Th>
                  <Th>Student A</Th>
                  <Th>Student B</Th>
                  <Th>Tokens (A / B)</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {report.flaggedPairs.map((pair, idx) => {
                  const pct = Math.round(pair.similarity * 100);
                  const tone = pct >= 90 ? 'bad' : 'warn';
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <Td>
                        <Badge tone={tone}>{pct}% similar</Badge>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          <p className="font-medium text-slate-900">
                            {pair.studentA.name ?? pair.studentA.email}
                          </p>
                          <p className="text-slate-500">{pair.studentA.email}</p>
                          {pair.studentA.batch && (
                            <p className="text-[10px] text-slate-400">Batch: {pair.studentA.batch}</p>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          <p className="font-medium text-slate-900">
                            {pair.studentB.name ?? pair.studentB.email}
                          </p>
                          <p className="text-slate-500">{pair.studentB.email}</p>
                          {pair.studentB.batch && (
                            <p className="text-[10px] text-slate-400">Batch: {pair.studentB.batch}</p>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-slate-600">
                          {pair.tokensA} / {pair.tokensB}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 text-xs">
                          <Link
                            href={`/admin/attempts/${pair.attemptAId}`}
                            target="_blank"
                            className="text-blue-600 hover:underline"
                          >
                            View A
                          </Link>
                          <span>&middot;</span>
                          <Link
                            href={`/admin/attempts/${pair.attemptBId}`}
                            target="_blank"
                            className="text-blue-600 hover:underline"
                          >
                            View B
                          </Link>
                          <span>&middot;</span>
                          <SimilarityPromotionButton
                            examId={exam.id}
                            attemptAId={pair.attemptAId}
                            attemptBId={pair.attemptBId}
                          />
                        </div>
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
