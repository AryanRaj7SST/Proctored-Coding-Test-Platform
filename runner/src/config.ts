function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function int(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export const config = {
  port: int('PORT', 4000),
  secret: str('RUNNER_SECRET', ''),
  isolation: str('RUNNER_ISOLATION', 'container') as 'container' | 'docker',
  maxConcurrency: int('RUNNER_MAX_CONCURRENCY', 4),
  maxQueue: int('RUNNER_MAX_QUEUE', 64),
  runTimeoutMs: int('RUN_TIMEOUT_MS', 20_000),
  testTimeoutMs: int('TEST_TIMEOUT_MS', 6_000),
  maxPayloadBytes: int('MAX_PAYLOAD_BYTES', 1_000_000),
  /** Requests older than this are rejected as replays. */
  signatureWindowMs: int('SIGNATURE_WINDOW_MS', 120_000),
  chromiumNoSandbox: bool('RUNNER_CHROMIUM_NO_SANDBOX', false),
  docker: {
    image: str('DOCKER_IMAGE', 'proctored-runner-sandbox:latest'),
    memory: str('DOCKER_MEMORY', '256m'),
    cpus: str('DOCKER_CPUS', '0.5'),
    pidsLimit: int('DOCKER_PIDS_LIMIT', 128),
  },
  logLevel: str('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
} as const;

export function assertConfig(): void {
  if (!config.secret || config.secret.length < 16) {
    throw new Error('RUNNER_SECRET must be set to at least 16 characters.');
  }
}
