import { describe, it, expect } from 'vitest';
import { questionState } from '@/components/exam/QuestionStatus';

/** What the workspace shows per question, from server fields only. */
describe('questionState', () => {
  it('an open question is not submitted', () => {
    expect(questionState({ status: 'IN_PROGRESS' })).toBe('NOT_SUBMITTED');
  });

  it('a submitted question without a grade is pending -- never failed or 0', () => {
    expect(questionState({ status: 'SUBMITTED', gradingPending: true })).toBe('PENDING');
    expect(questionState({ status: 'SUBMITTED', resultStatus: 'RUNNER_ERROR' })).toBe('PENDING');
    expect(questionState({ status: 'AUTO_SUBMITTED', resultStatus: null })).toBe('PENDING');
  });

  it('graded questions show the server result', () => {
    expect(questionState({ status: 'SUBMITTED', resultStatus: 'PASSED' })).toBe('PASSED');
    expect(questionState({ status: 'SUBMITTED', resultStatus: 'PARTIAL' })).toBe('PARTIAL');
    expect(questionState({ status: 'AUTO_SUBMITTED', resultStatus: 'FAILED' })).toBe('FAILED');
  });

  it('pending wins over a stale result', () => {
    expect(questionState({ status: 'SUBMITTED', gradingPending: true, resultStatus: 'PASSED' })).toBe(
      'PENDING',
    );
  });
});
