# Architecture

## Two services, one boundary

```
┌────────────────────────┐        signed HTTP         ┌──────────────────────┐
│  Next.js app            │  ─────────────────────────▶ │  Runner service       │
│  (student/admin UI,     │   Bearer + HMAC(ts.body)    │  (Express + Playwright)│
│  API routes, Prisma)    │ ◀───────────────────────── │  no DB, no OAuth creds │
└──────────┬──────────────┘        JSON result          └──────────────────────┘
           │
           ▼
     PostgreSQL
```

The **app** owns everything about identity, exams, questions, scores, and
proctoring. The **runner** owns nothing except "run this HTML/CSS/JS against
this test spec in a sandboxed browser and report what happened." It never
receives `DATABASE_URL`, `AUTH_SECRET`, or any OAuth credential — only
`RUNNER_SECRET`. This split means a bug or compromise in the code-execution
path cannot reach the database or user identities, and the runner can be
redeployed, scaled, or rebuilt independently of the app.

The two talk over plain HTTP secured by a bearer token _and_ an HMAC over
`timestamp.body` (`src/lib/runner-client.ts`, `runner/src/auth.ts`), with a
120-second replay window. The runner re-validates the test spec it receives
(`validateRunnerSpec`) even though the app already validated it — the runner
trusts nothing it is sent, including its own caller.

## Grading

The single most important product rule: **grading is behaviour-based, never
source-based.** `shared/test-spec.ts` defines a small JSON DSL — `exists`,
`css`, `cssNumber`, `gridColumns`, `gap`, `boxesPerRow`, `text`, `attribute`,
`size`, `noConsoleErrors`, and a few more — and deliberately has **no**
assertion that reads a student's source text. A test can click a button and
then assert the resulting `background-color`; it cannot assert that the
student's JavaScript contains `addEventListener`. This means two students who
solve the problem completely differently both pass, and a student can't game
the grader by pattern-matching keywords into a comment.

**Compilation.** An admin authors tests as `QuestionTest.testCode` (a JSON
string matching `TestCaseBody`). `compileRunnerSpec` (in
`src/server/services/questions.ts`) turns the stored rows into the
`RunnerSpec` the runner executes — and it is the **server**, never the
student's request, that decides which spec runs for a given attempt
(`executeTests` in `src/server/services/attempts.ts` always derives the spec
from the attempt's own snapshot).

**Execution.** The runner (`runner/src/executor.ts`, `runner/src/js-engine.ts`) executes code according to question kind:

- **HTML/CSS/DOM questions (`kind: 'dom'`)**: The runner builds a single HTML
  document from the student's code, intercepts all network requests so nothing
  the student wrote can reach the real internet, navigates a fresh browser
  context to it, runs each test's `steps` (click, fill, wait, …), then
  evaluates its `assertions` **inside the page** via `page-script.ts`'s
  `EVALUATOR_SOURCE` — a self-contained function injected with
  `page.evaluate` directly via CDP (without invoking `globalThis.eval`), reading only `getComputedStyle`, `getBoundingClientRect`,
  `textContent`, and attributes. It never receives the student's source text as
  a comparison target.
- **Pure JavaScript DSA questions (`kind: 'js-fn'`)**: The runner executes student functions inside an isolated V8 isolate (`isolated-vm`, `runner/src/js-engine.ts`). Each test case executes in a freshly spawned isolate with a 64MB memory limit and hard 2000ms timeout. A secure prelude harness captures pristine JavaScript intrinsics (`JSON.stringify`, `Array.isArray`, etc.) BEFORE the student's code is evaluated. The harness executes the target function with JSON-decoded arguments, and results are serialized and compared **strictly OUTSIDE the isolate** in the runner's host process. Student code cannot manipulate comparisons, tamper with `eval` or prototypes, or access host environment globals (`process`, `require`, `fetch`, etc.).

## Question versioning and grading integrity

Editing a question later must never change a score awarded earlier. Every
`Question` has a `version`, bumped whenever its content or tests change
(`updateQuestion`). The moment a student opens a question, `getOrCreateAttempt`
freezes a `QuestionSnapshot` — the full question text, starter code, and every
test (including points) — onto the `Attempt` row. All grading
(`specFromSnapshot`, `executeTests`) reads from that frozen snapshot, never
from the live `Question`/`QuestionTest` tables. Re-editing a question after
students have attempted it invalidates its `validation` status and bumps its
version for _future_ attempts; it cannot retroactively change a stored score.

While the sitting is open a question can be submitted any number of times
(`submitAttempt`): every submission is graded, and the **best** score counts
(`executeTests` with `keepBest`; a lower-scoring run is kept as history and
never lowers the stored score). A submitted question stays editable. Nothing
ends a test early: it ends only when the timer runs out or the student
presses End Test. At that point a question edited since its last grading is
graded once more with its final code (counted only if better), and every
attempt keeps the code its counted result was graded on, so review screens
and regrades see exactly the graded code. After the sitting ends, a submit
returns the stored grading and cannot change it.

## Timing

`ExamSession.expiresAt` is computed once, at `startExamSession`, from the
exam's `durationMinutes` (clamped to the exam's `endTime`, if set), and never
extended — resuming a session returns the _existing_ session, it does not
recompute the deadline. The client's `ExamTimer` is a pure display: it counts
down locally between heartbeats but is resynced by every
`POST /api/heartbeat` response, and the actual enforcement — finalizing an
expired attempt — happens server-side in `finalizeExpiredAttempts`, called
from the heartbeat endpoint, the exam-start endpoint (on resume), and the
admin monitor's sweep. A student who closes their laptop still has their
attempt auto-submitted once the deadline passes and they're next observed
(or the admin's periodic sweep runs).

## Proctoring: honest scope

A test starts only after a system check (`src/components/proctor/SystemCheck.tsx`):
camera granted and streaming, fullscreen on, browser capable, and the server
saying the sitting can start or resume. During the test a gate
(`ProctorGate`) covers the workspace while fullscreen is off or the camera has
stopped, until the student restores it (a click, because browsers require a
gesture); the server timer keeps running.
`useProctor` (`src/hooks/useProctor.ts`) observes `visibilitychange`, `blur`/
`focus`, `fullscreenchange`, `copy`/`cut`/`paste`, `drop`/`dragstart`,
`contextmenu`, clipboard shortcuts, and `pagehide`, and blocks the clipboard
ones in the capture phase; `useCameraMonitor` watches the camera track. That
is the _complete_ list of what a browser tab can see. It
cannot detect a second device, another monitor, a virtual machine, screen
recording, or anything outside the tab — and a web page cannot pull itself
back into focus, so `TabSwitchModal` is deliberately a "welcome back, that was
recorded" notice, not a block.

Two layers of deduplication exist because a single tab switch produces
_two_ raw browser events (`blur` and `visibilitychange`) that would otherwise
count as two violations:

1. **Client-side** (`useProctor`): a 1.5s window collapses a `blur`/
   `visibilitychange` pair from the same tab switch before it's even sent.
2. **Server-side** (`shouldRecordEvent` in `src/lib/proctor.ts`, called from
   `recordProctorEvent`): the same dedupe logic runs again against the
   _database's_ last event for that family, because the client cannot be
   trusted. The violation count returned to the browser (and shown on the
   admin monitor) is **always recomputed from the database** — never trusted
   from client state — so refreshing the page or tampering with React state
   cannot reset it.

## Realtime: SSE, not websockets

The admin live monitor (`/admin/monitor`) polls a snapshot every ~3 seconds
over one long-lived Server-Sent-Events response
(`src/app/api/admin/monitor/stream/route.ts`), capped at 4 minutes per
connection with automatic client reconnect. This was a deliberate choice over
a websocket/pub-sub stack: for the target scale (one mentor, tens of
students), a poll-over-SSE loop is simpler to reason about, has no separate
connection-state store, and degrades to plain polling if SSE itself is
blocked by a proxy.

## Rate limiting with Upstash Redis

`src/lib/rate-limit.ts` uses Upstash Redis sliding-window rate limiting
(`@upstash/ratelimit` + `@upstash/redis`) to provide distributed rate limiting
across serverless Lambda invocations on Vercel. The interface is intentionally
standardized (`rateLimit(key, limit, windowMs)`) returning `{ allowed, remaining, resetInMs }`.
In local development where Upstash credentials are omitted, it automatically fails open
with a console warning to preserve frictionless offline dev — see `docs/deployment.md`.

## Sessions: JWT, not a database adapter table

Auth.js is configured with `session: { strategy: 'jwt' }` rather than a
database session adapter. `User` rows are created (as `STUDENT`) or
refreshed on sign-in (`src/server/services/accounts.ts`), and role/batch/active
status are re-read from the database every time the `jwt` callback runs
(`src/lib/auth-callbacks.ts`), so a deactivation or role change takes effect on
the next request without a sessions table.

## Isolation modes

The runner supports two isolation strategies, chosen by `RUNNER_ISOLATION`:

- **`container`** (default): a fresh, incognito `BrowserContext` per run,
  inside the already-isolated runner container. All network requests are
  intercepted and served from memory or aborted (`offline: true`,
  `--host-resolver-rules=MAP * 0.0.0.0`); the student's code is never written
  to disk.
- **`docker`**: spawns a throwaway container per run
  (`--network=none --read-only --cap-drop=ALL`, memory/CPU/pids limits) via
  `runner/src/docker-runner.ts`. Stronger isolation, higher latency per run;
  intended for environments where "the runner's own container is the
  boundary" is not a strong enough guarantee.

Either way, the runner container itself runs with `no-new-privileges`,
resource ceilings, and a `tmpfs` for `/tmp` (see `docker-compose.yml`).

## Lightweight integrity tooling

1. **Code similarity report (`src/server/services/integrity/similarity.ts`)**:
   Normalizes submitted JavaScript by stripping comments and whitespace and renaming non-keyword identifiers to sequential placeholders (`v0, v1, v2...`). It partitions normalized token streams into 3-shingles and computes pairwise Jaccard similarity. The report runs per-question via `/admin/exams/[id]/similarity` and is audited (`exam.similarity_checked`).

2. **Static red-flag scan on submit (`src/lib/static-analysis.ts`)**:
   On submission, student code is scanned for known suspicious patterns (`eval`, `Function(`, `constructor`, prototype mutation, `globalThis`, `__proto__`, `Proxy`, hardcoded long test literals). Detected flags are non-blocking: they are saved to `Attempt.flags` and rendered as review badges and snippets on `/admin/attempts/[id]`.

3. **Configurable clipboard violations (`src/lib/proctor.ts`, `Exam.countClipboardViolations`)**:
   Controlled by a per-exam setting (`countClipboardViolations`, default false). When enabled, browser clipboard events (`COPY`, `CUT`) and right-click attempts (`CONTEXT_MENU`) increment the sitting's violation counter toward `Exam.maxViolations`.

4. **Contest standings & ranking (`src/server/services/integrity/contest-ranking.ts`)**:
   Ranks participants by total score descending, tie-breaking by earliest last-accepted-submission timestamp, followed by lowest violation count. Accessible at `/admin/exams/[id]/standings` and exportable as CSV with automatic spreadsheet formula-injection escaping (`'`, `+`, `-`, `=`, `@`).

## Directory-to-concept map

| Concept                          | Where                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| Grading DSL                      | `shared/test-spec.ts`                                          |
| Spec compilation, snapshotting   | `src/server/services/questions.ts`                             |
| Attempt lifecycle, run/submit    | `src/server/services/attempts.ts`                              |
| Timing rules                     | `src/lib/timing.ts`, `src/server/services/sessions.ts`         |
| Proctoring dedupe + status       | `src/lib/proctor.ts`, `src/server/services/proctoring.ts`      |
| Student-safe projections         | `src/lib/outcome.ts`, `toStudentQuestion`                      |
| Runner auth (HMAC)               | `src/lib/runner-client.ts`, `runner/src/auth.ts`               |
| Runner execution (DOM)           | `runner/src/executor.ts`, `runner/src/page-script.ts`          |
| Runner execution (JS V8 Isolate) | `runner/src/js-engine.ts`                                      |
| Code similarity analysis         | `src/server/services/integrity/similarity.ts`                  |
| Static red-flag scanner          | `src/lib/static-analysis.ts`                                   |
| Contest ranking & standings      | `src/server/services/integrity/contest-ranking.ts`             |
| Sandboxed live preview           | `src/lib/preview.ts`, `src/components/editor/PreviewFrame.tsx` |
