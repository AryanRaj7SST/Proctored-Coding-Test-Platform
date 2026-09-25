import type { QuestionStatus } from '@prisma/client';
import type { QuestionChangeImpact } from '@/lib/question-changes';
import { recordAudit } from './audit';

/**
 * Audit a question edit with what actually changed: content, test cases,
 * reference solution, student text, marks -- and any lifecycle consequence
 * (a validated or published question going back to DRAFT). Never logs code.
 */
export async function auditQuestionUpdate(
  adminId: string,
  question: { id: string; version: number; status: QuestionStatus },
  impact: QuestionChangeImpact & { marksChanged: boolean; previousStatus: QuestionStatus },
): Promise<void> {
  const changed = [
    impact.contentChanged && 'content',
    impact.testsChanged && 'test_cases',
    impact.referenceChanged && 'reference_solution',
    impact.textChanged && 'student_text',
    impact.marksChanged && 'marks',
  ].filter((c): c is string => Boolean(c));

  await recordAudit({
    userId: adminId,
    action: impact.testsChanged ? 'question.test_cases_changed' : 'question.updated',
    entity: 'Question',
    entityId: question.id,
    metadata: {
      changed,
      version: question.version,
      ...(question.status !== impact.previousStatus
        ? { status: { from: impact.previousStatus, to: question.status } }
        : {}),
    },
  });
}
