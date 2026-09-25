import { describe, it, expect } from 'vitest';
import { runTimeoutFor } from '@/lib/runner-client';
import { env } from '@/lib/env';

/**
 * The app must wait at least as long as the runner can legitimately take --
 * every test may use its own time limit -- or a student's slow/broken page
 * turns into a runner TIMEOUT ("grading pending" for ever) instead of failed
 * tests. Reproduced: 12 click tests on a missing button took 37 s against a
 * fixed 30 s wait.
 */
describe('runTimeoutFor', () => {
  it('adds the per-test allowance for every test', () => {
    expect(runTimeoutFor(0)).toBe(env.runnerTimeoutMs);
    expect(runTimeoutFor(12)).toBe(env.runnerTimeoutMs + 12 * env.runnerTestTimeoutMs);
  });

  it('covers the reproduced 12-test worst case with margin', () => {
    expect(runTimeoutFor(12)).toBeGreaterThan(12 * 6_000);
  });

  it('never goes below the base wait', () => {
    expect(runTimeoutFor(-3)).toBe(env.runnerTimeoutMs);
  });
});
