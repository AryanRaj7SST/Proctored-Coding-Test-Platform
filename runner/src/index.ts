import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';

// Load parent .env if present
try {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const key = k?.trim();
        const val = v
          .join('=')
          .trim()
          .replace(/^["']|["']$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

import { config, assertConfig } from './config';
import { log, safeError } from './logger';
import { authenticate } from './auth';
import { queue } from './queue';
import { executeRun, getBrowser, closeBrowser, type RunInput } from './executor';
import { executeInDocker } from './docker-runner';
import { validateRunnerSpec } from '../../shared/test-spec';

assertConfig();

const app = express();
app.disable('x-powered-by');

// Raw body is required so the HMAC covers exactly what was transmitted.
app.use(express.raw({ type: '*/*', limit: config.maxPayloadBytes }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'runner',
    isolation: config.isolation,
    ...queue.stats,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.post('/run', async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (rawBody.length > config.maxPayloadBytes) {
    res.status(413).json({ error: 'Payload too large.' });
    return;
  }

  const authResult = authenticate(req, rawBody);
  if (!authResult.ok) {
    log.warn('auth.rejected', { reason: authResult.reason, ip: req.ip });
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  let parsed: RunInput;
  try {
    parsed = JSON.parse(rawBody) as RunInput;
  } catch {
    res.status(400).json({ error: 'Body must be valid JSON.' });
    return;
  }

  const runId =
    typeof parsed.runId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(parsed.runId) ? parsed.runId : '';
  if (!runId) {
    res.status(400).json({ error: 'Invalid runId.' });
    return;
  }
  if (typeof parsed.html !== 'string' || typeof parsed.css !== 'string' || typeof parsed.js !== 'string') {
    res.status(400).json({ error: 'html, css and js must be strings.' });
    return;
  }

  // The spec is re-validated here even though the app built it: the runner
  // trusts nothing it is sent, including its own caller.
  const spec = validateRunnerSpec(parsed.spec);
  if (!spec.ok || !spec.value) {
    log.warn('spec.rejected', { runId, errors: spec.errors.slice(0, 3) });
    res.status(400).json({ error: 'Invalid specification.' });
    return;
  }

  const input: RunInput = {
    runId,
    html: parsed.html.slice(0, 400_000),
    css: parsed.css.slice(0, 400_000),
    js: parsed.js.slice(0, 400_000),
    spec: spec.value,
  };

  try {
    // Each test has its own timeout, so a run's budget grows with its size: a
    // slow or broken student page fails its tests instead of timing the run out.
    const runBudgetMs = config.runTimeoutMs + input.spec.tests.length * config.testTimeoutMs;
    const result = await queue.run(async () =>
      config.isolation === 'docker' ? executeInDocker(input, runBudgetMs) : executeRun(input),
    );
    log.info('run.completed', {
      runId,
      status: result.status,
      tests: result.results.length,
      passed: result.results.filter((r) => r.passed).length,
      durationMs: result.durationMs,
    });
    res.json(result);
  } catch (err) {
    if ((err as { code?: string }).code === 'QUEUE_FULL') {
      res.status(429).json({ error: 'Runner is busy.' });
      return;
    }
    log.error('run.error', { runId, error: safeError(err) });
    res.status(500).json({ error: 'Execution failed.' });
  }
});

// Lets the app prove its credentials work (the admin "Runner online" badge):
// authenticated exactly like /run, but runs nothing.
app.post('/auth-check', (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const authResult = authenticate(req, rawBody);
  if (!authResult.ok) {
    log.warn('auth.rejected', { reason: authResult.reason, ip: req.ip, route: 'auth-check' });
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  res.json({ ok: true });
});

// Nothing else is exposed.
app.use((_req: Request, res: Response) => res.status(404).json({ error: 'Not found.' }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log.error('unhandled', { error: safeError(err) });
  res.status(500).json({ error: 'Execution failed.' });
});

const server = app.listen(config.port, () => {
  log.info('runner.listening', {
    port: config.port,
    isolation: config.isolation,
    concurrency: config.maxConcurrency,
  });
  if (config.isolation === 'container') {
    void getBrowser().catch((err) => log.error('browser.launch_failed', { error: safeError(err) }));
  }
});

async function shutdown(signal: string): Promise<void> {
  log.info('runner.shutdown', { signal });
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
