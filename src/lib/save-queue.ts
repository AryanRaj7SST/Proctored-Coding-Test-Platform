/**
 * Serial save queue used by the exam autosave.
 *
 * Every job carries the KEY (attempt id) it was created for, and the save
 * function receives that key. Switching questions therefore can never send
 * one question's code to another question's attempt: the identity travels
 * with the payload instead of being read from mutable component state.
 *
 * - Jobs run one at a time, in order, so a slow request can never let stale
 *   code overwrite fresh code.
 * - A queued (not yet started) job is coalesced with a newer value for the
 *   same key: only the latest code is written.
 * - Transient failures (network, 5xx, 429) are retried with backoff; a failure
 *   the server meant (4xx: submitted, expired, not found) is not.
 * - `drain()` resolves only when every queued and in-flight save has settled,
 *   which is what "flush before submit / switch question" needs.
 */

export type SaveFn<T> = (key: string, value: T) => Promise<void>;

export type SaveQueueEvent =
  | { type: 'saving'; key: string }
  | { type: 'saved'; key: string }
  | { type: 'error'; key: string; error: unknown };

export interface SaveQueueOptions {
  retries?: number;
  retryDelayMs?: (attempt: number) => number;
  shouldRetry?: (error: unknown) => boolean;
  onEvent?: (event: SaveQueueEvent) => void;
  sleep?: (ms: number) => Promise<void>;
}

interface Job<T> {
  key: string;
  value: T;
}

/** Retry network failures and server-side errors; never retry a 4xx verdict. */
export function isTransientSaveError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true; // fetch threw: offline / network
  return status >= 500 || status === 429 || status === 408;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SaveQueue<T> {
  private readonly queue: Job<T>[] = [];
  private running: Promise<void> | null = null;
  private readonly opts: Required<Omit<SaveQueueOptions, 'onEvent'>> & Pick<SaveQueueOptions, 'onEvent'>;

  constructor(
    private readonly save: SaveFn<T>,
    opts: SaveQueueOptions = {},
  ) {
    this.opts = {
      retries: opts.retries ?? 3,
      retryDelayMs: opts.retryDelayMs ?? ((n) => 1000 * 2 ** (n - 1)),
      shouldRetry: opts.shouldRetry ?? isTransientSaveError,
      sleep: opts.sleep ?? defaultSleep,
      onEvent: opts.onEvent,
    };
  }

  /** Queue `value` for `key` and resolve once the queue has drained. */
  enqueue(key: string, value: T): Promise<void> {
    const queued = this.queue.find((j) => j.key === key);
    if (queued) queued.value = value;
    else this.queue.push({ key, value });
    return this.drain();
  }

  /** Resolve when nothing is queued or in flight. Never rejects. */
  drain(): Promise<void> {
    if (!this.running) {
      // Yield before processing so `running` is assigned before any save
      // runs: a save that enqueues synchronously must join this loop, not
      // start a second one.
      this.running = (async () => {
        await Promise.resolve();
        await this.process();
      })().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  get idle(): boolean {
    return this.running === null && this.queue.length === 0;
  }

  private async process(): Promise<void> {
    for (let job = this.queue.shift(); job; job = this.queue.shift()) {
      await this.runJob(job);
    }
  }

  private async runJob(job: Job<T>): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      this.opts.onEvent?.({ type: 'saving', key: job.key });
      try {
        await this.save(job.key, job.value);
        this.opts.onEvent?.({ type: 'saved', key: job.key });
        return;
      } catch (error) {
        // A newer value for the same key is already queued: it supersedes
        // this one, so retrying the stale value would be wasted (or harmful).
        if (this.queue.some((j) => j.key === job.key)) return;
        if (attempt < this.opts.retries && this.opts.shouldRetry(error)) {
          await this.opts.sleep(this.opts.retryDelayMs(attempt + 1));
          continue;
        }
        this.opts.onEvent?.({ type: 'error', key: job.key, error });
        return;
      }
    }
  }
}
