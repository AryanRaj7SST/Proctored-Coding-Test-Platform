import { spawn } from 'node:child_process';
import type { RunnerRunResult } from '../../shared/test-spec';
import { config } from './config';
import { log, safeError } from './logger';
import type { RunInput } from './executor';

/**
 * Optional stronger isolation: run each execution in a throwaway container.
 *
 * Enabled with RUNNER_ISOLATION=docker. The orchestrating runner needs access
 * to a Docker endpoint; see docs/security.md for the hardening required before
 * turning this on (a rootless/remote daemon, never the host socket mounted into
 * an internet-facing service).
 *
 * The child container gets:
 *   --network=none        no network at all
 *   --read-only           immutable filesystem, /tmp on a small tmpfs
 *   --cap-drop=ALL        no capabilities
 *   --security-opt no-new-privileges
 *   --memory/--cpus/--pids-limit  resource ceilings
 *   --rm                  destroyed on exit
 * and receives its payload on stdin so no student code ever touches a path.
 */
export async function executeInDocker(input: RunInput, timeoutMs: number): Promise<RunnerRunResult> {
  const args = [
    'run',
    '--rm',
    '-i',
    '--network=none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--cap-drop=ALL',
    '--security-opt',
    'no-new-privileges',
    `--memory=${config.docker.memory}`,
    `--cpus=${config.docker.cpus}`,
    `--pids-limit=${config.docker.pidsLimit}`,
    '--env',
    'RUNNER_CHROMIUM_NO_SANDBOX=true',
    '--env',
    `TEST_TIMEOUT_MS=${config.testTimeoutMs}`,
    config.docker.image,
    'node',
    'dist/runner/src/sandbox-entry.js',
  ];

  return new Promise<RunnerRunResult>((resolve) => {
    const started = Date.now();
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: RunnerRunResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        runId: input.runId,
        status: 'TIMEOUT',
        results: [],
        durationMs: Date.now() - started,
        consoleLogs: [],
        error: 'Execution exceeded the time limit.',
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 4_000_000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk).slice(0, 4000);
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      log.error('docker.spawn_failed', { error: safeError(err) });
      finish({
        runId: input.runId,
        status: 'FAILED',
        results: [],
        durationMs: Date.now() - started,
        consoleLogs: [],
        error: 'Sandbox could not be started.',
      });
    });
    child.on('close', () => {
      clearTimeout(killTimer);
      try {
        const parsed = JSON.parse(stdout) as RunnerRunResult;
        if (!Array.isArray(parsed.results)) throw new Error('bad shape');
        finish(parsed);
      } catch {
        log.error('docker.bad_output', { stderr: stderr.slice(0, 300) });
        finish({
          runId: input.runId,
          status: 'FAILED',
          results: [],
          durationMs: Date.now() - started,
          consoleLogs: [],
          error: 'Sandbox produced no usable result.',
        });
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
