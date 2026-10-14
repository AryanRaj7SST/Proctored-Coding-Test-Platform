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
   - If `queued` approaches 64, students clicking "Run" will see: _"The test runner is busy right now. Please try again in a few seconds."_

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

---

## 6. Runner Capacity, Benchmarks & Load Testing (Pure JS DSA Engine)

### Benchmark Methodology (`scripts/loadtest/runner-capacity.ts`)

To measure runner capacity with the new isolated-vm (`js-fn`) engine:
- **Simulated Population**: $N=200$ concurrent students.
- **Run Cadence**: Each student triggers a run approximately every ~20s with $\pm 10\%$ jitter.
- **Submission Traffic Mix**:
  - **70% Correct**: Clean DSA solution passing all tests.
  - **25% Wrong Answer**: Runs all assertions and fails assertions cleanly without crashing.
  - **2.5% Infinite Loop (Hostile)**: `while (true) {}` intended to monopolize compute.
  - **2.5% Memory Bomb (Hostile)**: Rapid array/buffer allocations designed to exhaust heap memory.
- **Isolation Architecture**: Isolated V8 isolates (`isolated-vm`) running asynchronously off the main Node event loop with a 64MB heap ceiling and 2000ms hard timeout per test case.

---

### Measured Benchmark Results

#### 1. 60-Second Sustained High-Throughput Run
- **Total Executions**: 598 runs
- **Throughput**: 7.2 runs / second
- **Success Rate (HTTP 200 OK)**: **100.0%** (598 / 598)
- **429 Runner Busy Rate**: **0.00%** (0 / 598)
- **Error Rate (5xx / Network drops)**: **0.00%** (0 lost submissions)
- **Overall Latency**:
  - **p50**: **22 ms**
  - **p90**: **44 ms**
  - **p95**: **377 ms**
  - **p99**: **8,070 ms** (governed by 4 $\times$ 2000ms hard timeout for infinite loop cases)
  - **min / max**: 17 ms / 8,093 ms
- **Latency Breakdown by Submission Type**:
  - **Correct (70%)**: $n=422$ | p50 = **22 ms** | p95 = **44 ms** | max = 104 ms
  - **Wrong (25%)**: $n=145$ | p50 = **21 ms** | p95 = **41 ms** | max = 60 ms
  - **Memory Bomb (2.5%)**: $n=15$ | p50 = **421 ms** | p95 = **1,086 ms** | max = 1,086 ms (contained by 64MB isolate heap cap)
  - **Infinite Loop (2.5%)**: $n=16$ | p50 = **8,068 ms** | p95 = **8,093 ms** (hard-killed after 2000ms $\times$ 4 assertions)
- **Runner Memory Footprint**:
  - Initial RSS: **116 MB** (Heap: 24 / 27 MB)
  - Final RSS: **121 MB** (Heap: 25 / 27 MB)
  - Net Delta RSS: **+5 MB** (flat memory line with automatic isolate cleanup and zero memory leakage)

#### 2. 30-Second Warmup Run
- **Total Executions**: 296 runs (5.7 runs/sec)
- **Success Rate**: **100.0%** (0 busy, 0 errors)
- **Latency**: p50 = **19 ms**, p95 = **35 ms**
- **Net Delta RSS**: **+6 MB** (110 MB $\to$ 116 MB)

---

### Recommended Production Tuning Settings

Based on measured capacity and fair queuing behavior, the runner and app should be configured with:

| Environment Variable | Recommended Value | Default | Rationale |
|----------------------|-------------------|---------|-----------|
| `RUNNER_MAX_CONCURRENCY` | `16` | `16` | With `isolated-vm` asynchronous worker threads, 16 concurrent isolates process 10–20 req/s with p50 < 25ms without thread starvation. |
| `RUNNER_MAX_QUEUE` | `128` | `128` | Absorbs momentary bursts when hundreds of students submit concurrently at the end of an exam block. |
| `RUNNER_MAX_PER_KEY_QUEUE` | `8` | `8` | Fair queuing quota: caps any single user from holding more than 8 slots in the wait line. |
| `RUN_RATE_LIMIT_PER_MIN` | `10` | `10` | Upstash Redis sliding window: ~1 run every 6 seconds per student prevents denial-of-service spam. |
| `SUBMIT_RATE_LIMIT_PER_MIN` | `10` | `10` | Protects final grading endpoints from duplicate rapid clicks. |
| `RUNNER_JS_MEMORY_LIMIT_MB` | `64` | `64` | Sufficient for algorithmic DSA problems while instantly aborting memory bombs. |
| `RUNNER_JS_TIMEOUT_MS` | `2000` | `2000` | Hard timeout per test case; prevents infinite loops from hanging workers. |

#### Fair Queuing Implementation (`runner/src/queue.ts`)
The runner implements fair round-robin scheduling across client keys:
1. When requests arrive, they are grouped into per-user queues keyed by authenticated `userId` (passed securely via HMAC-signed runner client payload).
2. Schedulers dequeue requests using **round-robin across active keys** rather than strict FIFO. A single student submitting 20 requests in 1 second will not starve other students whose requests arrive behind them.
3. If an individual student exceeds `RUNNER_MAX_PER_KEY_QUEUE` (8), their subsequent requests are immediately rejected with HTTP 429 (`QUEUE_FULL`), preserving capacity for peers.

---

### How to Run the Load Test

To reproduce or stress-test the runner in staging or production before exam day:

1. **Start the Runner Service**:
   ```bash
   RUNNER_MAX_CONCURRENCY=16 \
   RUNNER_MAX_QUEUE=128 \
   RUNNER_MAX_PER_KEY_QUEUE=8 \
   RUNNER_SECRET="<your-runner-secret>" \
   PORT=4000 \
   npm --prefix runner start
   ```

2. **Execute the Simulation (N=200 students for 10 minutes)**:
   ```bash
   npm run loadtest:runner -- \
     --runner-url http://127.0.0.1:4000 \
     --secret "<your-runner-secret>" \
     --students 200 \
     --interval-seconds 20 \
     --duration-seconds 600
   ```

   For a quick 60-second health check:
   ```bash
   npm run loadtest:runner -- \
     --runner-url http://127.0.0.1:4000 \
     --secret "<your-runner-secret>" \
     --students 200 \
     --interval-seconds 20 \
     --duration-seconds 60
   ```

### Exam-Day Acceptance Thresholds

For the runner cluster to be certified ready for exam day under 200 concurrent students:

- **p50 Execution Latency**: $< 50\text{ ms}$ for pure JavaScript function tests.
- **p95 Execution Latency**: $< 1,000\text{ ms}$ (including 5% hostile submissions).
- **HTTP 429 ("Runner Busy") Rate**: $< 0.5\%$ across the exam window.
- **Error Rate (5xx or Dropped Requests)**: **0.0%** (Zero lost submissions).
- **Memory Consumption**: Runner process RSS remains $< 512\text{ MB}$ without unbounded drift after repeated GC cycles.

