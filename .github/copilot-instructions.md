# Instructions for AI coding assistants working in this repository

This file is read by GitHub Copilot and similar tools. If you are an AI
assistant editing this codebase, the rules below are not suggestions — they
encode product and security requirements that were deliberately chosen. See
`docs/architecture.md` and `docs/security.md` for the reasoning; this file is
the short version for a coding session.

## Hard rules

1. **Grading is behaviour-based, never source-based.** `shared/test-spec.ts`
   has no assertion that reads a student's source text (no `sourceContains`,
   no regex-over-code, no AST inspection). Do not add one. Tests assert on
   rendered DOM state: computed styles, geometry, text content, attributes.

2. **Hidden test bodies never reach a student's browser.** Any function that
   builds a payload for a student (`toStudentQuestion`, `toStudentOutcome`,
   any `/api/attempts/*` or `/api/exams/*` response) must be checked against
   `scripts/verify-offline.mjs`'s import-hygiene section, which greps for
   `testCode` leaking out of `toStudentQuestion`. If you add a new
   student-facing projection, add an equivalent check.

3. **The exam clock is server-authoritative.** `ExamSession.expiresAt` is
   fixed once at `startExamSession` and never extended by resuming. Never add
   a code path that lets the client set or extend `expiresAt`. UI countdowns
   (`ExamTimer`) are display-only and are resynced by every heartbeat.

4. **The preview iframe keeps `sandbox="allow-scripts"` without
   `allow-same-origin`.** This is what makes the sandbox an opaque origin.
   Do not add `allow-same-origin` to fix a "the preview can't do X" problem —
   find another way, or ask a human. This is enforced by
   `scripts/verify-offline.mjs`.

5. **No browser storage for exam state.** `localStorage` / `sessionStorage`
   must never hold code, scores, or session state — autosave writes to the
   server. This is enforced by `scripts/verify-offline.mjs`. (Runtime
   `localStorage` inside a *published Artifact preview*, if this repo is ever
   opened that way, is a different, unrelated concept — not applicable here.)

6. **Authorization is server-side, always, independently.** Every API route
   calls `requireUser()` / `requireAdmin()` / `requireOwnedAttempt()` /
   `requireExamAccess()` itself. `src/middleware.ts` is a UX redirect only
   (documented in the file) — never treat it as an access-control layer, and
   never remove a route-level check because "middleware already covers it".

7. **Allowlist matching is exact, case-insensitive on the normalised address,
   never a domain suffix.** Do not "simplify" `AllowedEmail` lookups into a
   `@gmail.com`-style wildcard.

8. **Client components never import `@/lib/prisma`, `@/lib/auth`, `@/lib/env`,
   or a `@/server/*` service directly.** Data reaches a client component as
   props from a Server Component or through `/api/*`. This is enforced by
   `scripts/verify-offline.mjs`.

## Before committing a change

Run, in order:

```bash
npm run typecheck
npm run lint
npm test
npm run verify:offline
```

`verify:offline` runs with **zero installed dependencies** (Node's built-in
TypeScript support) and is the fastest signal that a change broke a structural
or security invariant. If it fails, read the failing check's name — each one
names the specific rule from this file it is protecting.

If your change touches `runner/src`, also run `npm --prefix runner test` (see
`runner/tests/README.md` for why that needs `--import ./tests/register.mjs`).

## Where things live

- `shared/test-spec.ts` — the grading DSL. Used by both the app (compiling
  question tests) and the runner (executing them). Keep it dependency-free.
- `src/server/services/*` — all business logic and every Prisma query. API
  routes are thin: parse input, call a service, shape the response.
- `src/lib/*` — mostly dependency-free helpers (email, scoring, timing,
  proctor dedupe, CSV) kept pure specifically so they can be unit tested
  without a database. `src/lib/outcome.ts` is the one place that decides what
  a student learns about a graded run — read it before changing what a
  run/submit response contains.
- `runner/` — a separate Node service. It never receives `DATABASE_URL`,
  `AUTH_SECRET`, or any OAuth credential — only `RUNNER_SECRET`.

## What "done" means for a change here

Not "it compiles". A change is done when: `verify:offline` passes, the
relevant unit tests exist and pass, and — if the change touches grading,
auth, or the sandbox — you have re-read the specific rule above it relates to
and can say in one sentence why the change still satisfies it.
