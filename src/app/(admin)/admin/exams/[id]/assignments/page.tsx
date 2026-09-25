import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { testPhase } from '@/lib/timing';
import { listAssignments } from '@/server/services/assignments';
import { AssignmentsManager } from '@/components/admin/tests/assignments/AssignmentsManager';
import type { AssignmentRow, AssignmentsTestInfo } from '@/components/admin/tests/types';
import { asJson, loadStudentScope } from '../../_lib/data';

export const dynamic = 'force-dynamic';

export default async function TestAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      accessMode: true,
      maxAttempts: true,
      timezone: true,
      batch: true,
    },
  });
  if (!exam) notFound();

  const [rows, scope] = await Promise.all([listAssignments(id), loadStudentScope()]);
  const test: AssignmentsTestInfo = {
    id: exam.id,
    title: exam.title,
    status: exam.status as AssignmentsTestInfo['status'],
    phase: testPhase(exam),
    accessMode: exam.accessMode,
    maxAttempts: exam.maxAttempts,
    timezone: exam.timezone,
    batch: exam.batch,
  };

  return (
    <AssignmentsManager
      key={id}
      test={test}
      initialRows={asJson<AssignmentRow[]>(rows)}
      batches={scope.batches}
      studentCount={scope.studentCount}
    />
  );
}
