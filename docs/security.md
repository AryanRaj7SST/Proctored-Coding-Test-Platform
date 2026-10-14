# Security

This document is the honest account of what is and isn't protected, and why
each decision was made. Anywhere this contradicts the code, the code is the
source of truth — file an issue.

## Identity and access

- **Google authenticates; the application authorises by role.** Sign-in is
  Google OAuth only (`src/lib/auth-callbacks.ts`, `src/server/services/accounts.ts`).
  The application refuses only when (1) the provider is not Google, (2) the
  email is missing or invalid, (3) Google has not verified it, or (4) the
  account exists and an administrator deactivated it. Every other
  Google-authenticated person is let in; there is no invite list.
- **New accounts are STUDENTs; existing roles are preserved.** A first sign-in
  creates an active `STUDENT`. Later sign-ins refresh name, picture and last
  sign-in only — never the role or active state. Nothing from the Google
  profile, a request body, a query string or a cookie can set a role.
- **ADMIN is controlled server-side.** Roles and account access change only
  through the administrator-only `PATCH /api/users/[id]` (the Students page),
  which refuses self-demotion/deactivation and removing the last active
  administrator, and is audited. The first administrator is bootstrapped by
  the seed (`SEED_ADMIN_EMAIL`) or directly in the `users` table.
- **Role comes from the database on every request.** The `jwt` callback
  re-reads role, batch and active state from `User` each time the session is
  read, so a role change or deactivation applies on the next request.
- **The student roster (`AllowedEmail`) is optional** and does not control
  authentication: it only pre-registers a batch for addresses that have not
  signed in yet, so tests can be assigned by batch. It holds no role.
- **Accounts are keyed by the exact, verified address.** Emails are
  normalised (lowercased, trimmed) and never alias-collapsed: `a+tag@gmail.com`
  and `a@gmail.com` are different accounts (see `src/lib/email.ts`). Google's
  `email_verified` is required because an unverified address could claim
  someone else's account.
- **Test access is separate from authentication.** Tests are open to every
  signed-in student by default (`ANY_AUTHENTICATED_USER`) or limited to
  assigned students (`ASSIGNED_USERS_ONLY`). Either way an administrator can
  revoke one student's access to one test (`ExamAssignment.revokedAt`,
  Assignments page); `requireTestAccess` answers such a student with 404, a
  sitting in progress is submitted, and the account is untouched.
- **Open test access is a deliberate, narrow exemption.** Administrators, and
  the accounts listed in `OPEN_ACCESS_EMAILS` (`src/server/services/sessions.ts`,
  decided from the verified Google email), are bound by neither a test's
  window nor its attempt limit: they can start before it opens, after it
  closes, and again after every finished sitting. Each sitting is still timed,
  proctored and graded, and nothing is deleted; copy/paste is allowed for
  them (other proctoring rules still apply). It does not bypass access
  revocation or assignment rules. Keep that list short and review it before
  every release.
- **Practice Mode never touches graded work.** After a question is submitted
  its owner can reopen it at `/practice/[attemptId]` (no proctoring) and run
  its frozen tests. Runs are recorded as `PRACTICE` test runs that are not
  linked to the attempt, so the attempt's code, score, status and results are
  never changed (`src/server/services/practice.ts`). It is refused while the
  student has a sitting of that test in progress, and after access is revoked.
- **`src/middleware.ts` is a UX redirect, not the access boundary.** It only
  checks for the presence of a session cookie (Edge runtime, no database
  access) and redirects to `/login`. Every API route and server page calls
  `requireUser()` / `requireAdmin()` / `requireOwnedAttempt()` /
  `requireExamAccess()` independently (`src/lib/authz.ts`). Attempting to
  load another student's attempt returns **404, not 403** — the API does not
  confirm the existence of a resource the caller can't see.

## The sandbox boundary (student code)

Student code runs in two different sandboxes, and it matters which:

1. **Live preview** (what the student sees while typing):
   `PreviewFrame` renders an `<iframe sandbox="allow-scripts" ...>` — note the
   **absence** of `allow-same-origin`. Combined, this puts the iframe's
   document in a genuine opaque origin: it cannot read the parent's DOM,
   cookies, `localStorage`, or call any application API. The only channel out
   is `postMessage`, used exclusively to forward `console.*` calls back for
   display (`src/lib/preview.ts`). This is checked by
   `scripts/verify-offline.mjs`; do not add `allow-same-origin` to "fix"
   something in the preview.

2. **Grading** (what actually produces a score): a **separate browser
   context in the runner service**, never the student's own browser. The
   runner intercepts every network request the page makes and serves only the
   synthetic document assembled from the student's HTML/CSS/JS
   (`runner/src/executor.ts`) — nothing the student writes can make an
   outbound request, load a remote script, or exfiltrate anything. Passing
   the live preview is explicitly **not** the same as passing the hidden
   tests: the preview is for the student's own iteration; the runner is the
   only thing that produces a score.

## What the runner receives, and doesn't

The runner receives: the student's HTML/CSS/JS as **text**, the compiled test
spec, and a `runId`. It never receives a database connection string, an OAuth
credential, or any other application secret — its only credential is
`RUNNER_SECRET`, used purely to authenticate the app→runner request. Every
`/run` request is checked for a valid bearer token **and** an HMAC over
`timestamp.body` with a 120-second window (`runner/src/auth.ts`), so a
captured token alone can't be replayed against a different payload, and a
captured request can't be replayed indefinitely.

## Hidden tests stay hidden

Test cases can be marked as hidden (`hidden: true`) on `QuestionTest`, which is persisted in PostgreSQL and frozen into `QuestionSnapshot` when attempts are pinned for grading. `compileRunnerSpec` passes this flag directly through to the execution runner.

`toStudentQuestion` (`src/server/services/questions.ts`) is the single choke
point for what a student's browser is allowed to learn about a question: visible
(`hidden: false`) tests include their name, description, steps, and checks;
hidden tests return only `{ id, points }` and a generic name like "Hidden test N" —
never `testCode`, never steps, never checks, never an expected value, selector, or JS expression.

`toStudentOutcome` (`src/lib/outcome.ts`) is the equivalent choke point for
run, practice, and submit results: for hidden tests it never returns `message`, `expected`,
or `actual`, returning only `passed`, `pointsAwarded`, and `durationMs`.
For visible tests, a passing test carries no message; a failing test gets the author's
message if one exists, or a generic "This test did not pass." otherwise.

`getSittingResultForStudent` (`src/server/services/results.ts`) sanitizes sitting results
for student views: hidden test cases have their failure diffs (`message`, `expected`, `actual`)
omitted, `definition` set to `null`, and generic names assigned so test specifications
never leak after contest submission.

Admin-only surfaces (question wizard and editor, `/admin/test-logs`,
`/admin/attempts/[id]`, `/admin/results/[sessionId]`) are the only places a hidden test's full
definition, failure diffs, and runner details are ever rendered, guarded by `requireAdmin()`.

## Rate limits and payload ceilings

Every mutating route the student can call is rate-limited per user
(`src/lib/rate-limit.ts`, sliding-window via Upstash Redis): 12 runs/min, 6 submits/min, 120 proctor events/min, 5 CSV
imports/min for admins, by default (`.env.example`). `readJson`/`readText`
(`src/lib/http.ts`) enforce a byte ceiling **before** parsing, checking
`Content-Length` first so an oversized body is rejected without even being
buffered. Code fields are additionally capped by `MAX_CODE_BYTES` (default
200 KB) in the Zod schemas.

## CSV import/export

- **Import** (`parseAllowedEmailCsv`, `src/lib/csv.ts`): the student roster,
  validated row by row, with per-line error reporting, a hard row-count
  ceiling, and a 2 MB file-size ceiling at the route level. A row asking for
  `ADMIN` is reported as an error: the roster never grants a role.
- **Export** (`toCsv`): every cell is escaped, and any cell beginning with
  `= + - @` is prefixed with a leading `'` — this is the standard defence
  against spreadsheet **formula injection**, where a crafted CSV cell
  executes as a formula the moment someone opens it in Excel/Sheets.

## Headers and CSP

`next.config.mjs` sets `Content-Security-Policy`, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and
`Cross-Origin-Opener-Policy: same-origin` on every response, and disables
`X-Powered-By`. The CSP's `script-src` includes `'unsafe-eval'` — required by
Monaco's tokenizer/worker bootstrap — but this governs the **parent
document** only; the student-code iframe has its own opaque origin and is not
meaningfully constrained by the parent's CSP in the first place, which is why
the sandbox attribute (not CSP) is what actually isolates it.
`img-src` allows `https:` images from any host, so photos in questions, reference
solutions and the student preview load; plain `http:` images, and every
non-image resource from another origin, stay blocked.

## Errors never leak internals

`errorResponse` (`src/lib/http.ts`) is the only place an API route's error
becomes a JSON body: application errors (`HttpError`, validation errors) get
their message and code; anything else becomes a generic "Something went
wrong" with a 500, and the real error is logged server-side via
`sanitizeError` (`src/lib/logger.ts`), which redacts known-sensitive keys
(`html`, `css`, `js`, `testCode`, tokens, secrets) from logged objects before
they're written anywhere.

## Auditing

Every admin mutation (question/exam create-update-delete, roster, account and role changes, per-test access changes,
assignment, CSV export) calls `recordAudit` (`src/server/services/audit.ts`),
which never lets an audit-log failure break the request it's describing.
`/admin/settings` shows the last 25 entries.

## Honest limits

- **Proctoring is browser-observable events only** — see
  `docs/architecture.md#proctoring-honest-scope`. This product does not record
  or analyse the webcam, record the screen, do keystroke biometrics, or impose
  lockdown-browser style OS restrictions, and does not claim to.
- **The camera video never leaves the student's browser.** A live camera is
  required during a test, but the `MediaStream` from `getUserMedia({ video:
true, audio: false })` (`src/lib/camera.ts`, the only caller) is shown in a
  local `<video>` and nothing else: no recording, no frames, no upload, no
  storage, and it is stopped when the sitting ends. Only facts are stored, as
  proctor events (camera enabled / denied / unavailable / stopped / restored).
  `Permissions-Policy: camera=(self)` keeps every other origin — including
  the sandboxed student-code previews — away from the camera, and
  `tests/unit/camera-privacy.test.ts` fails the build if code that records,
  captures or uploads video appears. Camera, fullscreen and clipboard state
  are client reports: they are recorded and shown to administrators, never
  used to authorise, time or grade anything.
- **No plagiarism/similarity detection.** Two students submitting identical
  code will both simply get identical scores; nothing here compares
  submissions to each other.
- **The runner's `container` isolation mode relies on the runner's own
  container boundary** (no filesystem writes of student code, network
  interception, resource limits) rather than a fresh OS-level sandbox per
  run. The `docker` isolation mode (`RUNNER_ISOLATION=docker`) trades latency
  for a stronger per-run boundary (`--network=none --read-only
--cap-drop=ALL`) — pick it if the container-per-run overhead is acceptable
  for your threat model.
- **`RUN_TIMEOUT_MS` / `TEST_TIMEOUT_MS`** bound how long a single test or
  run can occupy a runner slot, but a student who writes an infinite loop in
  a `<script>` still costs the runner that timeout's worth of wall-clock time
  per run; `BoundedQueue` prevents that from taking down the whole service,
  it does not make a single bad run free.
