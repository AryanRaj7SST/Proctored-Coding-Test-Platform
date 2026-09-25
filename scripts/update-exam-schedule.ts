import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Updating exam schedule and student visibility...');

  // 1. Hide any other exam so ONLY "Lab Quiz 1" shows on student portals
  const deactivated = await prisma.exam.updateMany({
    where: {
      id: { not: 'lab-quiz-1' },
    },
    data: {
      active: false,
      status: 'DRAFT',
    },
  });
  console.log(`Deactivated ${deactivated.count} other exam(s).`);

  // 2. Schedule "Lab Quiz 1" for 4:30 PM to 7:00 PM today (IST)
  // Today: 2026-09-23
  // 4:30 PM IST = 16:30 IST = 11:00:00.000Z
  // 7:00 PM IST = 19:00 IST = 13:30:00.000Z
  const startTime = new Date('2026-09-23T11:00:00.000Z');
  const endTime = new Date('2026-09-23T13:30:00.000Z');

  const quiz1 = await prisma.exam.update({
    where: { id: 'lab-quiz-1' },
    data: {
      active: true,
      status: 'PUBLISHED',
      startTime,
      endTime,
      durationMinutes: 90,
    },
  });

  console.log('Lab Quiz 1 updated:');
  console.log(`  ID: ${quiz1.id}`);
  console.log(`  Title: ${quiz1.title}`);
  console.log(`  Start: ${quiz1.startTime?.toISOString()} (4:30 PM IST)`);
  console.log(`  End:   ${quiz1.endTime?.toISOString()} (7:00 PM IST)`);
  console.log(`  Duration: ${quiz1.durationMinutes} minutes`);
  console.log(`  Status: ${quiz1.status}, Active: ${quiz1.active}`);

  // 3. Verify student assignments
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', active: true },
    select: { id: true, email: true },
  });

  console.log(`Ensuring all ${students.length} students are assigned to Lab Quiz 1...`);
  await prisma.examAssignment.createMany({
    data: students.map((s) => ({
      examId: 'lab-quiz-1',
      userId: s.id,
      email: s.email,
    })),
    skipDuplicates: true,
  });

  // Verify what an ordinary student sees vs agnihotriaryan5361@gmail.com
  const assignments = await prisma.examAssignment.findMany({
    where: {
      exam: { active: true, status: { notIn: ['DRAFT', 'ARCHIVED'] } },
    },
    select: {
      exam: { select: { id: true, title: true } },
      user: { select: { email: true } },
    },
  });

  console.log(`Total active exam assignments across platform: ${assignments.length}`);
  const uniqueExams = Array.from(new Set(assignments.map((a) => a.exam.title)));
  console.log('Active exams visible on student portals:', uniqueExams);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
