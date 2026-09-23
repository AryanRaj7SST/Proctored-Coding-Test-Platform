import { getSessionUser } from '@/lib/authz';
import { monitorSnapshot } from '@/server/services/monitor';
import { logger, sanitizeError } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const INTERVAL_MS = 3000;
const MAX_LIFETIME_MS = 4 * 60 * 1000;

/**
 * Server-Sent Events feed for /admin/monitor.
 *
 * Deliberately a polling loop behind one long-lived response rather than a
 * websocket stack (product requirement #23: "do not introduce a complex
 * realtime architecture unless needed"). The client reconnects automatically
 * when the stream closes, which also caps the lifetime of a serverless invocation.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (user.role !== 'ADMIN') return new Response('Forbidden', { status: 403 });

  const examId = new URL(req.url).searchParams.get('examId') ?? undefined;
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };

      req.signal.addEventListener('abort', close);

      const push = async () => {
        if (closed) return;
        try {
          const rows = await monitorSnapshot(examId);
          controller.enqueue(
            encoder.encode(
              `event: snapshot\ndata: ${JSON.stringify({ rows, at: new Date().toISOString() })}\n\n`,
            ),
          );
        } catch (err) {
          logger.warn('monitor.stream_error', { error: sanitizeError(err) });
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'snapshot failed' })}\n\n`),
          );
        }
        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          controller.enqueue(encoder.encode('event: bye\ndata: {}\n\n'));
          close();
          return;
        }
        timer = setTimeout(() => void push(), INTERVAL_MS);
      };

      controller.enqueue(encoder.encode(`retry: 4000\n\n`));
      await push();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
