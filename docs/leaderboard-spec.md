# Scaler-Style Student Contest & Scoreboard Specification

This document specifies the student-facing Contest Landing Page and Live Scoreboard experience, reverse-engineered from the Scaler contest UI screenshots and integrated into this platform's architecture.

---

## 1. Inventory of Existing Models & Services

The repository already implements core assessment primitives. Here is how current models map to contest requirements:

| Requirement                         | Existing Model / Field                                                                                                                | Service / Helper Location                                                                                      | Notes & Status                                                                                                 |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **Contest Window**                  | `Exam.startTime`, `Exam.endTime`, `Exam.durationMinutes`, `Exam.timezone`, `Exam.status`                                              | `src/server/services/exams.ts`, `src/lib/timing.ts` (`testPhase`, `examAvailability`)                          | Full schedule & availability calculation exists. UPCOMING, ACTIVE, ENDED phases derived.                       |
| **Per-Student Sitting Start / End** | `ExamSession.startedAt`, `ExamSession.endedAt`, `ExamSession.expiresAt`, `ExamSession.status`, `ExamSession.attemptNumber`            | `src/server/services/sessions.ts` (`currentSession`, `getExamTimeState`, `openSession`)                        | Models one "sitting" (1-based attempt at an exam). Deadline authoritative on server.                           |
| **Per-Question Attempt**            | `Attempt.id`, `Attempt.sessionId`, `Attempt.questionId`, `Attempt.html`, `Attempt.css`, `Attempt.js`, `Attempt.status`                | `src/server/services/attempts.ts` (`getOrCreateAttempt`, `ensureAttempts`, `saveAttemptCode`, `submitAttempt`) | Unique per `(sessionId, questionId)`. Tracks student code and question-level lifecycle.                        |
| **Score Tracking**                  | `Attempt.score`, `Attempt.maxScore`, `ExamSession.score`, `ExamSession.maxScore`, `ExamSession.percentage`                            | `src/server/grading/marks.ts`, `src/server/grading/sitting-totals.ts` (`refreshSittingTotals`)                 | Scores are fixed-point decimals (`Decimal(12, 4)`) converted via micro-units.                                  |
| **Test Runs ("Tries")**             | `TestRun.id`, `TestRun.attemptId`, `TestRun.kind` (`PRACTICE` \| `SUBMISSION` \| `VALIDATION`), `TestRun.status`, `TestRun.startedAt` | `src/server/grading/run-tests.ts` (`executeTests`)                                                             | Every run records a `TestRun` row, but there is no denormalized try counter on `Attempt`.                      |
| **Accepted-at Timestamp**           | `Attempt.submittedAt`, `Attempt.gradedAt`                                                                                             | `src/server/services/attempts.ts`, `src/server/services/integrity/contest-ranking.ts`                          | **Gap:** `submittedAt` is overwritten on resubmission. Earliest accepted solve time is not currently isolated. |
| **Admin Contest Standings**         | `ContestStandingRow`, `rankContestStandings`                                                                                          | `src/server/services/integrity/contest-ranking.ts`                                                             | Existing admin ranking sorts by score desc, then earliest last accepted submission, then violations.           |

---

## 2. Gaps & Schema Additions

To support the Scaler contest UI and high-throughput scoreboard queries without expensive joins:

### A. Prisma Schema Additions (`prisma/schema.prisma`)

1. **`Exam` Model Updates**:
   - `leaderboardVisibility`: Enum `LeaderboardVisibility { LIVE, AFTER_END, HIDDEN }` (default: `LIVE`).
   - `wrongSubmissionPenaltyMinutes`: `Int @default(20)` (configurable penalty added to Effective Time per failed submission).
   - `isMandatory`: `Boolean @default(true)` (renders the "Mandatory" badge in the header).
   - `contestNotes`: `String? @db.Text` (rendered in the "Notes" tab).
   - `instructorInfo`: `Json?` (name, avatar, title rendered in "Instructor Info" tab).
2. **`Attempt` Model Updates**:
   - `acceptedAt`: `DateTime?` — Timestamp when the attempt first achieved full points (`score >= maxScore`). Once set, it is immutable across subsequent runs or resubmissions.
   - `triesCount`: `Int @default(0)` — Denormalized count of graded submissions made for this question.
   - `isPlagiarized`: `Boolean @default(false)` — Flag set by admin review or similarity inspection; displays `⚠ Plagiarized` on the scoreboard.
3. **`ExamSession` Model Updates**:
   - `totalTries`: `Int @default(0)` — Sum of tries across all questions in the sitting (displayed as `(N attempts)` below score).
   - `effectiveTimeSeconds`: `Int?` — Cached effective time in seconds for fast scoreboard sorting.
4. **`User` Model Updates**:
   - `handle`: `String? @unique` — Public display handle. If null, derived as `<batch_or_student>_<anonymized_hash>` (e.g., `vaibhav26bcs10186_d52cf05a`).

---

## 3. UI Specification (Derived from Screenshots)

### A. Contest Landing Page (Screenshots 1 & 2)

#### 1. Sticky Tinted Top Header

- **Container**: Sticky at top (`top-0 z-30`), tinted ivory/amber background (`bg-[#FFFDF5] border-b border-[#F7EAC8] px-6 py-3`).
- **Left Cluster**:
  - Hamburger menu icon button (`text-slate-700 hover:text-slate-900`).
  - Contest Title: Bold heading (e.g. `Maths Contest - Beginners`) with chevron down (`▾`) dropdown trigger to switch contests.
  - Date subtitle: Directly below title in `text-xs text-slate-500` (e.g. `Mon, 12 Oct 2026`).
  - Badge: Amber rounded-pill badge `"Mandatory"` (`bg-[#FEF3D6] text-[#926004] border border-[#FADF9E] text-xs font-semibold px-2 py-0.5`).
- **Right Cluster**:
  - Notification Bell Icon (`text-amber-500 hover:text-amber-600` with optional unread badge).
  - Stat Card 1 (Rank):
    - Trophy icon + rank block (`--` if unranked/missed, `#4` if ranked).
    - Blue text link below: `"View Leaderboard"`.
  - Stat Card 2 (Score):
    - Speedometer/gauge icon + score text (e.g. `-- / 100` or `84 / 100`).
    - Subtitle below: `"Score Obtained"`.

#### 2. Tab Navigation

- Tab list with active blue bottom-indicator:
  1. `Contest` (with lock icon `🔒` if locked/ended or before start).
  2. `Notes` (displays instructor/problem notes).
  3. `Instructor Info` (instructor profile & guidelines).

#### 3. Hero Card

- **Background**: Light blue gradient wash with subtle wave graphic (`bg-gradient-to-b from-blue-50/70 via-sky-50/30 to-white rounded-2xl border border-sky-100 p-8 shadow-xs`).
- **Illustration**: Centered 3D podium with 1st, 2nd, 3rd tiers, golden trophy with Scaler branding, and two cheerful student avatars.
- **State Badge**:
  - `Upcoming`: Slate/blue pill.
  - `Live`: Pulsing green pill (`Live Now`).
  - `Contest Missed`: Soft pink pill (`bg-rose-50 text-rose-600 border border-rose-200`).
  - `Completed`: Emerald pill (`Completed`).
- **Title & Description**:
  - Large title: `Maths Contest - Beginners`.
  - Subtitle: _"This contest is over. However, you can practice the contest questions in Practice Mode. However, solving questions in Practice Mode will not affect your score."_
- **Schedule Metadata Chips**:
  - Red clock icon: `Starts - Mon, 12 Oct 2026, 6:15 PM - Mon, 12 Oct 2026, 8:15 PM`.
  - Red stopwatch icon: `Duration - 120 mins`.
- **Action Buttons**:
  - Primary button:
    - If Live: `Start Contest` / `Resume Contest`.
    - If Missed or Completed: `Practice Mode` (redirects to practice workspace).
    - If Upcoming: Disabled countdown button.
  - Secondary link: `"View Leaderboard"` (blue link with right chevron).

#### 4. "Your Attempts" Table

- **Header**: `Your Attempts` with helper text: `You have 1 Attempts to clear the Contest`.
- **Columns**:
  1. `DATE OF ATTEMPT` (e.g. `Mon, 12 Oct, 6:15 PM - Mon, 12 Oct, 8:15 PM`).
  2. `ATTEMPT` (e.g. `Attempt 1`).
  3. `STATUS` (soft pill badge: `Missed` in rose, `Submitted` in blue, `In Progress` in amber).
  4. `SCORE` (e.g. `N/A` or `84 / 100`).
  5. `REPORT` (link to view detailed breakdown if allowed).

#### 5. "Benefits of Contests"

- Section header with trending graph icon: `Benefits of Contests`.
- 3 numbered cards in a horizontal grid:
  - `01`: _"Ideal preparation for coding rounds and job interviews"_
  - `02`: _"Develops capacity to handle pressure and think quickly under time constraint"_
  - `03`: _"Helps with revision of concepts and problems"_

#### 6. Collapsible "Contest Instructions"

- Header with document icon and collapsible accordion chevron (`v` / `^`).
- Subtitle: `Test Instructions`.
- Vertical timeline nodes:
  - **GENERAL**: _"This is a timed test. Please keep track of the time remaining at the top of the page. If you feel the question is unclear, try out different inputs and check the expected output for each of them."_
  - **CODE IMPLEMENTATION**: _"You only need to implement the given function. Do not read input; instead use the arguments to the function. Do not print the output; instead return values as specified. Still have a question? Check out Sample Codes for more details."_
  - **PLAGIARISM**: _"Your code submission will be checked for plagiarism after you're finished. If the code is found to be similar to another, it will be reported as appropriate. To prevent plagiarism, we discourage switching tabs or windows during the test. Any such activity will be recorded and will be available for the company contact to see."_
- Blue callout box at bottom:
  - _"Once the contest is over, your rank on the contest leaderboard will be frozen. You can still attempt all the problems."_

#### 7. "Similar Contests" Carousel

- Header with right-arrow navigation button.
- Cards showing similar available contests (e.g. `Practice Contest`, `Brush Up Your English Quiz`, `Web Dev 101 End Term`, `English End Term`).

---

### B. Scoreboard Page (Screenshot 3)

#### 1. Top Bar & Navigation

- Scaler-styled header: Platform logo on left, `"Hi, <NAME> ▾"` dropdown and Bell icon on right.
- `< Back to Contest` navigation breadcrumb link.

#### 2. Title & Announcement Banner

- Card: `Scoreboard - <Contest Title>` (e.g. `Scoreboard - Maths Contest - Beginners`).
- Dismissible notice banner (`bg-sky-50 border border-sky-200 text-sky-800 p-3 rounded-lg flex items-center justify-between`):
  - Info icon `(i)` + _"This is the ongoing leaderboard. Winners may or may not be the same as all submissions will be reviewed post the contest."_
  - Close button `✕`.

#### 3. Legend Row

- Centered status key:
  - Green checkmark `✔ Correct Answer`
  - Red cross `✖ Wrong Answer`
  - Muted dash `— Not Attempted`
  - Red warning triangle `⚠ Plagiarized`

#### 4. Scoreboard Table Columns

- **Horizontal Scroll Container** for scaling to many questions.
- Columns:
  1. **`RANK`**: Distinct colored teal/cyan block (`bg-[#47B2C0] text-white font-bold text-center w-12 py-2 rounded-md`) for top performers.
  2. **`USERNAME`**:
     - Circular avatar with letter initial.
     - Truncated display handle (e.g. `vaibhav26bcs10186_d52cf05a...`).
     - Highlight current student row with a subtle blue tint + `(You)` tag.
  3. **`SCORE`**:
     - Bold score number (e.g. `92.0`).
     - Subtext below: `(35 attempts)` in muted gray.
  4. **`EFFECTIVE TIME ⓘ`**:
     - Time in format `31H:28M:16S`.
     - Tooltip on info icon explaining penalty calculations.
  5. **Question Columns (`Q1. Emai…`, `Q2. Reve…`, etc.)**:
     - Header: Question index + truncated title in a pill (`Q1. Emai…`).
     - Cell layout:
       - Status Icon:
         - `✔` (green check) for passed (`score == maxScore`).
         - `✖` (red cross) for failed / partial.
         - `⚠` (red alert) for plagiarized.
         - `—` (dash) for not attempted.
       - Line 1: `N tries` (e.g. `1 tries`, `4 tries`).
       - Line 2: Solve duration (e.g. `35 m 32 sec`).

---

## 4. Ranking Rules & Effective Time Formula

The scoreboard orders participants strictly using DSA competitive programming rules:

### A. Sorting Hierarchy

1. **Primary**: `Score DESC` (highest total points first).
2. **Secondary**: `Effective Time ASC` (lowest effective penalty time first).
3. **Tertiary**: `Last Accepted Time ASC` (earliest timestamp of the final accepted problem).
4. **Tie-Break**: Stable alphabetical sort by display handle.

### B. Effective Time Formula

For a given student sitting:
$$\text{Effective Time} = \sum_{q \in \text{Accepted Questions}} \Big( \text{SolveTimeSeconds}(q) + \big(\text{WrongTries}(q) \times \text{PenaltyMinutes} \times 60\big) \Big)$$

- **$\text{SolveTimeSeconds}(q)$**: Seconds elapsed from **Sitting Start** (or Contest Start) to the first accepted submission of question $q$.
- **$\text{WrongTries}(q)$**: Number of rejected/failed runs on question $q$ prior to the first accepted run. Runs submitted _after_ the problem is solved do NOT add penalties.
- **Unsolved Questions**: If a question is never fully solved, its time and wrong tries are **excluded** from Effective Time (it only impacts the rank via the lower score).
- **Default Penalty**: `20 minutes` per wrong try before acceptance (configurable per contest on `Exam.wrongSubmissionPenaltyMinutes`).

---

## 5. Privacy & Integrity Rules

1. **Identity Protection**:
   - The public scoreboard **never** exposes email addresses, student IDs, phone numbers, or batch allocations.
   - Users are represented exclusively by their public `handle` or an anonymized slug (e.g., `vaibhav26bcs10186_...`).
2. **Code & Test Secrecy**:
   - The scoreboard API returns only statistical aggregates (score, tries, solve time, question verdict icon).
   - Source code, ASTs, and hidden test inputs/outputs are never included in scoreboard responses.
3. **Contest Visibility Modes**:
   - `LIVE`: Students can view the live updating scoreboard during and after the contest.
   - `AFTER_END`: Scoreboard endpoint returns `403 / Locked` with message _"Leaderboard will unlock when the contest concludes"_ until `endTime`.
   - `HIDDEN`: Leaderboard is restricted to admins only (`ResultVisibility.HIDDEN`).
4. **Post-Contest Freeze**:
   - Scores and ranks freeze permanently at contest `endTime`.
   - Practice runs performed via Practice Mode are tagged with `kind: 'PRACTICE'` and are strictly filtered out of scoreboard computations.

---

## 6. Open Architecture Questions

Before beginning implementation, please clarify these key decisions:

1. **Effective Time Anchor (Contest Start vs. Sitting Start)**:
   - _Option A (Global Synchronous)_: Solve time is measured from `Exam.startTime` (standard for live DSA contests where all participants start simultaneously at e.g. 6:15 PM).
   - _Option B (Individual Sitting)_: Solve time is measured from `ExamSession.startedAt` (allows flexible test windows where students start at different times).
   - _Recommendation_: Use Option A when `Exam.startTime` is set; fallback to Option B if the contest has an open/flexible start window.

2. **Definition of "Tries"**:
   - _Option A (Submissions only)_: Count only explicit submissions (`kind: 'SUBMISSION'`) towards `N tries` and wrong-try penalty.
   - _Option B (Submissions + Runs)_: Count every test execution including in-editor "Run Code" (`kind: 'PRACTICE'`).
   - _Recommendation_: Option A (Submissions only), as students frequently run sample tests for debugging without intending to trigger a penalty.

3. **Display Handle Source**:
   - Should `handle` be an editable field in student profile settings, or should it be auto-generated from email/batch to guarantee privacy?

4. **URL Structure**:
   - Preferred route convention:
     - `/contests/[id]` (Landing page) and `/contests/[id]/scoreboard` (Scoreboard), or
     - `/exams/[id]` and `/exams/[id]/scoreboard`?
