# Roadmap and scope

This was built for one mentor running timed coding assessments for a
relatively small group of web-development mentees — not as a multi-tenant
SaaS. That shaped a number of deliberate scope decisions. This document lists
what's out of scope **on purpose**, what's a known rough edge, and what a
natural next iteration would tackle first.

## Deliberately out of scope

- **Proctoring beyond the browser tab.** No webcam recording or analysis
  (the required camera is a live preview on the student's own screen, never
  recorded or uploaded), no screen recording, no microphone, no lockdown-browser-style OS restriction, no
  detection of a second device or monitor. See
  `docs/architecture.md#proctoring-honest-scope` for exactly what is and
  isn't observed, and why the honest answer matters more than a stronger
  marketing claim.
- **Plagiarism / similarity detection.** Nothing compares one student's
  submission to another's. If this matters for your use case, an offline
  batch job over `Attempt.html/css/js` (e.g. via a similarity library) is a
  reasonable bolt-on that doesn't require changing the grading path itself.
- **Multi-tenancy.** One user base, one set of admins. There is no
  concept of separate organizations sharing one deployment.
- **Billing/payments.** Not a product concern for a private tool.
- **A native mobile app.** The exam workspace is a desktop-oriented IDE
  (Monaco + a three-pane layout); it was not designed for a phone screen, and
  timed high-stakes assessments on a phone are a debatable idea regardless.
- **Languages beyond HTML/CSS/JS.** The grading model (render a page, assert
  on the rendered result) is specific to front-end web work. Extending to,
  say, a Python/algorithms track would need a different execution model
  entirely (no DOM to assert against), not just a new language option.
- **Partial credit within a single test.** Grading is all-or-nothing per test
  (`summarizeResults` in `src/lib/scoring.ts`) — a test is worth its full
  points or zero. Finer-grained partial credit would need either more,
  smaller tests (the current escape hatch — this is why the seed questions
  have 5 tests each rather than 1) or a deliberate DSL extension.

## Known rough edges

- **Runner isolation's `container` mode** shares the runner service's own
  container boundary across concurrent runs rather than giving each run a
  fresh OS-level sandbox. `RUNNER_ISOLATION=docker` trades latency for a
  stronger per-run boundary; which one is "enough" depends on how much you
  trust your student population and is a threat-model judgment call, not a
  technical limitation — see `docs/security.md#honest-limits`.
- **A student who writes an infinite loop** costs the runner a full
  `RUN_TIMEOUT_MS` per attempt. `BoundedQueue` stops this from taking the
  whole service down, but doesn't make the individual run free — a student
  spamming "Run Test Cases" with a deliberately slow submission is throttled
  by the per-minute rate limit, not prevented outright.
- **Question editing mid-exam** — see
  `docs/question-authoring.md#points-and-versioning`. Snapshotting protects
  already-opened attempts, but there's no UI warning today if an admin edits
  a question that's actively assigned to a live, unstarted exam; the admin
  needs to understand the versioning model themselves.
- **The admin "Attempts" list has no pagination UI wiring** beyond the
  API's own `page`/`pageSize` support — it currently renders the latest 200
  and doesn't expose page controls. Fine for the target scale; would need
  attention before a much larger cohort.
- **Runner container health during `RUNNER_ISOLATION=docker`** requires a
  Docker socket mounted into the runner container, which is itself a
  privilege-escalation-adjacent thing to hand a service — read the comment in
  `runner/.env.example` and `docs/security.md` before enabling it, and
  prefer `container` mode unless you specifically need the stronger boundary.

## Natural next steps, roughly in priority order

1. **Question banks / tags-based exam assembly** — the `Question.tags` field
   exists and is editable but nothing yet builds an exam from "give me 3
   EASY + 2 MEDIUM CSS questions."
2. **Per-student time extensions** (accessibility accommodation) — the data
   model (`ExamAssignment`) could carry a per-assignment duration override
   without a schema change; the UI and the `getExamTimeState` calculation
   would need to read it.
3. **A "preview as student" mode for admins** beyond the current
   `/admin/questions/[id]/preview` (which renders the question and lets the
   admin run the reference/starter code) — extending this to actually sit a
   mock timed exam as an admin would catch UX issues before students do.
4. **Bulk question import** (CSV/JSON) — the student roster already has this
   pattern (`parseAllowedEmailCsv`); questions don't yet.
5. **Configurable proctoring severity** — today `Exam.maxViolations` is a
   single number that auto-submits at the threshold; a mentor might want
   "warn at N, auto-submit at M" instead.
6. ~~**Redis-backed rate limiting**~~ — done: `src/lib/rate-limit.ts` uses
   Upstash Redis (see `docs/architecture.md#rate-limiting-with-upstash-redis`).
