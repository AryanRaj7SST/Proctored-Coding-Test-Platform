import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { QuestionForm } from '@/components/admin/QuestionForm';

export const dynamic = 'force-dynamic';

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const question = await prisma.question.findUnique({
    where: { id },
    include: { tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) notFound();

  return (
    <QuestionForm
      initial={{
        id: question.id,
        title: question.title,
        description: question.description,
        instructions: question.instructions ?? '',
        difficulty: question.difficulty,
        mediaUrl: question.mediaUrl ?? '',
        tags: question.tags.join(', '),
        active: question.active,
        starterHtml: question.starterHtml,
        starterCss: question.starterCss,
        starterJs: question.starterJs,
        referenceHtml: question.referenceHtml ?? '',
        referenceCss: question.referenceCss ?? '',
        referenceJs: question.referenceJs ?? '',
        validation: question.validation,
        validationMessage: question.validationMessage,
        version: question.version,
      }}
      initialTests={question.tests.map((t) => ({
        _key: t.id,
        id: t.id,
        name: t.name,
        description: t.description ?? '',
        testType: t.testType,
        testCode: t.testCode,
        expectedBehavior: t.expectedBehavior ?? '',
        points: t.points,
        order: t.order,
        hidden: t.hidden,
      }))}
    />
  );
}
