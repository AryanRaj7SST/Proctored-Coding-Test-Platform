import { describe, it, expect } from 'vitest';
import { questionChangeImpact, type StoredQuestionForDiff } from '@/lib/question-changes';

/** A2 regression: only real changes reset validation / bump the version. */

const stored: StoredQuestionForDiff = {
  description: 'Make the box turn red.',
  starterHtml: '<div id="box"></div>',
  starterCss: '',
  starterJs: '',
  referenceHtml: '<div id="box" style="background:red"></div>',
  referenceCss: null,
  referenceJs: null,
  tests: [
    {
      name: 'exists',
      description: null,
      testType: 'DECLARATIVE',
      testCode: '{"a":1}',
      expectedBehavior: null,
      order: 0,
      enabled: true,
    },
    {
      name: 'red',
      description: 'is red',
      testType: 'DECLARATIVE',
      testCode: '{"a":2}',
      expectedBehavior: null,
      order: 1,
      enabled: true,
    },
  ],
};

/** What the admin form sends for an untouched question: every field. */
const fullForm = () => ({
  title: 'Renamed',
  tags: ['dom'],
  description: stored.description,
  starterHtml: stored.starterHtml,
  starterCss: stored.starterCss,
  starterJs: stored.starterJs,
  referenceHtml: stored.referenceHtml,
  referenceCss: '', // the form sends '' for an empty reference field
  referenceJs: '',
  tests: stored.tests.map(({ order: _order, ...t }) => ({ ...t })), // ids/orders lost by the form
});

/** The subset of the result a test asserts on (the offline harness has no toMatchObject). */
const pick = <T extends object>(r: T, keys: (keyof T)[]) => Object.fromEntries(keys.map((k) => [k, r[k]]));

const none = {
  contentChanged: false,
  testsChanged: false,
  referenceChanged: false,
  textChanged: false,
  bumpVersion: false,
  resetValidation: false,
};

describe('questionChangeImpact', () => {
  it('no-op save: nothing changes', () => {
    expect(questionChangeImpact(stored, fullForm())).toEqual(none);
  });

  it('title-only change keeps validation and version', () => {
    expect(questionChangeImpact(stored, { ...fullForm(), title: 'Another title' } as never)).toEqual(none);
  });

  it('tags-only change keeps validation and version', () => {
    expect(questionChangeImpact(stored, { ...fullForm(), tags: ['a', 'b'] } as never)).toEqual(none);
  });

  it('description change bumps the version and resets validation', () => {
    const r = questionChangeImpact(stored, { ...fullForm(), description: 'Make it blue.' });
    expect(pick(r, ['contentChanged', 'bumpVersion', 'resetValidation'])).toEqual({
      contentChanged: true,
      bumpVersion: true,
      resetValidation: true,
    });
  });

  it('starter code change bumps the version and resets validation', () => {
    const r = questionChangeImpact(stored, { ...fullForm(), starterCss: '#box{}' });
    expect(pick(r, ['contentChanged', 'bumpVersion', 'resetValidation'])).toEqual({
      contentChanged: true,
      bumpVersion: true,
      resetValidation: true,
    });
  });

  it('reference solution change resets validation but not the version', () => {
    const r = questionChangeImpact(stored, { ...fullForm(), referenceJs: 'box.style.background="red"' });
    expect(r).toEqual({ ...none, referenceChanged: true, resetValidation: true });
  });

  it('test case change (code, enabled, added, removed, reordered) resets validation', () => {
    const base = fullForm();
    const variants = [
      { ...base, tests: base.tests.map((t, i) => (i === 1 ? { ...t, testCode: '{"a":3}' } : t)) },
      { ...base, tests: base.tests.map((t, i) => (i === 1 ? { ...t, enabled: false } : t)) },
      { ...base, tests: [...base.tests, { ...base.tests[0]!, name: 'new' }] },
      { ...base, tests: base.tests.slice(0, 1) },
      { ...base, tests: [...base.tests].reverse() },
    ];
    for (const edit of variants) {
      expect(
        pick(questionChangeImpact(stored, edit), ['testsChanged', 'bumpVersion', 'resetValidation']),
      ).toEqual({ testsChanged: true, bumpVersion: true, resetValidation: true });
    }
  });

  it('student-facing text bumps the version but keeps validation', () => {
    for (const edit of [
      { ...fullForm(), instructions: 'Use a button.' },
      { ...fullForm(), constraints: 'No libraries.' },
      { ...fullForm(), expectedBehavior: 'The box turns red on click.' },
    ]) {
      expect(questionChangeImpact(stored, edit)).toEqual({ ...none, textChanged: true, bumpVersion: true });
    }
  });

  it('an empty text field equals an absent one', () => {
    expect(questionChangeImpact(stored, { ...fullForm(), instructions: '', constraints: null })).toEqual(
      none,
    );
  });

  it('a partial update that omits a field never counts it as changed', () => {
    expect(questionChangeImpact(stored, {})).toEqual(none);
  });
});
