import { test, expect, type Page } from '@playwright/test';
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

/**
 * The pre-test system check: the (fake) camera must be streaming and the page
 * fullscreen before Start is enabled. The camera never leaves the browser.
 */
async function passSystemCheck(page: Page) {
  await expect(page.getByText('System check')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: /^Active$/ })).toBeVisible({ timeout: 15_000 });
  const fullscreen = page.getByRole('button', { name: 'Enter Fullscreen & Continue' });
  if (await fullscreen.isVisible()) await fullscreen.click();
  await page.getByRole('button', { name: /^(Start|Resume) Test$/ }).click();
}

/** Dashboard -> rules -> system check -> workspace. Returns the test id. */
async function enterWorkspace(page: Page): Promise<string> {
  await page.goto('/dashboard');
  await page
    .getByRole('button', { name: /^(start|resume|retake) test$/i })
    .first()
    .click();
  await page.getByRole('button', { name: /start the timer|resume now/i }).click();
  await expect(page).toHaveURL(/\/exam\//);
  await passSystemCheck(page);
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 30_000 });
  await dismissWarning(page);
  return page.url().split('/exam/')[1]!.split(/[?#]/)[0]!;
}

/** Close a warning left over from an earlier step (e.g. a reload warning). */
async function dismissWarning(page: Page) {
  const back = page.getByRole('button', { name: 'Return to the test' });
  if (
    await back.waitFor({ timeout: 1_500 }).then(
      () => true,
      () => false,
    )
  )
    await back.click();
}

/** The next proctor event of `type` the page posts. */
function proctorEvent(page: Page, type: string) {
  return page.waitForResponse(
    (r) =>
      r.url().includes('/api/proctor-events') &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.type === type,
    { timeout: 20_000 },
  );
}

/** Flip the document's visibility and fire the event the browser would. */
async function setTabHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (h ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('student exam flow', () => {
  test.skip(!hasSession, 'Set E2E_STORAGE_STATE to a saved signed-in session (see tests/e2e/README.md).');
  test.use({ storageState: storageState ?? undefined });

  test('the dashboard lists the assigned test and explains the rules before starting', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const startButton = page.getByRole('button', { name: /^(start|resume) test$/i }).first();
    await expect(startButton).toBeVisible();
    await startButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/minutes/i);
    await expect(dialog).toContainText(/recorded/i);
    await expect(dialog).toContainText(/automatically/i);
  });

  test('the workspace loads the editor, the timer and the question', async ({ page }) => {
    await enterWorkspace(page);

    await expect(page.getByRole('button', { name: /index\.html/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /style\.css/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /script\.js/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^run tests$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^submit code$/i })).toBeVisible();
    await expect(page.frameLocator('iframe[title="Live preview"]').locator('body')).toBeVisible();
  });

  test('running the tests returns per-test results without runner internals', async ({ page }) => {
    await enterWorkspace(page);

    const runResponse = page.waitForResponse(
      (r) => r.url().includes('/run') && r.request().method() === 'POST',
      { timeout: 90_000 },
    );
    await page.getByRole('button', { name: /^run tests$/i }).click();
    const response = await runResponse;
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body).toHaveProperty('score');

    // Feedback is the whitelisted projection: no spec bodies, no reference solution.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('testCode');
    expect(serialised).not.toContain('assertions');
    expect(serialised).not.toContain('"selector"');
    expect(serialised).not.toContain('referenceHtml');

    await expect(page.getByText(/passed/i).first()).toBeVisible();
  });

  test('the timer is display-only: the server decides how much time is left', async ({ page }) => {
    await enterWorkspace(page);

    const heartbeat = page.waitForResponse((r) => r.url().includes('/api/heartbeat'), { timeout: 45_000 });
    const body = await (await heartbeat).json();
    expect(body).toHaveProperty('msRemaining');
    expect(body).toHaveProperty('serverTime');

    // Rewriting the client clock must not extend the test.
    const before = body.msRemaining as number;
    await page.evaluate(() => {
      const original = Date.now;
      // eslint-disable-next-line no-global-assign
      Date.now = () => original() - 60 * 60 * 1000;
    });
    const second = await (
      await page.waitForResponse((r) => r.url().includes('/api/heartbeat'), {
        timeout: 45_000,
      })
    ).json();
    expect(second.msRemaining).toBeLessThan(before + 1000);
  });

  test('leaving the tab is recorded and acknowledged on return', async ({ page }) => {
    await enterWorkspace(page);

    const eventPosted = page.waitForResponse(
      (r) =>
        r.url().includes('/api/proctor-events') &&
        r.request().method() === 'POST' &&
        r.request().postDataJSON()?.type === 'TAB_HIDDEN',
      { timeout: 20_000 },
    );

    // Headless Chromium never fires visibilitychange when another page is
    // brought to front, so replay what a real tab switch does to the document.
    await setTabHidden(page, true);
    const response = await eventPosted;
    const body = await response.json();
    expect(body.violationCount).toBeGreaterThan(0);
    await setTabHidden(page, false);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/test window left/i);
    await expect(dialog).toContainText(/you left the test window\. this event has been recorded/i);
    await expect(dialog).toContainText(/recorded violations/i);
    await page.getByRole('button', { name: 'Return to the test' }).click();
  });

  test('autosave persists work across a reload', async ({ page }) => {
    await enterWorkspace(page);

    const marker = `<!-- autosave-${Date.now()} -->`;
    await page.getByRole('button', { name: /index\.html/ }).click();
    const editor = page.getByRole('textbox', { name: 'html editor' });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');

    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/attempts/') && r.request().method() === 'PATCH',
      { timeout: 20_000 },
    );
    await page.keyboard.insertText(`\n${marker}`);
    expect((await saved).status()).toBe(200);
    await expect(page.getByText(/your code is saved/i)).toBeVisible();

    // A reload is recorded and goes back through the system check before resuming.
    const reloaded = proctorEvent(page, 'PAGE_RELOAD');
    await page.reload();
    await passSystemCheck(page);
    expect((await (await reloaded).json()).recorded).toBe(true);
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'html editor' })).toContainText(marker);
  });

  test('the system check requires a live camera and fullscreen before the test can start', async ({
    page,
  }) => {
    const id = await enterWorkspace(page);
    await page.goto(`/exam/${id}`);
    await expect(page.getByText('System check')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status').filter({ hasText: /^Active$/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('video[data-proctor-camera]')).toBeVisible();
    const start = page.getByRole('button', { name: /^(Start|Resume) Test$/ });
    if (await page.evaluate(() => Boolean(document.fullscreenElement)))
      await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByText('Fullscreen is required to take this test.').first()).toBeVisible();
    await expect(start).toBeDisabled();
    await page.getByRole('button', { name: 'Enter Fullscreen & Continue' }).click();
    await expect(start).toBeEnabled();
  });

  test('without camera permission the test cannot start', async ({ browser, page }) => {
    const id = await enterWorkspace(page);
    // A context that never granted the camera: a real browser denial.
    const denied = await browser.newContext({ storageState: storageState!, permissions: [] });
    const other = await denied.newPage();
    const reported = proctorEvent(other, 'CAMERA_PERMISSION_DENIED');
    await other.goto(`/exam/${id}`);
    await expect(other.getByText(/camera access is mandatory/i)).toBeVisible({ timeout: 30_000 });
    await other.getByRole('button', { name: 'Enter Fullscreen & Continue' }).click();
    await expect(other.getByRole('button', { name: /^(Start|Resume) Test$/ })).toBeDisabled();
    await expect(other.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect((await reported).status()).toBe(200);
    await denied.close();
  });

  test('copy and paste are blocked and recorded', async ({ page, context, baseURL }) => {
    // Per-origin grants replace the context's defaults, so keep the camera in the list
    // (dropping it mid-test is a real permission revocation: the camera gate would appear).
    await context.grantPermissions(['camera', 'clipboard-read', 'clipboard-write'], { origin: baseURL });
    await enterWorkspace(page);
    await page.evaluate(() => navigator.clipboard.writeText('SENTINEL'));
    await page.getByRole('button', { name: /index\.html/ }).click();
    const editor = page.getByRole('textbox', { name: 'html editor' });
    await editor.click();

    const copied = proctorEvent(page, 'COPY');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    expect((await (await copied).json()).recorded).toBe(true);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SENTINEL');
    await expect(page.getByText(/copy\/paste blocked/i).first()).toBeVisible();

    await page.evaluate(() => navigator.clipboard.writeText('<p>PASTED-BY-TEST</p>'));
    const pasted = proctorEvent(page, 'PASTE');
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+V');
    const body = await (await pasted).json();
    expect(body.recorded).toBe(true);
    expect(body.violationCount).toBeGreaterThan(0);
    await expect(page.getByRole('dialog')).toContainText(/copy\/paste blocked/i);
    await expect(editor).not.toContainText('PASTED-BY-TEST');
    await page.getByRole('button', { name: 'Return to the test' }).click();
  });

  test('leaving fullscreen blocks the workspace until the student returns', async ({ page }) => {
    await enterWorkspace(page);
    const exited = proctorEvent(page, 'FULLSCREEN_EXIT');
    await page.evaluate(() => document.exitFullscreen());
    expect((await (await exited).json()).recorded).toBe(true);
    const gate = page.getByRole('alertdialog');
    await expect(gate).toContainText(/fullscreen required/i);
    await page.getByRole('button', { name: 'Return to fullscreen' }).click();
    await expect(gate).toHaveCount(0);
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  });

  test('a stopped camera blocks the workspace until it is re-enabled', async ({ page }) => {
    await enterWorkspace(page);
    const stopped = proctorEvent(page, 'CAMERA_STREAM_STOPPED');
    await page.evaluate(
      () =>
        (document.querySelector('video[data-proctor-camera]') as HTMLVideoElement).srcObject &&
        ((document.querySelector('video[data-proctor-camera]') as HTMLVideoElement).srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop()),
    );
    expect((await (await stopped).json()).recorded).toBe(true);
    const gate = page.getByRole('alertdialog');
    await expect(gate).toContainText(/camera required/i);
    const restored = proctorEvent(page, 'CAMERA_RESTORED');
    await page.getByRole('button', { name: 'Re-enable camera' }).click();
    expect((await (await restored).json()).recorded).toBe(true);
    await expect(gate).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /^Active$/ })).toBeVisible();
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

  test('the question bank shows each question’s lifecycle status', async ({ page }) => {
    await page.goto('/admin/questions');
    await expect(page.getByRole('heading', { name: /questions/i }).first()).toBeVisible();
    await expect(
      page
        .locator('table')
        .getByText(/^(draft|validated|published)$/i)
        .first(),
    ).toBeVisible();
  });
});
