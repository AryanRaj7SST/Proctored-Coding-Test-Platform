import { test, expect } from '@playwright/test';

test.describe('Leaderboard smoke test', () => {
  test('unauthenticated request redirects to login with callbackUrl', async ({ page }) => {
    const fakeExamId = 'c0000000000000000000000001';
    await page.goto(`/exams/${fakeExamId}/leaderboard`);

    // Must be redirected to /login with callbackUrl
    await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=.*${fakeExamId}.*`));
  });

  test('leaderboard api rejects unauthenticated requests with 401', async ({ request }) => {
    const fakeExamId = 'c0000000000000000000000001';
    const res = await request.get(`/api/exams/${fakeExamId}/leaderboard`);
    expect(res.status()).toBe(401);
  });
});
