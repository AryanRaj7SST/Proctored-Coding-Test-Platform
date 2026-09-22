# Writing a question

A question has: a description the student reads, starter code, a reference
solution, and a suite of tests. This guide is the practical version of
`shared/test-spec.ts`; read that file's comments for the exact schema.

## The golden rule

**A test asserts what the page does, not how the code is written.** There is
no assertion type that reads the student's source text — not a substring
check, not a regex, nothing. If you find yourself wanting to check "did they
use `addEventListener`", stop: assert on the *effect* instead (the button,
when clicked, produces the expected DOM/style change). This is enforced by
`scripts/verify-offline.mjs` and cannot be worked around by, say, hiding a
source check inside a custom assertion — that assertion type doesn't exist.

## Where to author

`/admin/questions/new` → the **Tests** tab. Each test case has:

| Field | Meaning |
|---|---|
| Name | Shown to students if the test is Visible |
| Points | Contributes to the question's total; 0-point tests are allowed but pointless |
| Hidden / Visible | Hidden tests are never described to the student, not even their name |
| Behaviour specification | JSON matching `TestCaseBody` — see below |

The editor validates the JSON with the **exact parser the runner uses**
(`validateTestCaseBody`) and shows a plain-English readout ("This test will
check that…") so you can catch a typo before running anything.

## Anatomy of a test body

```json
{
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "click", "selector": "#add" }
  ],
  "assertions": [
    { "type": "css", "selector": "#box", "property": "background-color", "equals": "tomato", "color": true }
  ]
}
```

- `viewport` (optional) — defaults to 1280×720. Set this per-test when you
  need to check responsive behaviour at a specific breakpoint.
- `steps` (optional) — interactions run **before** assertions: `click`,
  `clickText`, `fill`, `press`, `hover`, `wait`, `waitFor`, `scrollTo`,
  `setViewport`. Up to 40 per test.
- `assertions` (required, at least one) — what must be true afterwards. Up to
  40 per test.

### Assertion types

| Type | Checks |
|---|---|
| `exists` / `notExists` | An element matching the selector is (not) present |
| `visible` / `hidden` | Computed display/visibility/opacity and non-zero size |
| `count` | Exact number of matching elements |
| `text` | `textContent`, via `equals` (exact) or `contains` |
| `css` | A computed style property, via `equals` or `oneOf`; set `"color": true` for colour properties so `tomato`/`#ff6347`/`rgb(255,99,71)` are all treated as equal |
| `cssNumber` | A numeric style property compared with `op` (`eq`/`lt`/`lte`/`gt`/`gte`) and a `tolerance` |
| `attribute` | An HTML attribute, via `equals` or `contains` |
| `size` | Rendered width/height compared with `op` |
| `gridColumns` | Number of grid columns (and optionally that they're equal width) |
| `gap` | `row-gap`/`column-gap`, via `axis: 'row' \| 'column' \| 'both'` |
| `boxesPerRow` | How many elements land in the first visually-rendered row (works for flex-wrap layouts too, not just grid) |
| `noConsoleErrors` | No `console.error` or uncaught exception during the run |

Every assertion accepts an optional `message` shown to the student **only if
the test is Visible and fails** — write it as a hint, not an answer.

### Colour matching

`equals: "tomato"` and `equals: "#ff6347"` and `equals: "rgb(255, 99, 71)"`
are all the same expectation once `"color": true` is set — the runner
resolves the *student's* computed value the same way inside the real browser,
so this works for CSS variables, `currentColor`, and anything else a naive
string compare would miss.

## Worked example 1: "Click the button to color a box"

From the seed data (`prisma/seed-data.ts`, `boxQuestion`) — a starter `<div>`
and two buttons; JavaScript should recolour the box on click. Five tests, 40
points total:

1. **Elements present** (`exists` × 3) — the box and both buttons exist.
2. **Starts white** (`css` on `background-color`) — nothing has been clicked
   yet.
3. **Add color → tomato** (`steps: [click #add]`, then `css` equals
   `tomato`).
4. **Remove color → white** (click both buttons in sequence, then `css`).
5. **Repeated clicks are stable** (click Add three times, still tomato) — a
   test aimed at solutions using `classList.toggle` incorrectly, which would
   flip back to white on the third click.

None of these care whether the student used `style.backgroundColor`,
`classList.toggle`, or `setProperty` — the instructions say so explicitly,
and the tests only ever look at the *rendered* colour.

## Worked example 2: "Responsive product showcase"

From the seed data (`gridQuestion`) — CSS Grid + media queries, HTML is
fixed. Five tests, 50 points, each with its own `viewport`:

1. **Desktop: 3 equal columns + 20px gap** at 1280×720 (`gridColumns` +
   `gap`).
2. **Item styling** — background colour, padding, border-radius, bold,
   centred text (multiple `css` assertions on `.item`).
3. **Tablet: 2 per row** at 768×1024 (`boxesPerRow`).
4. **Mobile: 1 per row** at 400×800 (`boxesPerRow`).
5. **Mobile: 25px gap** at 400×800 (`gap`).

This is the pattern for any responsive-layout question: one test per
breakpoint, each setting its own `viewport`, asserting on rendered geometry
rather than on the media-query source.

## Reference solution and validation

Fill in **Reference solution** (a complete, correct HTML/CSS/JS) on the
question form, then **Save & validate**. This sends your reference solution
through the same runner a student's submission would use and requires **every
test to pass**. A question's `validation` status starts as `NOT_VALIDATED`
and is invalidated automatically (`validation → NOT_VALIDATED`) whenever you
edit its content or tests, so a stale "passed" can never linger after a
change.

**A question cannot be added to a published exam until validation passes**
(`assertExamPublishable` in `src/server/services/exams.ts`, enforced when an
exam's status leaves `DRAFT`). This is the self-checking loop: if your own
correct solution doesn't pass your own tests, no student's will either.

## Points and versioning

A question's total `points` is the sum of its tests', recomputed on every
save. Editing a question's content or tests bumps its `version` — this
doesn't retroactively change any score already awarded, because every attempt
snapshots the question at the moment the student opens it
(`docs/architecture.md#question-versioning-and-grading-integrity`). If you
need to fix a typo in a live exam's question without resetting anyone's
progress, know that students who have already opened the question are
grading against their frozen snapshot, not your edit — plan accordingly
(usually: fix it, and if it materially changes difficulty, treat it as a new
question for future exams rather than editing one already in progress).

## Limits

`SPEC_LIMITS` (`shared/test-spec.ts`): up to 40 tests per question, 40
assertions and 40 steps per test, viewport between 200px and 2560px per side,
`wait` capped at 5000ms, and text comparisons capped at 500 characters.
