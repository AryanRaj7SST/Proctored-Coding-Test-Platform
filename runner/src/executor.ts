import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import {
  DEFAULT_VIEWPORT,
  describeAssertion,
  expectedValue,
  type Assertion,
  type RunnerRunResult,
  type RunnerSpec,
  type RunnerTestResult,
  type Step,
} from '../../shared/test-spec';
import { config } from './config';
import { log, safeError } from './logger';
import { EVALUATOR_SOURCE } from './page-script';
import { isSandboxNetworkNoise } from './console-noise';

export interface RunInput {
  runId: string;
  html: string;
  css: string;
  js: string;
  spec: RunnerSpec;
}

/** Fake origin for the student page. Nothing outside it is ever served. */
const SANDBOX_URL = 'http://sandbox.localtest/index.html';

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (!existing || !existing.isConnected()) {
      browserPromise = null;
    }
  }

  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          // Defence in depth: even if route interception were bypassed, DNS for
          // every host resolves to an address that cannot be reached.
          '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-default-apps',
          '--disable-extensions',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-dev-shm-usage',
          `--js-flags=--max-old-space-size=${config.chromiumMaxOldSpaceSizeMb}`,
          ...(config.chromiumNoSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        ],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          log.warn('browser.disconnected', {
            message: 'Shared Chromium instance disconnected; will relaunch on next run.',
          });
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => undefined);
}

function buildDocument(html: string, css: string, js: string): string {
  const raw = html ?? '';
  // Accept either a fragment or a full document from the student.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw);
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(raw);
  let body = bodyMatch ? (bodyMatch[1] ?? '') : raw;
  // Keep author <style> blocks from the head, drop <link>/<script src> (no network).
  const headStyles = headMatch
    ? (headMatch[1] ?? '').replace(/<link\b[^>]*>/gi, '').replace(/<script\b[^>]*src=[^>]*><\/script>/gi, '')
    : '';

  // Ensure body is self-contained: strip external links, scripts with src, iframes
  body = body
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*src=[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');

  const scriptTag = js && js.trim() ? `<script id="__author_js">${js}<\/script>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Test page</title>
${headStyles}
<style id="__author_css">${css ?? ''}</style>
</head>
<body>
${body}
${scriptTag}
</body></html>`;
}

async function applyStep(page: Page, step: Step, timeout: number): Promise<void> {
  switch (step.action) {
    case 'setViewport':
      await page.setViewportSize(step.viewport);
      // Give media queries a frame to settle before anything is measured.
      await page.waitForTimeout(60);
      return;
    case 'click':
      await page
        .locator(step.selector)
        .nth(step.nth ?? 0)
        .click({ timeout });
      return;
    case 'clickText': {
      const locator = step.role
        ? page.getByRole(step.role, { name: step.text, exact: step.exact ?? false })
        : page.getByText(step.text, { exact: step.exact ?? false });
      await locator.first().click({ timeout });
      return;
    }
    case 'fill':
      await page.locator(step.selector).first().fill(step.value, { timeout });
      return;
    case 'press':
      if (step.selector) await page.locator(step.selector).first().press(step.key, { timeout });
      else await page.keyboard.press(step.key);
      return;
    case 'hover':
      await page.locator(step.selector).first().hover({ timeout });
      return;
    case 'wait':
      await page.waitForTimeout(Math.min(step.ms, 5000));
      return;
    case 'waitFor':
      await page
        .locator(step.selector)
        .first()
        .waitFor({ state: step.state ?? 'visible', timeout });
      return;
    case 'scrollTo':
      await page.locator(step.selector).first().scrollIntoViewIfNeeded({ timeout });
      return;
    case 'check':
      await page.locator(step.selector).first().check({ timeout });
      return;
    case 'uncheck':
      await page.locator(step.selector).first().uncheck({ timeout });
      return;
    case 'select':
      await page.locator(step.selector).first().selectOption(step.value, { timeout });
      return;
    default:
      return;
  }
}

async function evaluateAssertion(
  page: Page,
  assertion: Assertion,
  consoleErrors: string[],
): Promise<{ passed: boolean; actual: string }> {
  const result = (await page.evaluate(
    ([source, a, errors]) => {
      // eslint-disable-next-line no-eval
      const fn = eval(source as string) as (x: unknown, e: string[]) => { passed: boolean; actual: string };
      return fn(a, errors as string[]);
    },
    [EVALUATOR_SOURCE, assertion, consoleErrors.slice(0, 5)] as const,
  )) as { passed: boolean; actual: string };
  return { passed: Boolean(result?.passed), actual: String(result?.actual ?? '') };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Execute one run: a fresh, network-less browser context, one page reload per
 * test so tests never leak state into each other, and hard timeouts at both
 * the per-test and whole-run level.
 */
export async function executeRun(input: RunInput, runBudgetMs?: number): Promise<RunnerRunResult> {
  const started = Date.now();
  const budget = runBudgetMs ?? (config.runTimeoutMs + input.spec.tests.length * config.testTimeoutMs);
  const deadline = started + budget;

  const browser = await getBrowser();
  const document = buildDocument(input.html, input.css, input.js);
  const baseViewport = input.spec.viewport ?? DEFAULT_VIEWPORT;

  let context: BrowserContext | null = null;
  const consoleLogs: string[] = [];
  const results: RunnerTestResult[] = [];
  let isRunTimedOut = false;
  let runTimer: NodeJS.Timeout | null = null;

  try {
    context = await browser.newContext({
      viewport: baseViewport,
      javaScriptEnabled: true,
      bypassCSP: false,
      serviceWorkers: 'block',
      offline: true,
      permissions: [],
      userAgent: 'ProctoredCodingPlatform-Runner',
    });
    context.setDefaultTimeout(config.testTimeoutMs);

    runTimer = setTimeout(() => {
      isRunTimedOut = true;
      log.warn('run.timeout', { runId: input.runId, budgetMs: budget });
      void context?.close().catch(() => undefined);
    }, budget);

    // Serve only the student document; abort every other request. Combined with
    // offline:true and the host-resolver rules this leaves the page with no
    // network at all.
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === SANDBOX_URL) {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: document });
        return;
      }
      await route.abort('blockedbyclient');
    });

    const consoleErrors: string[] = [];

    async function createFreshPage(): Promise<Page> {
      const p = await context!.newPage();
      p.on('console', (msg) => {
        if (consoleLogs.length < 100) consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
        // Resources the sandbox blocked (e.g. a photo URL) are not the student's errors.
        if (msg.type() === 'error' && consoleErrors.length < 20 && !isSandboxNetworkNoise(msg.text())) {
          consoleErrors.push(msg.text().slice(0, 300));
        }
      });
      p.on('pageerror', (err) => {
        const text = `[pageerror] ${String(err.message).slice(0, 300)}`;
        if (consoleLogs.length < 100) consoleLogs.push(text);
        if (consoleErrors.length < 20) consoleErrors.push(String(err.message).slice(0, 300));
      });
      // Student code must never be able to block execution with dialogs.
      p.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
      return p;
    }

    let page = await createFreshPage();

    for (const test of input.spec.tests) {
      if (isRunTimedOut || Date.now() >= deadline) {
        isRunTimedOut = true;
        break;
      }

      const testStarted = Date.now();
      consoleErrors.length = 0;
      let passed = false;
      let message: string | undefined;
      let failedCheck: { expected: string; actual: string } | undefined;
      let needsFreshPage = false;

      const remainingRunTime = Math.max(100, deadline - Date.now());
      const testBudget = Math.min(test.timeoutMs ?? config.testTimeoutMs, config.testTimeoutMs, remainingRunTime);

      try {
        await withTimeout(
          (async () => {
            await page.setViewportSize(test.viewport ?? baseViewport);
            await page.goto(SANDBOX_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(40);

            for (const step of input.spec.setup ?? []) await applyStep(page, step, config.testTimeoutMs / 2);
            for (const step of test.steps ?? []) await applyStep(page, step, config.testTimeoutMs / 2);

            for (const assertion of test.assertions) {
              const outcome = await evaluateAssertion(page, assertion, consoleErrors);
              if (!outcome.passed) {
                const actual = (outcome.actual || 'nothing').slice(0, 300);
                failedCheck = { expected: expectedValue(assertion).slice(0, 300), actual };
                message = test.failureMessage ?? `${describeAssertion(assertion)} Found: ${actual}.`;
                return;
              }
            }
            passed = true;
          })(),
          testBudget,
          'Test',
        );
      } catch (err) {
        passed = false;
        needsFreshPage = true;
        const raw = safeError(err, 200);
        message = /timed out/i.test(raw)
          ? (test.failureMessage ?? 'The page did not reach the expected state in time.')
          : (test.failureMessage ?? 'The expected interaction could not be completed on your page.');
        log.debug('test.error', { runId: input.runId, testId: test.id, detail: raw });
      } finally {
        if (needsFreshPage && !isRunTimedOut && Date.now() < deadline) {
          await page.close().catch(() => undefined);
          try {
            page = await createFreshPage();
          } catch (pageErr) {
            log.warn('page.recreate_failed', { runId: input.runId, error: safeError(pageErr) });
          }
        }
      }

      results.push({
        id: test.id,
        testName: test.name,
        passed,
        ...(passed ? {} : { message: message ?? 'This test did not pass.', ...failedCheck }),
        durationMs: Date.now() - testStarted,
      });

      if (isRunTimedOut || Date.now() >= deadline) {
        isRunTimedOut = true;
        break;
      }
    }

    if (isRunTimedOut || Date.now() >= deadline) {
      await context?.close().catch(() => undefined);
      return {
        runId: input.runId,
        status: 'TIMEOUT',
        results: results.map((r) => ({
          ...r,
          passed: false,
          message: r.message ?? 'Execution timed out before run could complete.',
        })),
        durationMs: Date.now() - started,
        consoleLogs,
        error: 'Execution exceeded the time limit.',
      };
    }

    return {
      runId: input.runId,
      status: 'COMPLETED',
      results,
      durationMs: Date.now() - started,
      consoleLogs,
    };
  } catch (err) {
    if (isRunTimedOut || Date.now() >= deadline) {
      await context?.close().catch(() => undefined);
      return {
        runId: input.runId,
        status: 'TIMEOUT',
        results: results.map((r) => ({
          ...r,
          passed: false,
          message: r.message ?? 'Execution timed out before run could complete.',
        })),
        durationMs: Date.now() - started,
        consoleLogs,
        error: 'Execution exceeded the time limit.',
      };
    }
    log.error('run.failed', { runId: input.runId, error: safeError(err) });
    return {
      runId: input.runId,
      status: 'FAILED',
      results,
      durationMs: Date.now() - started,
      consoleLogs,
      error: safeError(err),
    };
  } finally {
    if (runTimer) clearTimeout(runTimer);
    await context?.close().catch(() => undefined);
  }
}
