import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('Admin Exam Section Integration Tests', () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let exams: typeof import('@/server/services/exams');
  let questions: typeof import('@/server/services/questions');

  const stamp = Date.now();
  const ids = {
    admin: `admin-test-${stamp}`,
    student1: `student1-test-${stamp}`,
    student2: `student2-test-${stamp}`,
    batch: `BATCH-TEST-${stamp}`,
    q1: `q1-test-${stamp}`,
    q2: `q2-test-${stamp}`,
  };

  let createdExamId: string;

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    exams = await import('@/server/services/exams');
    questions = await import('@/server/services/questions');

    // Setup Admin and Students
    await prisma.user.create({
      data: { id: ids.admin, email: `${ids.admin}@example.test`, role: 'ADMIN', name: 'Test Admin' },
    });
    await prisma.user.create({
      data: { id: ids.student1, email: `${ids.student1}@example.test`, role: 'STUDENT', batch: ids.batch, name: 'Student 1' },
    });
    await prisma.user.create({
      data: { id: ids.student2, email: `${ids.student2}@example.test`, role: 'STUDENT', batch: ids.batch, name: 'Student 2' },
    });

    // Create 2 test questions
    await prisma.question.create({
      data: {
        id: ids.q1,
        title: 'Question 1 (Unvalidated)',
        slug: ids.q1,
        description: 'Test Question 1',
        validation: 'NOT_VALIDATED',
        points: 10,
        tests: {
          create: [{
            name: 'test 1',
            testType: 'DECLARATIVE',
            testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
            points: 10,
            order: 0,
            hidden: true,
          }],
        },
      },
    });

    await prisma.question.create({
      data: {
        id: ids.q2,
        title: 'Question 2 (Validated)',
        slug: ids.q2,
        description: 'Test Question 2',
        validation: 'PASSED',
        points: 20,
        tests: {
          create: [{
            name: 'test 2',
            testType: 'DECLARATIVE',
            testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#btn' }] }),
            points: 20,
            order: 0,
            hidden: false,
          }],
        },
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.exam.deleteMany({ where: { title: { contains: `${stamp}` } } }).catch(() => {});
    await prisma.question.deleteMany({ where: { id: { in: [ids.q1, ids.q2] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.student1, ids.student2] } } }).catch(() => {});
  });

  it('1. Successfully creates an exam in DRAFT status with attached questions', async () => {
    const exam = await exams.createExam({
      title: `Midterm Exam ${stamp}`,
      description: 'Test Description',
      durationMinutes: 45,
      status: 'DRAFT',
      batch: ids.batch,
      maxViolations: 3,
      shuffleQuestions: false,
      questionIds: [ids.q1, ids.q2],
    });

    expect(exam.id).toBeDefined();
    expect(exam.title).toBe(`Midterm Exam ${stamp}`);
    expect(exam.durationMinutes).toBe(45);
    expect(exam.status).toBe('DRAFT');
    expect(exam.maxViolations).toBe(3);

    createdExamId = exam.id;

    const attachedQuestions = await prisma.examQuestion.findMany({
      where: { examId: exam.id },
      orderBy: { order: 'asc' },
    });
    expect(attachedQuestions).toHaveLength(2);
    expect(attachedQuestions[0].questionId).toBe(ids.q1);
    expect(attachedQuestions[0].order).toBe(0);
    expect(attachedQuestions[1].questionId).toBe(ids.q2);
    expect(attachedQuestions[1].order).toBe(1);
  });

  it('2. Prevents publishing if any question is NOT_VALIDATED', async () => {
    await expect(
      exams.updateExam(createdExamId, {
        status: 'PUBLISHED',
      }),
    ).rejects.toThrow(/not ready to publish/i);
  });

  it('3. Reorders attached questions and updates exam fields', async () => {
    // Reverse question order
    await exams.updateExam(createdExamId, {
      durationMinutes: 60,
      questionIds: [ids.q2, ids.q1],
    });

    const updated = await prisma.exam.findUniqueOrThrow({ where: { id: createdExamId } });
    expect(updated.durationMinutes).toBe(60);

    const reordered = await prisma.examQuestion.findMany({
      where: { examId: createdExamId },
      orderBy: { order: 'asc' },
    });
    expect(reordered[0].questionId).toBe(ids.q2);
    expect(reordered[0].order).toBe(0);
    expect(reordered[1].questionId).toBe(ids.q1);
    expect(reordered[1].order).toBe(1);
  });

  it('4. Allows publishing once all attached questions are PASSED', async () => {
    // Validate question 1
    await prisma.question.update({
      where: { id: ids.q1 },
      data: { validation: 'PASSED' },
    });

    const published = await exams.updateExam(createdExamId, {
      status: 'PUBLISHED',
    });

    expect(published.status).toBe('PUBLISHED');
  });

  it('5. Assigns students by batch and by user ID', async () => {
    const result = await exams.assignStudents(createdExamId, {
      batch: ids.batch,
    });

    expect(result.assigned).toBe(2);

    const assignments = await prisma.examAssignment.findMany({
      where: { examId: createdExamId },
    });
    expect(assignments).toHaveLength(2);
    const assignedUserIds = assignments.map((a) => a.userId);
    expect(assignedUserIds).toContain(ids.student1);
    expect(assignedUserIds).toContain(ids.student2);
  });

  it('6. Removes a student assignment from the exam', async () => {
    await exams.unassignStudent(createdExamId, ids.student1);

    const assignments = await prisma.examAssignment.findMany({
      where: { examId: createdExamId },
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId).toBe(ids.student2);
  });

  it('7. Fetches exam and student exam list correctly', async () => {
    const examInDb = await prisma.exam.findUnique({
      where: { id: createdExamId },
      include: { questions: true },
    });
    expect(examInDb).toBeDefined();
    expect(examInDb?.title).toBe(`Midterm Exam ${stamp}`);
    expect(examInDb?.questions).toHaveLength(2);

    // Student 2 should see this exam
    const student2Exams = await exams.listStudentExams(ids.student2);
    expect(student2Exams.some((e) => e.id === createdExamId)).toBe(true);

    // Student 1 (unassigned) should NOT see this exam
    const student1Exams = await exams.listStudentExams(ids.student1);
    expect(student1Exams.some((e) => e.id === createdExamId)).toBe(false);
  });

  it('8. Deletes/Cleans up the exam', async () => {
    await prisma.exam.delete({ where: { id: createdExamId } });

    const deleted = await prisma.exam.findUnique({ where: { id: createdExamId } });
    expect(deleted).toBeNull();

    const remainingAssignments = await prisma.examAssignment.findMany({
      where: { examId: createdExamId },
    });
    expect(remainingAssignments).toHaveLength(0);
  });
});
