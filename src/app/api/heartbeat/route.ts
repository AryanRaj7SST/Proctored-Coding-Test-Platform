import { NextResponse } from 'next/server';
import { requireAuth, requireTestAccess } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { heartbeatInput, parseOrThrow } from '@/lib/validation';
import { processHeartbeat } from '@/server/services/workspace';

export const dynamic = 'force-dynamic';
// Closing an expired sitting grades every open answer after the response (next/server `after`).
export const maxDuration = 300;

/**
 * Liveness ping from the exam page (every HEARTBEAT_INTERVAL_SECONDS), and the
 * call the page makes when its countdown reaches zero.
 *
 * This is where a sitting that has run out is finalised (graded and closed),
 * so the server enforces the deadline even when the student's countdown has
 * been tampered with or the tab was closed and reopened. Finalisation waits
 * out the submit grace window so the page's final autosave lands first.
 *
 * Response:
 *  - `expired`   the server clock says the sitting's time is up
 *  - `finalized` the sitting is closed server-side (graded or grading pending)
 *  - `endReason` why it closed (EXPIRED, EXAM_CLOSED, VIOLATION_LIMIT, STUDENT_ENDED)
 *  - `gradingPending` submitted attempts still awaiting grading
 */
export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const user = await requireAuth();
  const body = parseOrThrow(heartbeatInput, await readJson(req, 4096));
  const exam = await requireTestAccess(body.examId, user);
  return ok(await processHeartbeat(exam, user.id));
});
