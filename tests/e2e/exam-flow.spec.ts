import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/**
 * Tier 2: the full student journey.
 *
 * Requires a saved signed-in session (see tests/e2e/README.md) because Google
 * OAuth cannot be completed headlessly. Without E2E_STORAGE_STATE these are
 * skipped rather than silently passing.
 */
const storageState = process.env.E2E_STORAGE_STATE;
const hasSession = Boolean(storageState && fs.existsSync(storageState));

test.describe('student exam flow', () => {
  test.skip(!hasSession, 'Set E2E_STORAGE_STATE to a saved signed-in session (see tests/e2e/README.md).');
  test.use({ storageState: storageState ?? undefined });

  test('the dashboard lists the assigned exam and explains the rules before starting', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const startButton = page.getByRole('button', { name: /start exam|resume exam/i }).first();
    await expect(startButton).toBeVisible();
    await startButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/minutes/i);
    await expect(dialog).toContainText(/recorded/i);
    await expect(dialog).toContainText(/automatically/i);
  });

  test('the workspace loads the IDE, the timer and the question', async ({ page }) => {
    await page.goto('/dashboard');
    await page
      .getByRole('button', { name: /start exam|resume exam/i })
      .first()
      .click();
    await page.getByRole('button', { name: /start the timer|resume now/i }).click();

    await expect(page).toHaveURL(/\/exam\//);
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'HTML' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'CSS' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'JS' })).toBeVisible();
    await expect(page.getByRole('button', { name: /run test cases/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^submit$/i })).toBeVisible();
    await expect(page.frameLocator('iframe[title="Live preview"]').locator('body')).toBeVisible();
  });

  test('running the tests returns per-test results without exposing hidden test bodies', async ({ page }) => {
    await page.goto('/dashboard');
    await page
      .getByRole('button', { name: /start exam|resume exam/i })
      .first()
      .click();
    await page.getByRole('button', { name: /start the timer|resume now/i }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    const runResponse = page.waitForResponse(
      (r) => r.url().includes('/run') && r.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: /run test cases/i }).click();
    const response = await runResponse;
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body).toHaveProperty('score');

    // The graded contract: no spec internals ever reach the browser.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('testCode');
    expect(serialised).not.toContain('assertions');
    expect(serialised).not.toContain('selector');

    await expect(page.getByText(/passed/i).first()).toBeVisible();
  });

  test('the timer is display-only: the server decides how much time is left', async ({ page }) => {
    await page.goto('/dashboard');
    await page
      .getByRole('button', { name: /start exam|resume exam/i })
      .first()
      .click();
    await page.getByRole('button', { name: /start the timer|resume now/i }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    const heartbeat = page.waitForResponse((r) => r.url().includes('/api/heartbeat'), { timeout: 30_000 });
    const body = await (await heartbeat).json();
    expect(body).toHaveProperty('msRemaining');
    expect(body).toHaveProperty('serverTime');

    // Rewriting the client clock must not extend the exam.
    const before = body.msRemaining as number;
    await page.evaluate(() => {
      const original = Date.now;
      // eslint-disable-next-line no-global-assign
      Date.now = () => original() - 60 * 60 * 1000;
    });
    const second = await (
      await page.waitForResponse((r) => r.url().includes('/api/heartbeat'), {
        timeout: 30_000,
      })
    ).json();
    expect(second.msRemaining).toBeLessThan(before + 1000);
  });

  test('leaving the tab is recorded and acknowledged on return', async ({ page, context }) => {
    await page.goto('/dashboard');
    await page
      .getByRole('button', { name: /start exam|resume exam/i })
      .first()
      .click();
    await page.getByRole('button', { name: /start the timer|resume now/i }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    const eventPosted = page.waitForResponse(
      (r) => r.url().includes('/api/proctor-events') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );

    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await page.bringToFront();

    const response = await eventPosted;
    const body = await response.json();
    expect(body.violationCount).toBeGreaterThan(0);

    await expect(page.getByRole('dialog')).toContainText(/tab switching/i);
    await page.getByRole('button', { name: /i understand/i }).click();
    await other.close();
  });

  test('autosave persists work across a reload', async ({ page }) => {
    await page.goto('/dashboard');
    await page
      .getByRole('button', { name: /start exam|resume exam/i })
      .first()
      .click();
    await page.getByRole('button', { name: /start the timer|resume now/i }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    const marker = `<!-- autosave-${Date.now()} -->`;
    await page.locator('.monaco-editor textarea').first().fill(marker);

    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/attempts/') && r.request().method() === 'PATCH',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /^save$/i }).click();
    expect((await saved).status()).toBe(200);

    await page.reload();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.locator('.monaco-editor')).toContainText(marker.slice(0, 20));
  });
});

test.describe('admin surface', () => {
  const adminState = process.env.E2E_ADMIN_STORAGE_STATE;
  test.skip(
    !(adminState && fs.existsSync(adminState)),
    'Set E2E_ADMIN_STORAGE_STATE to a saved signed-in admin session.',
  );
  test.use({ storageState: adminState ?? undefined });

  test('the live monitor connects to the event stream', async ({ page }) => {
    await page.goto('/admin/monitor');
    await expect(page.getByRole('heading', { name: /live monitor/i })).toBeVisible();
    await expect(page.getByText(/live|connecting/i).first()).toBeVisible();
  });

  test('results export produces a CSV attachment', async ({ page }) => {
    await page.goto('/admin/results');
    const download = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('link', { name: /export csv/i }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/results-.*\.csv/);
  });

  test('a question cannot be published without passing validation', async ({ page }) => {
    await page.goto('/admin/questions');
    await expect(page.getByRole('heading', { name: /questions/i })).toBeVisible();
    await expect(page.getByText(/validated|not validated/i).first()).toBeVisible();
  });
});
