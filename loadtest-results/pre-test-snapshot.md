# Pre-Loadtest Production Snapshot

- **Project ID**: `old-king-32701514`
- **Parent Branch**: `production` (`br-silent-math-b3hthdwl`)
- **Restore Point Branch Name**: `pre-loadtest-20261015-0250`
- **Restore Point Branch ID**: `br-dark-hall-b3k7wshr`
- **Created At**: `2026-10-14T21:20:41Z`
- **Status**: `ready`

---

## Production Table Row Counts

Captured via read-only `SELECT count(*)` queries using `psql` against the production database:

| Table Name | Schema Model | Row Count | Description |
| :--- | :--- | :--- | :--- |
| `users` | `User` | 299 | Registered platform users (students and admins) |
| `exams` | `Exam` | 9 | Configured assessments and contests |
| `attempts` | `Attempt` | 347 | Individual student question work & submissions |
| `exam_sessions` | `ExamSession` | 79 | Candidate exam sittings |
| `questions` | `Question` | 11 | Assessment problem specifications |
| `question_tests` | `QuestionTest` | 74 | Automated test case declarations |
| `test_runs` | `TestRun` | 1,338 | Code test executions (practice, submission, validation) |
| `test_results` | `TestResult` | 6,085 | Individual assertion outcomes |
| `proctor_events` | `ProctorEvent` | 889 | Client proctoring telemetry entries |

---

*Note: The application's `DATABASE_URL` remains untouched and configured for `production`.*
