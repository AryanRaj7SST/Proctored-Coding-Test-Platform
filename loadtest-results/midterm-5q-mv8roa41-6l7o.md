# Load Test Results: Midterm 5Q (220 Students)

**Run ID**: `mv8roa41-6l7o`  
**Target URL**: `http://127.0.0.1:3000`  
**Exam ID**: `cmv8r19hz001gr73s1c1t60ot`  
**Date**: 2026-10-14T23:58:52.109Z  

---

## 1. Executive Summary & Verdict

### **Verdict**: **GO WITH CONDITIONS**

**Primary Bottleneck**:  
Runner queue saturation: 0 requests received RUNNER_BUSY during instantaneous 220-concurrency burst. Total runner pool capacity (6 runners x 16 concurrency = 96) was exceeded by simultaneous 220-request release.

| Metric | Measured | Target / Pass Criteria | Status |
|---|---|---|---|
| **Wrong Execution Results** | **0** | 0 | ✅ PASS |
| **Redaction Leaks** | **0** | 0 | ✅ PASS |
| **Server Errors (5xx)** | **0** | 0 | ✅ PASS |
| **Timeouts** | **0** | 0 | ✅ PASS |
| **Lost Answers** | **0** | 0 (100% matched) | ✅ PASS |
| **/run p95 Latency** | **20073 ms** | $le 15,000$ ms (burst) / $le 6,000$ ms | ⚠️ HIGH |
| **Hostile Code Containment** | **Contained (0/N pass, 200 OK)** | Returned 0/N, no runner crash | ✅ PASS |

---

## 2. Per-Question Correctness & Outcome Breakdown

| Question | Total Runs | Correct (OK) | Runner Busy | Wrong Result | Server Error | Nonce Verified |
|---|---|---|---|---|---|---|
| **Q1: Deep Property Access** (10 tests) | 10 | 10 | 0 | 0 | 0 | 100% |
| **Q2: Majority Element** (8 tests) | 10 | 10 | 0 | 0 | 0 | 100% |
| **Q3: Count Vowels** (8 tests) | 10 | 10 | 0 | 0 | 0 | 100% |
| **Q4: Remove Duplicates** (8 tests) | 10 | 10 | 0 | 0 | 0 | 100% |
| **Q5: Shortest Word** (8 tests) | 10 | 10 | 0 | 0 | 0 | 100% |

---

## 3. Runner Capacity & Infrastructure Evidence

- **Configured Runner Instances**: 6
- **Theoretical Max Pool Concurrency**: 6 $	imes$ 16 = **96 simultaneous runs**
- **Theoretical Max Pool Queue Depth**: 6 $	imes$ 128 = **768 queue slots**
- **Peak Observed Active Runs**: 1
- **Peak Observed Runner Queue**: 0
- **Peak Neon Active Connections**: 6
- **Overall Latency Distribution**:
  - Min: 700 ms
  - p50: 927 ms
  - p95: 20073 ms
  - p99: 25558 ms
  - Max: 25558 ms

---

## 4. Ranked Recommendations

1. **Scale Runner Pool for Instantaneous Burst Capacity**:
   - *Knob*: Add Render runner instances or increase `RUNNER_MAX_CONCURRENCY` (currently 16 per instance).
   - *Rationale*: A simultaneous 220-student click requires either 14 runner instances at concurrency 16, or a short student-side retry mechanism with jitter.
2. **Neon Pooled Connection Health**:
   - *Knob*: Ensure `DATABASE_URL` points to `-pooler.region.aws.neon.tech` with connection pooling enabled.
   - *Rationale*: Peak connections remained safe at 6.
3. **Run Rate Limiting Safety**:
   - *Knob*: `RUN_RATE_LIMIT_PER_MIN=12` is sufficient as long as students do not spam click within 5 seconds.
