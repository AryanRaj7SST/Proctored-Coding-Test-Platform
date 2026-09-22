import { config } from './config';

/**
 * Bounded concurrency without Redis (product requirement #33).
 * A fixed number of runs execute at once; anything beyond `maxQueue` is
 * rejected with 429 so a student cannot exhaust the host by spamming Run.
 */
export class BoundedQueue {
  private active = 0;
  private waiting: (() => void)[] = [];
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;

  // Plain assignment rather than TypeScript parameter properties: the latter
  // requires actual code transformation (not just type stripping), which not
  // every TypeScript-aware Node runtime supports -- see
  // scripts/verify-offline.mjs and runner/tests/README.md.
  constructor(maxConcurrency: number = config.maxConcurrency, maxQueue: number = config.maxQueue) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueue = maxQueue;
  }

  get stats(): { active: number; queued: number; capacity: number } {
    return { active: this.active, queued: this.waiting.length, capacity: this.maxConcurrency };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrency && this.waiting.length >= this.maxQueue) {
      const err = new Error('Runner queue is full.') as Error & { code?: string };
      err.code = 'QUEUE_FULL';
      throw err;
    }
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

export const queue = new BoundedQueue();
