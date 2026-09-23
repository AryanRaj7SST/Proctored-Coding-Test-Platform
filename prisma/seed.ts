/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { boxQuestion, gridQuestion, type SeedQuestion } from './seed-data';

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const STUDENT_EMAILS = (
  process.env.SEED_STUDENT_EMAILS ?? 'student1@example.com,student2@example.com,student3@example.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const BATCH = process.env.SEED_BATCH ?? '2029';

const spec = (body: unknown): string => JSON.stringify(body, null, 2);

async function upsertQuestion(q: SeedQuestion): Promise<string> {
  const points = q.tests.reduce((s, t) => s + t.points, 0);
  const existing = await prisma.question.findUnique({ where: { slug: q.slug } });

  const data = {
    title: q.title,
    slug: q.slug,
    description: q.description,
    instructions: q.instructions,
    type: 'WEB' as const,
    starterHtml: q.starterHtml,
    starterCss: q.starterCss,
    starterJs: q.starterJs,
    referenceHtml: q.referenceHtml,
    referenceCss: q.referenceCss,
    referenceJs: q.referenceJs,
    difficulty: 'EASY' as const,
    points,
    active: true,
    tags: ['html', 'css', 'javascript'],
  };

  const question = existing
    ? await prisma.question.update({ where: { id: existing.id }, data })
    : await prisma.question.create({ data });

  await prisma.questionTest.deleteMany({ where: { questionId: question.id } });
  for (const t of q.tests) {
    await prisma.questionTest.create({
      data: {
        questionId: question.id,
        name: t.name,
        description: t.description,
        testType: 'DECLARATIVE',
        testCode: spec(t.body),
        points: t.points,
        order: t.order,
        hidden: t.hidden,
      },
    });
  }
  console.log(`  question "${q.title}" (${points} points, ${q.tests.length} tests)`);
  return question.id;
}

async function main(): Promise<void> {
  console.log('Seeding development data...');

  // 1. Allowlist -------------------------------------------------------
  await prisma.allowedEmail.upsert({
    where: { email: ADMIN_EMAIL },
    create: { email: ADMIN_EMAIL, role: 'ADMIN', batch: 'STAFF', active: true, note: 'Seeded administrator' },
    update: { role: 'ADMIN', active: true },
  });
  for (const email of STUDENT_EMAILS) {
    await prisma.allowedEmail.upsert({
      where: { email },
      create: { email, role: 'STUDENT', batch: BATCH, active: true, note: 'Seeded student' },
      update: { role: 'STUDENT', batch: BATCH, active: true },
    });
  }
  console.log(`  allowlist: 1 admin + ${STUDENT_EMAILS.length} students`);

  // 2. Local user rows so the exam can be assigned before first sign-in.
  //    (Google sign-in refreshes name/image/role on first login.)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: { email: ADMIN_EMAIL, name: 'Seed Administrator', role: 'ADMIN', batch: 'STAFF' },
    update: { role: 'ADMIN' },
  });
  const students = [];
  for (const [i, email] of STUDENT_EMAILS.entries()) {
    students.push(
      await prisma.user.upsert({
        where: { email },
        create: { email, name: `Seed Student ${i + 1}`, role: 'STUDENT', batch: BATCH },
        update: { role: 'STUDENT', batch: BATCH },
      }),
    );
  }

  // 3. Questions -------------------------------------------------------
  const boxId = await upsertQuestion(boxQuestion);
  const gridId = await upsertQuestion(gridQuestion);

  // 4. Exam ------------------------------------------------------------
  const existingExam = await prisma.exam.findFirst({ where: { title: 'Web Dev 101 Mid Term' } });
  const exam = existingExam
    ? await prisma.exam.update({
        where: { id: existingExam.id },
        data: { durationMinutes: 120, status: 'PUBLISHED', active: true, batch: BATCH },
      })
    : await prisma.exam.create({
        data: {
          title: 'Web Dev 101 Mid Term',
          description: 'HTML, CSS and DOM fundamentals. Two questions, 120 minutes.',
          durationMinutes: 120,
          status: 'PUBLISHED',
          active: true,
          batch: BATCH,
          startTime: new Date(Date.now() - 60 * 60 * 1000),
          endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

  await prisma.examQuestion.deleteMany({ where: { examId: exam.id } });
  await prisma.examQuestion.createMany({
    data: [
      { examId: exam.id, questionId: boxId, order: 0 },
      { examId: exam.id, questionId: gridId, order: 1 },
    ],
  });

  await prisma.examAssignment.createMany({
    data: students.map((s) => ({ examId: exam.id, userId: s.id })),
    skipDuplicates: true,
  });
  console.log(`  exam "${exam.title}" with 2 questions, assigned to ${students.length} students`);

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'seed.completed',
      entity: 'System',
      metadata: { students: students.length },
    },
  });

  console.log('\nSeed complete.');
  console.log(`  Admin login:   ${ADMIN_EMAIL}`);
  console.log(`  Student login: ${STUDENT_EMAILS.join(', ')}`);
  console.log('\nNext: sign in with Google using an allowlisted address, then open /admin.');
  console.log('Questions are seeded as NOT_VALIDATED on purpose -- run "Validate Question"');
  console.log('in the admin UI so the reference solution proves the tests before you assign them.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
