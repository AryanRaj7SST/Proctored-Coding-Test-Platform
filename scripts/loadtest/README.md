# Proctored Coding Platform — Load Test Harness (~250 Students)

This directory contains the production-readiness load testing suite for the proctored coding platform. It simulates ~250 concurrent students taking a test under realistic exam conditions, measuring end-to-end latency, error rates, and verifying zero lost answers.

---

## What It Simulates

For each student:

1. **`GET /dashboard`** — Loads the student dashboard.
2. **`POST /api/exams/[id]/start`** — Starts or resumes the exam sitting, opens the workspace, and retrieves the attempt ID.
3. **`PATCH /api/attempts/[id]` (Autosave)** — Continuously sends code changes every **1.5 to 4 seconds**.
4. **`POST /api/heartbeat`** — Sends liveness pings every **12 seconds** to keep session countdown synchronized.
5. **`POST /api/attempts/[id]/run`** — Fires 1–2 test evaluation runs with student code.
6. **`POST /api/attempts/[id]/submit`** — Submits the student's solution.
7. **Simultaneous Finish Mode (`--simultaneous-finish`)** — All 250 students submit their final code at the exact same millisecond barrier, reproducing the end-of-exam deadline spike.
8. **Data Integrity Verification** — Queries the database post-test to verify that every student's stored attempt matches their final autosaved code with 100% precision.

---

## Safety Guard (Production Refusal & Opt-In)

To prevent accidental load testing on production infrastructure:

- `--base-url` is **mandatory**; it never defaults to any URL.
- The runner hard-refuses targets matching `proctored-coding-test-platform.vercel.app` or any host specified in `PRODUCTION_URL` unless `--allow-production` is explicitly passed.
- With `--allow-production`, the harness prints the target hostname, the `DATABASE_URL` host (host only, never credentials), student count, and duration, and **requires typing the exact hostname to continue**. The `--yes` flag is completely ignored on production.
- Every student account and associated record uses the prefix `loadtest-<runId>-`.
- The target exam title **MUST** start with `"LOADTEST "`. The harness refuses to run against any exam without this prefix.

---

## Running against production

When executing a load test against the production deployment, strictly adhere to these rules:

1. **No live exams**: Never run load tests against live or ongoing exams. The target exam ID must belong to an assessment with the title prefix `"LOADTEST "` (e.g. `"LOADTEST Final Capacity Run"`). Any other exam title is automatically refused by the runner.
2. **Tell mentees first**: Inform mentees and team members in advance before running tests against production to avoid false alarms regarding system load, leaderboards, or notifications.
3. **Secrets via env only**: Supply sensitive credentials such as `DATABASE_URL` and `AUTH_SECRET` through environment variables only (`DATABASE_URL=... AUTH_SECRET=...`). Never pass secrets as command-line flags or commit them to source control.
4. **Run cleanup dry-run first**: Following a load-test run, always run the cleanup script in dry-run mode first (`npx tsx scripts/loadtest/cleanup.ts --run-id <runId>`) to verify the exact table row counts before executing the transaction with `--execute`.

---

## 1. Running Against a Neon Branch & Vercel Preview

To test safely in an isolated staging environment matching production:

### Step 1: Create an Isolated Neon Database Branch

Use the Neon CLI or Neon Console to create an instant copy of your database:

```bash
# Using Neon CLI:
neon branches create --name loadtest-preview

# Retrieve the branch's connection string:
neon connection-string loadtest-preview
```

### Step 2: Configure Vercel Preview Deployment

1. Set the preview deployment's `DATABASE_URL` environment variable to the new Neon branch connection string.
2. Ensure `AUTH_SECRET` is set on the preview deployment (e.g. `openssl rand -base64 32`).
3. Deploy your preview branch to Vercel (e.g. `https://my-preview-branch.vercel.app`).

### Step 3: Run the Load Test

Run the load test from your machine pointing to the Neon branch and the Vercel preview URL:

```bash
DATABASE_URL="postgresql://user:pass@ep-loadtest-xyz.aws.neon.tech/neondb?sslmode=require" \
AUTH_SECRET="<same-secret-as-preview-deployment>" \
npx tsx scripts/loadtest/run.ts \
  --base-url https://my-preview-branch.vercel.app \
  --exam-id <your-exam-id> \
  --students 250 \
  --ramp-seconds 30 \
  --duration-seconds 60 \
  --simultaneous-finish
```

---

## 2. Running Locally Against Local Server

Start your Next.js application locally:

```bash
npm run dev
# App starts at http://localhost:3000
```

In another terminal, run the load test:

```bash
npx tsx scripts/loadtest/run.ts \
  --base-url http://localhost:3000 \
  --exam-id <your-exam-id> \
  --students 250 \
  --ramp-seconds 20 \
  --duration-seconds 45
```

For quick dry-runs (e.g. 10 students):

```bash
npx tsx scripts/loadtest/run.ts \
  --base-url http://localhost:3000 \
  --exam-id <your-exam-id> \
  --students 10 \
  --ramp-seconds 5 \
  --duration-seconds 15
```

---

## CLI Options

| Flag                     | Default      | Description                                                             |
| :----------------------- | :----------- | :---------------------------------------------------------------------- |
| `--base-url <url>`       | _(Required)_ | Target application base URL.                                            |
| `--exam-id <id>`         | _(Required)_ | ID of the test/exam to run against (title must start with `LOADTEST `). |
| `--students <N>`         | `250`        | Number of concurrent students to simulate.                              |
| `--max-students <M>`     | `250`        | Safety limit for max concurrent students.                               |
| `--ramp-seconds <S>`     | `30`         | Duration over which students start their tests.                         |
| `--duration-seconds <D>` | `45`         | Duration of each student's exam session before submission.              |
| `--simultaneous-finish`  | `false`      | Synchronizes all students to submit at the exact same instant.          |
| `--skip-db-verify`       | `false`      | Skips database code match assertion.                                    |
| `--allow-production`     | `false`      | Explicit opt-in required to target production.                          |
| `--run-id <id>`          | _(auto)_     | Unique run identifier for record tagging and scoped cleanup.            |

---

## Cleanup Script

All records created by a test run are tagged with `loadtest-<runId>-`. To view or remove test artifacts:

```bash
# Dry run: view row counts across tables without deleting anything
npx tsx scripts/loadtest/cleanup.ts --run-id <runId>

# Execute: delete all records linked to this runId in an atomic transaction
npx tsx scripts/loadtest/cleanup.ts --run-id <runId> --execute
```

---

## Example Output & Report

```text
========================================================================================
LOAD TEST PERFORMANCE REPORT (75.2s elapsed, 4210 total requests, 0 errors)
========================================================================================
Endpoint                        Count   RPS     p50 (ms)  p95 (ms)  p99 (ms)  Max (ms)  Errors
------------------------------------------------------------------------------------------------
GET /dashboard                  250     3.3     28        64        112       145       0
PATCH /api/attempts/[id]        2850    37.9    22        52        95        180       0
POST /api/attempts/[id]/run     360     4.8     185       420       750       910       0
POST /api/attempts/[id]/submit  250     3.3     85        210       340       410       0
POST /api/exams/[id]/start      250     3.3     65        145       230       295       0
POST /api/heartbeat             250     3.3     18        45        78        110       0
========================================================================================

========================================================================================
DATA INTEGRITY VERIFICATION (Priority: Never lose a student's answer)
========================================================================================
Checking database state for 250 submitted attempts...
Total Attempt Checked:     250
Exactly Matched:          250 (100.0%)
Mismatched / Lost Code:   0
Missing in Database:      0
[RESULT: PASSED] Verified 100% data integrity: zero lost answers!
========================================================================================
```
