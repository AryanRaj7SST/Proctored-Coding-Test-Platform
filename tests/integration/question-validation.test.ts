import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * A2 regression against the real updateQuestion + publishing rules: a
 * validated question stays validated through metadata edits.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb(
  'question validation survives metadata edits (requires DATABASE_URL)',
  { timeout: 120_000 },
  () => {
    let prisma: typeof import('@/lib/prisma').prisma;
    let questions: typeof import('@/server/services/questions');
    const id = `it-qv-${Date.now()}`;

    const formPayload = async () => {
      const q = await prisma.question.findUniqueOrThrow({
        where: { id },
        include: { tests: { orderBy: { order: 'asc' } } },
      });
      // Mirrors QuestionForm: every field, tests without their DB order.
      return {
        title: q.title,
        description: q.description,
        starterHtml: q.starterHtml,
        starterCss: q.starterCss,
        starterJs: q.starterJs,
        referenceHtml: q.referenceHtml ?? '',
        referenceCss: q.referenceCss ?? '',
        referenceJs: q.referenceJs ?? '',
        tags: q.tags,
        tests: q.tests.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          testType: t.testType,
          testCode: t.testCode,
          expectedBehavior: t.expectedBehavior,
          enabled: t.enabled,
        })),
      };
    };
    const markValidated = () =>
      prisma.question.update({
        where: { id },
        data: { validation: 'PASSED', validatedAt: new Date(), status: 'VALIDATED' },
      });
    const row = () => prisma.question.findUniqueOrThrow({ where: { id }, include: { tests: true } });

    beforeAll(async () => {
      prisma = (await import('@/lib/prisma')).prisma;
      questions = await import('@/server/services/questions');
      await prisma.question.create({
        data: {
          id,
          title: 'Validation question',
          slug: id,
          description: 'Make the box exist.',
          starterHtml: '<div id="box"></div>',
          referenceHtml: '<div id="box"></div>',
          marks: 10,
          tests: {
            create: [
              {
                name: 'box exists',
                testType: 'DECLARATIVE',
                testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
                order: 0,
              },
            ],
          },
        },
      });
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.question.deleteMany({ where: { id } });
      await prisma.$disconnect();
    });

    it('validation followed by a title/tags edit keeps PASSED, the version and the test ids', async () => {
      await markValidated();
      const before = await row();
      await questions.updateQuestion(id, {
        ...(await formPayload()),
        title: 'Renamed',
        tags: ['dom'],
      } as never);
      const after = await row();
      expect(after.validation).toBe('PASSED');
      expect(after.version).toBe(before.version);
      expect(after.tests.map((t) => t.id)).toEqual(before.tests.map((t) => t.id));
      expect(questions.publishBlockers(after)).toEqual([]);
    });

    it('no-op save keeps everything', async () => {
      await markValidated();
      const before = await row();
      await questions.updateQuestion(id, (await formPayload()) as never);
      const after = await row();
      expect(after.validation).toBe('PASSED');
      expect(after.version).toBe(before.version);
    });

    it('a description change resets validation, bumps the version and blocks publishing', async () => {
      await markValidated();
      const before = await row();
      await questions.updateQuestion(id, {
        ...(await formPayload()),
        description: 'Make TWO boxes.',
      } as never);
      const after = await row();
      expect(after.validation).toBe('NOT_VALIDATED');
      expect(after.version).toBe(before.version + 1);
      expect(questions.publishBlockers(after).length).toBeGreaterThan(0);
    });

    it('a reference-solution change resets validation without bumping the version', async () => {
      await markValidated();
      const before = await row();
      await questions.updateQuestion(id, {
        ...(await formPayload()),
        referenceCss: '#box{color:red}',
      } as never);
      const after = await row();
      expect(after.validation).toBe('NOT_VALIDATED');
      expect(after.version).toBe(before.version);
    });

    it('a test change resets validation, bumps the version and returns the question to DRAFT', async () => {
      await markValidated();
      const before = await row();
      const payload = await formPayload();
      payload.tests[0]!.testCode = JSON.stringify({ assertions: [{ type: 'visible', selector: '#box' }] });
      const { impact } = await questions.updateQuestion(id, payload as never);
      const after = await row();
      expect(impact.testsChanged).toBe(true);
      expect(after.validation).toBe('NOT_VALIDATED');
      expect(after.version).toBe(before.version + 1);
      expect(after.status).toBe('DRAFT');
    });

    it('changing only the marks keeps validation, version and status', async () => {
      await markValidated();
      const before = await row();
      const { impact } = await questions.updateQuestion(id, {
        ...(await formPayload()),
        marks: '12.5',
      } as never);
      const after = await row();
      expect(impact.marksChanged).toBe(true);
      expect(after.marks.toFixed(2)).toBe('12.50');
      expect(after.validation).toBe('PASSED');
      expect(after.version).toBe(before.version);
      expect(after.status).toBe('VALIDATED');
    });
  },
);
