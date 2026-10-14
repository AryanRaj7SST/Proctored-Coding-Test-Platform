import { config } from './config';

/**
 * Bounded concurrency without Redis (product requirement #33).
 * A fixed number of runs execute at once; anything beyond `maxQueue` is
 * rejected with 429 so a student cannot exhaust the host by spamming Run.
 */
export class BoundedQueue {
  private active = 0;
  private waitingCount = 0;
  private clientQueues: Map<string, (() => void)[]> = new Map();
  private activeKeys: string[] = [];
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;
  private readonly maxPerKeyQueue: number;

  constructor(
    maxConcurrency: number = config.maxConcurrency,
    maxQueue: number = config.maxQueue,
    maxPerKeyQueue: number = maxQueue,
  ) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueue = maxQueue;
    this.maxPerKeyQueue = maxPerKeyQueue;
  }

  get stats(): { active: number; queued: number; capacity: number } {
    return { active: this.active, queued: this.waitingCount, capacity: this.maxConcurrency };
  }

  async run<T>(task: () => Promise<T>, key = 'default'): Promise<T> {
    const clientKey = key || 'default';
    const clientWaiting = this.clientQueues.get(clientKey)?.length ?? 0;

    if (
      this.active >= this.maxConcurrency &&
      (this.waitingCount >= this.maxQueue || clientWaiting >= this.maxPerKeyQueue)
    ) {
      const err = new Error('Runner queue is full.') as Error & { code?: string };
      err.code = 'QUEUE_FULL';
      throw err;
    }

    if (this.active >= this.maxConcurrency) {
      this.waitingCount += 1;
      let q = this.clientQueues.get(clientKey);
      if (!q) {
        q = [];
        this.clientQueues.set(clientKey, q);
        this.activeKeys.push(clientKey);
      }
      await new Promise<void>((resolve) => q!.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.dequeueNext();
    }
  }

  private dequeueNext(): void {
    if (this.waitingCount === 0 || this.activeKeys.length === 0) {
      return;
    }

    const nextKey = this.activeKeys.shift();
    if (!nextKey) return;

    const q = this.clientQueues.get(nextKey);
    if (!q || q.length === 0) {
      this.clientQueues.delete(nextKey);
      this.dequeueNext();
      return;
    }

    const nextResolve = q.shift()!;
    this.waitingCount -= 1;

    if (q.length > 0) {
      this.activeKeys.push(nextKey);
    } else {
      this.clientQueues.delete(nextKey);
    }

    nextResolve();
  }
}

export const queue = new BoundedQueue();
