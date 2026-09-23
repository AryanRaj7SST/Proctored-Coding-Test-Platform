/**
 * Entry point executed INSIDE the throwaway sandbox container
 * (RUNNER_ISOLATION=docker). Reads one RunInput as JSON on stdin, writes one
 * RunnerRunResult as JSON on stdout, then exits. It holds no secrets and has
 * no network.
 */
import { executeRun, closeBrowser, type RunInput } from './executor';
import { validateRunnerSpec } from '../../shared/test-spec';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const input = JSON.parse(raw) as RunInput;
  const spec = validateRunnerSpec(input.spec);
  if (!spec.ok || !spec.value) {
    process.stdout.write(
      JSON.stringify({
        runId: input.runId,
        status: 'FAILED',
        results: [],
        durationMs: 0,
        consoleLogs: [],
        error: 'Invalid specification.',
      }),
    );
    return;
  }
  const result = await executeRun({ ...input, spec: spec.value });
  process.stdout.write(JSON.stringify(result));
}

main()
  .catch(() => {
    process.stdout.write(
      JSON.stringify({
        runId: 'unknown',
        status: 'FAILED',
        results: [],
        durationMs: 0,
        consoleLogs: [],
        error: 'Sandbox failure.',
      }),
    );
  })
  .finally(async () => {
    await closeBrowser();
    process.exit(0);
  });
