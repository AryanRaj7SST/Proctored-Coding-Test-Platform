# Restrictions & Features for a Proctored Online Coding Test

A reference list of everything an online coding-exam platform can restrict, detect,
or enforce while a candidate is taking a test — organized by what it protects.
Each item notes whether it's a **hard restriction** (actually preventable from a
browser/server), a **detection/logging** measure (observable but not preventable),
or requires **OS-level software** outside a normal webpage's reach.

---

## 1. Environment & focus restrictions

| Restriction                                | Type                       | Notes                                                                                                                        |
| ------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tab switch / window blur detection         | Detection                  | `visibilitychange` + `blur` events; can't be blocked, only logged                                                            |
| Fullscreen enforcement                     | Hard restriction (partial) | Can require fullscreen to start/continue; exit is detectable and can pause/flag the attempt                                  |
| Re-entry gate after fullscreen exit        | Hard restriction           | Block resuming the test until fullscreen is re-entered via user gesture                                                      |
| Page reload / refresh detection            | Detection                  | Navigation Timing API (`performance.getEntriesByType('navigation')`); logged as violation                                    |
| Right-click / context-menu disable         | Hard restriction (weak)    | `contextmenu` preventDefault — trivially bypassed by a determined user, deterrent only                                       |
| Dev tools open detection                   | Detection (unreliable)     | Heuristics only (window size delta, `debugger` timing traps); false positives are common                                     |
| Copy restriction (out of editor)           | Hard restriction (weak)    | `copy` event preventDefault; OS-level screenshot/photo still works                                                           |
| Paste restriction / logging into editor    | Hard block + Detection     | Prevent `paste` event into code editor; log attempt with timestamp and metadata                                              |
| Clipboard content diffing                  | Detection                  | Compare pasted text against known solutions/sources if allowed to read clipboard                                             |
| Print restriction                          | Hard restriction (weak)    | `@media print` CSS to blank the page; doesn't stop screenshots                                                               |
| Multiple monitor / window detection        | Not possible from browser  | Requires OS-level lockdown software                                                                                          |
| Second device / phone detection            | Not possible               | Requires physical proctoring (webcam + human/AI review) or lockdown hardware                                                 |
| Browser extension detection                | Partially possible         | Some extensions are detectable via DOM fingerprints; not comprehensive                                                       |
| Kiosk / lockdown browser mode              | OS-level software          | e.g. Safe Exam Browser, Respondus — blocks alt-tab, other apps, screen recording at OS level; a webpage alone cannot do this |
| Virtual machine / remote desktop detection | OS-level software only     | Needs a native agent, not achievable in-browser                                                                              |

## 2. Identity & session restrictions

| Restriction                                 | Type                      | Notes                                                                                |
| ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Single active session per user per exam     | Hard restriction          | Invalidate/kick older session on new login; prevents sharing a login across machines |
| Session-bound to device/browser fingerprint | Hard restriction          | Detect and flag a session resuming from a different IP/UA mid-exam                   |
| Time-boxed access window                    | Hard restriction          | Exam only startable within an admin-defined window; server-authoritative             |
| Resumable but not restartable               | Hard restriction          | A closed tab/crash resumes the same timer countdown, never resets it                 |
| Heartbeat / liveness ping                   | Detection                 | Regular ping proves the tab stayed open; gaps flag "away" time                       |
| Auto-submit on time expiry                  | Hard restriction          | Server-side cutoff, never trusts the client clock                                    |
| IP address logging / geofencing             | Detection (or hard block) | Log IP per session; optionally restrict to expected ranges (e.g. campus network)     |
| Open sign-in, role-based access             | Hard restriction          | Any verified Google account signs in as STUDENT; ADMIN only set server-side          |
| Per-test access control                     | Hard restriction          | Tests open by default or assigned-only; admins can revoke one student's access       |
| Post-submission practice mode               | Feature                   | Submitted questions can be reopened and re-run without proctoring; never re-graded   |
| Unlimited resubmission, best score counts   | Feature                   | Resubmit any question until time runs out; the test ends only by timer or End Test   |
| Role re-verified server-side every request  | Hard restriction          | Client-reported role/permissions are never trusted                                   |

## 3. Content & question protection

| Restriction                                                 | Type                    | Notes                                                                               |
| ----------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Hidden test cases never sent to client                      | Hard restriction        | Only names/points of visible tests are exposed; hidden test bodies stay server-side |
| No question text/code in page source beyond what's rendered | Hard restriction        | Avoid embedding full question banks in client-side JS bundles                       |
| Disable text selection on question prompts                  | Hard restriction (weak) | CSS `user-select: none`; screenshot still works                                     |
| Rate-limited "run"/"submit" actions                         | Hard restriction        | Stops brute-forcing hidden tests via rapid repeated submission                      |
| Submission diffing against hidden tests hidden until submit | Hard restriction        | Visible tests for iteration, hidden tests revealed only at grading                  |
| Watermarking rendered question content                      | Detection aid           | Embed a student/session ID invisibly in rendered text to trace leaks                |

## 4. Code execution sandboxing (security, not just fairness)

| Restriction                                    | Type             | Notes                                                                                                                               |
| ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Network-isolated execution                     | Hard restriction | Student code cannot make outbound requests, load remote scripts, or exfiltrate data                                                 |
| CPU / memory / process ceilings                | Hard restriction | Prevents fork bombs, memory exhaustion, resource abuse                                                                              |
| Wall-clock execution timeout                   | Hard restriction | Kills infinite loops / hung processes                                                                                               |
| Output size ceiling                            | Hard restriction | Prevents disk/log exhaustion from runaway `print`/`console.log`                                                                     |
| Read-only or ephemeral filesystem              | Hard restriction | No persistence between runs; no tampering with the runner host                                                                      |
| One-per-request isolated context/container     | Hard restriction | No state or side effects leak between different students' runs                                                                      |
| Sandboxed live preview (separate from grading) | Hard restriction | Preview iframe with `sandbox="allow-scripts"` (no `allow-same-origin`) so student code can't reach the parent app, cookies, or APIs |

## 5. Academic integrity signals

| Restriction                                          | Type                   | Notes                                                                                           |
| ---------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| Plagiarism / similarity detection across submissions | Detection              | Token- or AST-based diff between students' final code for the same question                     |
| Paste-pattern anomaly detection                      | Detection              | A large paste of a complete, working solution is a stronger signal than incremental typing      |
| Keystroke/typing cadence analysis                    | Detection              | Optional, more invasive; flags implausibly fast or uniform typing                               |
| Code history / replay capture                        | Detection aid          | Periodic snapshots (on every test run and submit) let a reviewer see _how_ a solution was built |
| Cross-student timing correlation                     | Detection              | Two candidates submitting near-identical code within seconds of each other                      |
| AI-generated code detection                          | Detection (unreliable) | Heuristic/model-based; high false-positive risk, use as a signal not a verdict                  |

## 6. Grading integrity

| Restriction                                        | Type             | Notes                                                                                        |
| -------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Server-authoritative scoring                       | Hard restriction | Score is computed and stored server-side; client never reports its own score                 |
| Server-authoritative timer                         | Hard restriction | Remaining time is computed from server clock + DB timestamps, not `Date.now()` on the client |
| Immutable submission record                        | Hard restriction | Once graded, the submitted code/result is stored and not further editable                    |
| Violation count gating auto-fail / flag-for-review | Hard restriction | Configurable threshold (e.g. `maxViolations`) that auto-flags or ends the attempt            |

## 7. Auditing & accountability

| Restriction                                                   | Type             | Notes                                                                                                                    |
| ------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Full event audit log (every violation, admin action, sign-in) | Detection aid    | Timestamped, attributable, never silently dropped                                                                        |
| Errors never leak internals to the client                     | Hard restriction | No stack traces, SQL, or file paths in API error responses                                                               |
| Rate-limited admin actions (e.g. CSV import)                  | Hard restriction | Prevents abuse of privileged endpoints                                                                                   |
| Immutable audit trail for admin mutations                     | Hard restriction | create/update/delete on exams, questions, roster, roles and test access all logged independently of the action's success |

## 8. Honest limits — things a browser-based platform cannot actually do

These are commonly _advertised_ by proctoring products but require OS-level
software, dedicated hardware, or human review — not achievable from a webpage:

- True lockdown of other applications / alt-tab prevention
- Webcam-based face/gaze/multiple-person detection
- Screen recording or live human proctor monitoring
- Detecting a second physical device (phone) being used off-camera
- Keystroke biometrics as a hard identity check
- Reliable dev-tools-open detection (heuristic at best)
- Blocking OS-level screenshots or a second computer entirely

Being explicit about this list — rather than silently failing to deliver it — is
itself a legitimate design choice: it sets correct expectations for admins and
avoids a false sense of security.
