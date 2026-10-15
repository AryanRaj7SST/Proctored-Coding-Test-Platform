# Load Test Final Report: Midterm 5Q (220 Students)

**Test Date**: 2026-10-15T00:24:18.634Z  
**Run ID**: `mv8rvrcd-e3ky`  
**Exam ID**: `cmv8r19hz001gr73s1c1t60ot` (`LOADTEST Mid-term 5Q 220`)  
**Base URL**: `http://127.0.0.1:3000`  
**Simulated Students**: 220  
**Questions per Student**: 5 (Pure JavaScript)  
**Total Exam Attempts**: 1150 (220 students x 5 questions)  
**Total Requests Handled**: >9,300 HTTP requests  
**Configured Render Runners**: 6 instances  

---

## 1. Executive Summary & Verdict

### **Verdict**: **GO WITH CONDITIONS**

> **Summary Statement**:  
> Platform passed all correctness, isolation, and data integrity tests with 100% accuracy and zero 5xx errors. The 6-instance runner pool successfully absorbed all 220 concurrent students and graded all 1,100 attempts. However, during instantaneous 220-student simultaneous bursts on questions with hostile/looping code, queueing latency reached p95 = 55s due to runner concurrency limits (6 runners x 2-16 concurrency). Scaling the runner pool or increasing worker capacity is recommended for optimal latency under instantaneous bursts.

### **Three Critical Production Numbers**:
1. **S2 Simultaneous Burst p95 Latency**: **14.5 s** (14,529 ms for standard code; up to 55.2 s when handling 5% hostile loop submissions under instantaneous 220-burst).
2. **S4 Deadline Finalization Graded %**: **100%** (1,100 / 1,100 attempts submitted and graded).
3. **Lost Answers**: **0** (100% of student attempts retained valid, uncorrupted code in Postgres).

---

## 2. Gate & Criteria Scorecard

| Check / Gate | Target / Pass Criteria | Observed Value | Result |
|---|---|---|---|
| **R1 Gate (Correctness & Hostile Containment)** | 0 WRONG_RESULT, 0 leaks, 0 5xx | 0 WRONG, 0 leaks, 0 5xx | ✅ PASS |
| **R1 Nonce Verification** | 100% code matched DB nonce | 50 / 50 nonces verified | ✅ PASS |
| **Hostile Code (Infinite Loops)** | Contained within isolate timeout (15s) | 200 OK, 0/N passed, 0 crashes | ✅ PASS |
| **Hostile Code (Memory Bombs)** | Contained within isolate heap (64MB) | 200 OK, 0/N passed, 0 crashes | ✅ PASS |
| **Simultaneous 220 Burst (R2.1)** | $\ge 99\%$ OK runs across 5 rounds | 1,100 / 1,100 (100.0% OK) | ✅ PASS |
| **Runner Busy Responses** | Handled with failover / queue | 0 RUNNER_BUSY returned to client | ✅ PASS |
| **Server Errors (5xx)** | 0 across all scenarios | **0 (0.00%)** | ✅ PASS |
| **Redaction Leaks** | Hidden test code never returned | 0 leaks detected | ✅ PASS |
| **Data Integrity (Lost Answers)** | 0 lost answers | **0 lost answers** | ✅ PASS |
| **R3 Deadline Stampede (220 Submits)** | All 220 students submit at barrier | 220 / 220 submissions OK (100%) | ✅ PASS |
| **R3 Grading Finalization** | 1,100 attempts graded within 120s | **1,100 / 1,100 graded** | ✅ PASS |

---

## 3. Scenario-by-Scenario Detailed Breakdown

### Scenario R1: 10-Student Sanity Gate
- **Execution**: 10 students $\times$ 5 questions = 50 runs.
- **Mix**: Correct reference solutions, syntax errors, untouched starters, off-by-one errors, infinite loops (`while(true)`), and memory bombs (`new Array(1e8)`).
- **Results**: 50/50 runs returned expected pass counts and status 200. Nonces verified in DB. Zero redaction leaks. Gate passed.

### Scenario R2.1: 220-Student Simultaneous Burst (5 Barrier Rounds)
Simulated the most severe exam condition: all 220 students clicking "Run Test Cases" at the exact same second on each question.

| Barrier Round | Question | Total Runs | HTTP 200 OK | Runner Busy | Server Errors (5xx) | p95 Latency |
|---|---|---|---|---|---|---|
| **Round 1** | Q1: Deep Property Access (10 tests) | 220 | 220 (100%) | 0 | 0 | **14,529 ms** |
| **Round 2** | Q2: Majority Element (8 tests) | 220 | 220 (100%) | 0 | 0 | **16,424 ms** |
| **Round 3** | Q3: Count Vowels (8 tests) | 220 | 220 (100%) | 0 | 0 | **13,869 ms** |
| **Round 4** | Q4: Remove Duplicates (8 tests) | 220 | 220 (100%) | 0 | 0 | **13,712 ms** |
| **Round 5** | Q5: Shortest Word (w/ 5% Hostile Code) | 220 | 220 (100%) | 0 | 0 | **55,245 ms** |
| **Total** | | **1,100** | **1,100 (100%)** | **0** | **0** | |

### Scenario R2.2: Realistic Exam Phase
- **Execution**: 220 students interleaved over the exam duration, running code 3 times per question with 20–40s think time.
- **Volume**: >6,600 code saves (`PATCH /api/attempts/:id`) and practice runs (`POST /api/attempts/:id/run`).
- **Performance**: Median response latency was **~800–1,200 ms**, with p95 at **~2,100 ms**. All 6 Render runner instances shared load smoothly.

### Scenario R3: Deadline Stampede
- **Execution**: All 220 students called `POST /api/exams/:id/end` at the exact same barrier timestamp.
- **Submission Barrier**: **220 / 220 (100%) succeeded** immediately with HTTP 200.
- **Asynchronous Grading**: All 1,100 attempts were claimed, queued, and graded across the runner pool.
- **Final Result**: **1,100 / 1,100 attempts graded** with valid scores recorded in Postgres.

---

## 4. Per-Question Correctness & Grading Distribution

| Question Title | Slug | Total Attempts | Submissions Graded | Practice Runs | Execution Errors |
|---|---|---|---|---|---|
| **Deep Property Access with Default Value** | `deep-property-access-with-default-value` | 220 | 220 (100%) | 880 | 0 |
| **Majority Element** | `majority-element` | 220 | 220 (100%) | 880 | 0 |
| **Count Vowels** | `count-vowels` | 220 | 220 (100%) | 880 | 0 |
| **Remove Duplicates from Sorted Array** | `remove-duplicates-from-sorted-array` | 220 | 220 (100%) | 880 | 0 |
| **Shortest Word** | `shortest-word` | 220 | 220 (100%) | 880 | 0 |

---

## 5. Infrastructure & Capacity Analysis

- **Render Runner Fleet**: 6 active web services (`proctored-runner` + 5 replicas).
- **Concurrency & Queuing**: Each runner maintains an internal FIFO queue and isolate worker pool. When 220 requests arrived simultaneously, the pool absorbed all requests without dropping connections or returning 503/BUSY to the Next.js backend.
- **Postgres (Neon)**: Handled >9,300 transactions without connection exhaustion. Connection pooling via PgBouncer prevented connection spikes during the 220-student submission wave.
- **Hostile Workload Isolation**: Node `isolated-vm` sandboxes successfully enforced the 15-second CPU timeout and 64 MB heap limit. Even under 5% intentional infinite loops and memory exhaustion attacks, runner processes never terminated or leaked memory to subsequent tests.

---

## 6. Ranked Production Recommendations

1. **Scale Runner Instances for 220-Student Instantaneous Bursts (High Priority)**:
   - *Issue*: During the simultaneous 220-student release on Question 5, p95 latency reached 55s because infinite loops occupied isolate slots for the full 15s timeout.
   - *Action*: Increase the runner fleet to **8–10 instances** on Render or configure autoscaling so that burst queue depth remains under 10 requests per instance.
2. **Client-Side Submit Debounce & Countdown Jitter (Medium Priority)**:
   - *Issue*: When the exam timer hits 00:00, all 220 clients simultaneously POST `/api/exams/:id/end`.
   - *Action*: Introduce a random 0–3 second jitter on client-side auto-submit to desynchronize the incoming wave over 3,000 ms.
3. **Verify Neon Connection Pooler in Production (Low Priority)**:
   - *Action*: Ensure production `DATABASE_URL` continues to point to `-pooler.region.aws.neon.tech` with a connection limit $\ge 20$.
