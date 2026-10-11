# Exam Day Runbook (~250 Concurrent Students)

This runbook specifies operational procedures for running large concurrent exams (e.g. ~250 students).
Priorities: **1. Never lose a student's answer**, **2. Reliable submission**, **3. Speed**.

---

## 1. Pre-Flight Checklist

### T-60 Minutes: Infrastructure & Connectivity Verification

1. **Verify Environment Configuration**:
   Run the deployment verification script against the production target:
   ```bash
   npm run verify:deploy -- https://<your-production-app-url>
   ```
   Confirm all 11 required production environment variables pass:
   - `DATABASE_URL` (must contain `-pooler`)
   - `DIRECT_URL` (direct connection without `-pooler`, for migrations)
   - `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`
   - `RUNNER_URL`, `RUNNER_SECRET`
   - `CRON_SECRET`
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

2. **Verify Database Region & Vercel Region Alignment**:
   - Confirm Vercel function region matches Neon PostgreSQL region (e.g. `sin1` AWS Singapore, or `cle1` AWS Ohio).
   - Cross-region latencies (>150ms roundtrip) will severely degrade throughput when 250 heartbeats fire concurrently.
   - Inspect `vercel.json` to verify `"regions"` matches your Neon region.

3. **Warm Neon PostgreSQL Compute**:
   Neon serverless Postgres suspends idle compute after periods of inactivity.
   - Cold starts introduce 1–3s latency on the first query wave.
   - Wake the compute and pooler by accessing `/admin` or running `npm run verify:deploy`.
   - Confirm connection pooler accepts queries without delay.

4. **Runner Health Check**:
   Query the runner health endpoint:
   ```bash
   curl -s https://<runner-url>/health
   ```
   Expected response:
   ```json
   {
     "ok": true,
     "service": "runner",
     "isolation": "container",
     "active": 0,
     "queued": 0,
     "capacity": 4,
     "uptimeSeconds": 12345
   }
   ```
   Verify that `active == 0`, `queued == 0`, and `uptimeSeconds` indicates a stable instance.

5. **Upstash Redis Rate Limit Check**:
   - Ensure Upstash Redis database is active and token credentials are functional.
   - Verify rate limits: `RUN_RATE_LIMIT_PER_MIN` (default 10), `SUBMIT_RATE_LIMIT_PER_MIN` (default 10), `PROCTOR_RATE_LIMIT_PER_MIN` (default 60).

---

### T-10 Minutes: Final Pre-Exam Warmup

1. **Warm Next.js Serverless Lambdas**:
   - Load the home page and sign-in page to warm Vercel lambda instances.
   - Have an admin log in and open `/admin` to verify session decryption and role checks.
2. **Review Exam Settings**:
   - Check exam start time, end time, duration, and question snapshot frozen state.
   - Verify that all registered students appear as `ASSIGNED` in `/admin/students`.
3. **Open Admin Monitoring Stations**:
   - Station 1: `/admin/monitor` (live SSE feed of student events & proctor violations).
   - Station 2: `/admin/results?examId=<id>` (overview of submitted, graded, and pending answers).
   - Station 3: Vercel runtime logs and Runner service logs.

---

## 2. In-Exam Monitoring (During the Exam)

### Key Dashboards to Watch

1. **Live Admin Monitor (`/admin/monitor`)**:
   - Displays real-time SSE stream for all active sittings.
   - Tracks tab switches, full-screen exits, and session terminations (`VIOLATION_LIMIT`).
   - If a student disconnects, their sitting status remains `STARTED` until heartbeat timeout.

2. **Runner Health & Queue Stats (`GET /health`)**:
   - Check periodically:
     ```bash
     curl -s https://<runner-url>/health
     ```
   - Normal operation during student "Run Tests" clicks:
     - `active`: 0 to 4 (or configured `RUNNER_MAX_CONCURRENCY`).
     - `queued`: 0 to 10 (well below `RUNNER_MAX_QUEUE = 64`).
   - If `queued` approaches 64, students clicking "Run" will see: *"The test runner is busy right now. Please try again in a few seconds."*

3. **Vercel Function Logs**:
   Look for structured log events emitted by `src/lib/logger.ts`:
   - `runner.post_failed` or `runner.unreachable`: Runner connectivity or 5xx issues.
   - `grading.deferred`: Runner returned 429/BUSY; grading deferred without failing the attempt.
   - `finalization.grading_retry`: Bounded jittered backoff retrying a submission during sitting expiry.
   - `rate_limit.exceeded`: Student triggered Upstash sliding-window throttle on Run/Submit.

---

## 3. Incident Response: Runner Saturated or Unreachable

### Data Integrity Invariant (Answers are ALWAYS Safe)
1. **Autosave Guarantee**:
   Student code is saved to PostgreSQL every 30 seconds and on tab blurs/keystroke pauses. Even if a browser crashes or the runner dies, the latest code exists in `Attempt.html`, `Attempt.css`, `Attempt.js`.
2. **Never Marked as 0**:
   If the runner returns HTTP 429 (`BUSY` / `QUEUE_FULL`) or is unreachable (`UNAVAILABLE`), the system records `resultStatus: RUNNER_ERROR` and leaves `gradedAt: null` and `score: null`. **An unscored attempt is NEVER given 0 marks or marked failed.**
3. **Claiming Lock**:
   Every submission attempt is claimed conditionally before execution. A student cannot double-submit or corrupt state while grading is pending.

### Mitigation Steps if Runner Overflows or Crashes

1. **If Queue Is Saturated (HTTP 429 BUSY)**:
   - Finalisation requests automatically perform 3 jittered exponential backoff retries (`1s + jitter`, `2s + jitter`, `4s + jitter`).
   - Sittings that cannot drain immediately are left in `gradedAt: null` ("grading pending").
   - **Do not panic**: Student answers are safely locked in PostgreSQL.
2. **If Runner Crashed / Needs Restart**:
   - Restart the runner service container on Render / Railway / Fly.io.
   - Once restarted, confirm healthy via `curl https://<runner-url>/health`.
3. **How to Regrade / Drain Pending Answers**:
   - **Automatic Background Sweep**:
     `finalizeOverdueSittings` runs via Vercel Cron (`/api/cron/maintenance`) and every time an admin views results. After 1 minute (`RUNNER_RETRY_AFTER_MS = 60_000`), stalled runner errors are automatically picked up and regraded.
   - **Manual Admin Drain**:
     1. Open `/admin/attempts` or `/admin/results`.
     2. Click **"Grade pending attempts"**.
     3. Alternatively, invoke the API endpoint:
        ```bash
        curl -X POST https://<app-url>/api/admin/attempts/regrade \
          -H "Authorization: Bearer <ADMIN_SESSION_OR_COOKIE>" \
          -H "Content-Type: application/json" \
          -d '{"examId": "<exam-id>"}'
        ```
        Each call drains up to 50 pending attempts in order of submission time. Repeat until `pendingCount == 0`.

---

## 4. Post-Exam Finalisation & Queue Draining

At the exam end time, all ~250 sittings expire simultaneously.

### Drain Dynamics & Theoretical Drain Time
- **Total Submissions ($N$)**: 250 attempts.
- **Runner Concurrency ($C$)**: Default 4 (configurable via `RUNNER_MAX_CONCURRENCY`).
- **Runner Buffer**: 4 active + 64 queue = 68 capacity.
- **Run Duration ($T_{\text{run}}$)**: Average execution time per test suite (typically 1.5s – 3.0s).

### Drain Time Formula:
$$T_{\text{drain}} = \frac{N \times T_{\text{run}}}{C}$$

- **With Concurrency $C = 4$ and $T_{\text{run}} = 2.5\text{s}$**:
  $$T_{\text{drain}} = \frac{250 \times 2.5}{4} = 156.25\text{ s} \approx 2.6\text{ minutes}$$
- **With Concurrency $C = 8$ (scaled runner VM) and $T_{\text{run}} = 2.5\text{s}$**:
  $$T_{\text{drain}} = \frac{250 \times 2.5}{8} = 78.1\text{ s} \approx 1.3\text{ minutes}$$
- **Worst-Case (slow code hitting full timeout e.g. 15s)**:
  $$T_{\text{drain}} = \frac{250 \times 15}{4} \approx 15.6\text{ minutes}$$

### Post-Exam Verification Steps
1. Navigate to `/admin/results?examId=<id>`.
2. Inspect the **Pending Grading** count:
   - Immediately at $T+0$: ~180 pending as first 68 enter queue.
   - At $T+1\text{m}$: ~80 pending.
   - At $T+3\text{m}$: 0 pending.
3. If any attempts remain pending due to initial runner throttling:
   - Click **"Grade pending attempts"** in the UI to trigger `/api/admin/attempts/regrade`.
   - Confirm all attempts show valid scores and `gradedAt` timestamps.

---

## 5. Rollback Procedures

If an unexpected application defect occurs during or immediately prior to the exam:

1. **Vercel Instant Rollback**:
   - Go to **Vercel Dashboard → Project → Deployments**.
   - Select the last known good deployment.
   - Click **"Promote to Production"**. Rollback takes < 5 seconds and requires zero build time.
2. **Database Integrity during Rollback**:
   - Schema migrations in this repository are strictly backwards-compatible and additive.
   - Existing tables (`ExamSession`, `Attempt`, `TestRun`) remain fully readable by previous deployment versions.
3. **Runner Rollback**:
   - If a runner update introduced regression, redeploy the previous runner Docker tag on your container host.
4. **Disaster Recovery (Neon PITR)**:
   - If corrupted state occurs, use Neon Point-in-Time Recovery (PITR) to restore the branch to a timestamp immediately prior to the incident without losing submission data.
