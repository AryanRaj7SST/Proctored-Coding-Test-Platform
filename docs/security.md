# Security

This document is the honest account of what is and isn't protected, and why
each decision was made. Anywhere this contradicts the code, the code is the
source of truth — file an issue.

## Identity and access

- **Sign-in is Google OAuth only**, gated by a five-step policy in
  `src/lib/auth.ts`: (1) provider is Google, (2) an email is present, (3)
  Google reports it verified, (4) the **normalised** (lowercased, trimmed)
  address has an **exact match** in `AllowedEmail`, (5) that entry is
  `active`. Anything else is rejected with a specific, non-technical reason
  shown on `/login`.
- **No domain wildcards.** The allowlist is exact-match on purpose — see the
  comment in `src/lib/email.ts`. A `@gmail.com`-style suffix rule would let
  anyone with a Gmail account in.
- **Plus-addressing is not normalised away.** `a+tag@gmail.com` and
  `a@gmail.com` are treated as different addresses, deliberately: collapsing
  them would let one allowlisted student mint unlimited aliases.
- **Role comes from the database, never the client.** `src/lib/auth.ts`'s
  `jwt` callback re-reads role/batch/active from `AllowedEmail`/`User` on
  every sign-in and session-update trigger. Revoking an allowlist entry
  (`AllowedEmailsManager` → Revoke) deactivates the linked `User` row in the
  same transaction (`updateAllowedEmail`), so access is cut immediately
  rather than at next token expiry.
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

`toStudentQuestion` (`src/server/services/questions.ts`) is the single choke
point for what a student's browser is allowed to learn about a question: test
**names** and **points** for visible (`hidden: false`) tests only; a bare
**count** of hidden tests; never `testCode`, never an expected value, never a
selector. `toStudentOutcome` (`src/lib/outcome.ts`) is the equivalent choke
point for run/submit results: a passing test carries no message at all; a
failing test gets the author's message if one exists, or a generic
"This test did not pass." otherwise — never the assertion internals.
`scripts/verify-offline.mjs` greps for `testCode` leaking out of
`toStudentQuestion` on every run.

Admin-only surfaces (question edit/preview, `/admin/test-logs`,
`/admin/attempts/[id]`) are the only places a hidden test's body is ever
rendered, and they're behind `requireAdmin()`.

## Rate limits and payload ceilings

Every mutating route the student can call is rate-limited per user
(`src/lib/rate-limit.ts`, sliding-window via Upstash Redis): 12 runs/min, 6 submits/min, 120 proctor events/min, 5 CSV
imports/min for admins, by default (`.env.example`). `readJson`/`readText`
(`src/lib/http.ts`) enforce a byte ceiling **before** parsing, checking
`Content-Length` first so an oversized body is rejected without even being
buffered. Code fields are additionally capped by `MAX_CODE_BYTES` (default
200 KB) in the Zod schemas.

## CSV import/export

- **Import** (`parseAllowedEmailCsv`, `src/lib/csv.ts`): validated row by
  row, with per-line error reporting, a hard row-count ceiling, and a 2 MB
  file-size ceiling at the route level.
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

## Errors never leak internals

`errorResponse` (`src/lib/http.ts`) is the only place an API route's error
becomes a JSON body: application errors (`HttpError`, validation errors) get
their message and code; anything else becomes a generic "Something went
wrong" with a 500, and the real error is logged server-side via
`sanitizeError` (`src/lib/logger.ts`), which redacts known-sensitive keys
(`html`, `css`, `js`, `testCode`, tokens, secrets) from logged objects before
they're written anywhere.

## Auditing

Every admin mutation (question/exam create-update-delete, allowlist changes,
assignment, CSV export) calls `recordAudit` (`src/server/services/audit.ts`),
which never lets an audit-log failure break the request it's describing.
`/admin/settings` shows the last 25 entries.

## Honest limits

- **Proctoring is browser-observable events only** — see
  `docs/architecture.md#proctoring-honest-scope`. This product does not do
  webcam capture, screen recording, keystroke biometrics, or lockdown-browser
  style OS restrictions, and does not claim to.
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
