import { test, expect } from '@playwright/test';

/**
 * Tier 1: no authentication required. These run anywhere the app is up and are
 * the smoke test for "is the deployment actually serving the product".
 */
test.describe('unauthenticated surface', () => {
  test('the health endpoint reports its dependencies', async ({ request }) => {
    const res = await request.get('/api/health');
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('runner');
    // It must never leak configuration in an unauthenticated response.
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/postgres:\/\/|AUTH_SECRET|RUNNER_SECRET/);
  });

  test('the login page explains the invite-only rule', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByText(/individually invited/i)).toBeVisible();
  });

  test('a rejected sign-in shows a specific, non-technical reason', async ({ page }) => {
    await page.goto('/login?error=NotAllowlisted');
    await expect(page.getByRole('alert')).toContainText(/not on the invite list/i);
  });

  test('protected routes redirect to login instead of rendering', async ({ page }) => {
    for (const route of ['/dashboard', '/admin', '/admin/results']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('the API refuses unauthenticated calls with 401, not 500', async ({ request }) => {
    const res = await request.get('/api/exams');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:|node_modules/);
  });

  test('security headers are present on every response', async ({ request }) => {
    const res = await request.get('/login');
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
