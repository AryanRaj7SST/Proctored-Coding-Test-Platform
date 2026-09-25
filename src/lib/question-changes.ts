/**
 * What a question edit actually changed, compared with the stored row.
 *
 * The admin form always sends every field, so "was the field present in the
 * request" says nothing. We compare VALUES:
 *
 *  - content  (description, starter code)  -> bump version, reset validation
 *  - tests    (any test field, add/remove,   -> bump version, reset validation
 *              enable/disable, reorder)
 *  - reference solution                     -> reset validation only (it is
 *    not part of the student snapshot, so the version does not change)
 *  - student text (instructions, constraints, -> bump version only (students
 *    expected behaviour)                         see it; grading is unaffected)
 *  - metadata (title, tags, marks, ...)     -> neither (marks are applied per
 *    test, from ExamQuestion.marks, never from the snapshot)
 *
 * Test identity is by content and order, not by id: a form that lost the ids
 * of freshly created tests must not look like "every test changed".
 */

export interface StoredQuestionForDiff {
  description: string;
  instructions?: string | null;
  constraints?: string | null;
  expectedBehavior?: string | null;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  referenceHtml: string | null;
  referenceCss: string | null;
  referenceJs: string | null;
  tests: {
    name: string;
    description: string | null;
    testType: string;
    testCode: string;
    expectedBehavior: string | null;
    order: number;
    enabled: boolean;
  }[];
}

export interface QuestionEditForDiff {
  description?: string;
  instructions?: string | null;
  constraints?: string | null;
  expectedBehavior?: string | null;
  starterHtml?: string;
  starterCss?: string;
  starterJs?: string;
  referenceHtml?: string | null;
  referenceCss?: string | null;
  referenceJs?: string | null;
  tests?: {
    name: string;
    description?: string | null;
    testType: string;
    testCode: string;
    expectedBehavior?: string | null;
    order?: number;
    enabled?: boolean;
  }[];
}

export interface QuestionChangeImpact {
  contentChanged: boolean;
  testsChanged: boolean;
  referenceChanged: boolean;
  /** Student-facing text outside the description changed. */
  textChanged: boolean;
  /** Future attempts must snapshot new content. */
  bumpVersion: boolean;
  /** A previous "Validate Question" pass no longer proves anything. */
  resetValidation: boolean;
}

const differs = <T>(incoming: T | undefined, stored: T) => incoming !== undefined && incoming !== stored;
const nullable = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

function normalizeTests(
  tests: {
    name: string;
    description?: string | null;
    testType: string;
    testCode: string;
    expectedBehavior?: string | null;
    order?: number;
    enabled?: boolean;
  }[],
  useIndexOrder: boolean,
): string {
  // An empty text field and an absent one are the same thing.
  const rows = tests.map((t, i) => ({
    name: t.name,
    description: t.description || null,
    testType: t.testType,
    testCode: t.testCode,
    expectedBehavior: t.expectedBehavior || null,
    order: useIndexOrder ? (t.order ?? i) : (t.order as number),
    enabled: t.enabled !== false,
  }));
  rows.sort((a, b) => a.order - b.order);
  return JSON.stringify(rows);
}

export function questionChangeImpact(
  stored: StoredQuestionForDiff,
  edit: QuestionEditForDiff,
): QuestionChangeImpact {
  const contentChanged =
    differs(edit.description, stored.description) ||
    differs(edit.starterHtml, stored.starterHtml) ||
    differs(edit.starterCss, stored.starterCss) ||
    differs(edit.starterJs, stored.starterJs);

  const referenceChanged =
    differs(nullable(edit.referenceHtml), stored.referenceHtml || null) ||
    differs(nullable(edit.referenceCss), stored.referenceCss || null) ||
    differs(nullable(edit.referenceJs), stored.referenceJs || null);

  const testsChanged =
    edit.tests !== undefined && normalizeTests(edit.tests, true) !== normalizeTests(stored.tests, false);

  const textChanged =
    differs(nullable(edit.instructions), stored.instructions || null) ||
    differs(nullable(edit.constraints), stored.constraints || null) ||
    differs(nullable(edit.expectedBehavior), stored.expectedBehavior || null);

  return {
    contentChanged,
    testsChanged,
    referenceChanged,
    textChanged,
    bumpVersion: contentChanged || testsChanged || textChanged,
    resetValidation: contentChanged || testsChanged || referenceChanged,
  };
}
