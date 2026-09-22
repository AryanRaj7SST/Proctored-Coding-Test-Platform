import { describe, it, expect } from 'vitest';
import { seedQuestions, boxQuestion, gridQuestion } from '../../prisma/seed-data';
import { validateTestCaseBody, validateTestSuiteShape, totalPoints } from '@shared/test-spec';

/**
 * The seed is the first thing anyone runs, so a broken seed reads as a broken
 * product. These assertions check the shipped questions against exactly the
 * parser the runner uses -- if a seed test spec is malformed, this fails long
 * before a student ever sees it.
 */
describe('seed questions', () => {
  it('ships two worked examples', () => {
    expect(seedQuestions).toHaveLength(2);
  });

  for (const question of [boxQuestion, gridQuestion]) {
    describe(question.title, () => {
      it('has a title, a description and starter code', () => {
        expect(question.title.length).toBeGreaterThan(5);
        expect(question.description.length).toBeGreaterThan(20);
        expect(typeof question.starterHtml).toBe('string');
      });

      it('has a reference solution, so it can be validated', () => {
        const hasReference = Boolean(question.referenceHtml || question.referenceCss || question.referenceJs);
        expect(hasReference).toBe(true);
      });

      it('forms a valid test suite', () => {
        const result = validateTestSuiteShape(
          question.tests.map((t) => ({
            name: t.name,
            points: t.points,
            testType: 'DECLARATIVE',
            testCode: JSON.stringify(t.body),
          })),
        );
        if (!result.ok) throw new Error(result.errors.join('; '));
        expect(result.ok).toBe(true);
      });

      it('has every individual test body accepted by the runner parser', () => {
        for (const t of question.tests) {
          const parsed = validateTestCaseBody(t.body);
          if (!parsed.ok) throw new Error(`${t.name}: ${parsed.errors.join('; ')}`);
          expect(parsed.ok).toBe(true);
        }
      });

      it('has at least one assertion in every test', () => {
        for (const t of question.tests) {
          expect(t.body.assertions.length).toBeGreaterThan(0);
        }
      });

      it('has unique test names', () => {
        const names = question.tests.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
      });

      it('is worth a positive number of points', () => {
        expect(totalPoints(question.tests)).toBeGreaterThan(0);
      });

      it('exposes at least one visible test so the student is not flying blind', () => {
        expect(question.tests.some((t) => t.hidden === false)).toBe(true);
      });
    });
  }

  it('does not grade anything by inspecting source text', () => {
    const serialised = JSON.stringify(seedQuestions);
    expect(serialised).not.toContain('sourceContains');
    expect(serialised).not.toContain('addEventListener"');
  });
});
