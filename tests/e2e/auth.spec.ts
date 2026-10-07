import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ansha-cookie-consent-v1', JSON.stringify({ analytics: false, functional: false }));
  });
});

for (const scope of ['admin', 'customer'] as const) {
  const route = scope === 'admin' ? '/admin' : '/portal';
  const prefix = scope === 'admin' ? 'admin' : 'portal';
  test(`${scope} password eye toggles without submitting`, async ({ page }) => {
    await page.goto(route);
    const password = page.locator(`#${prefix}-password`);
    await expect(password).toBeVisible();
    await password.fill('Test-password-123');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test(`${scope} server cooldown disables sign-in and survives cleared browser storage`, async ({ page }) => {
    let failures = 0;
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await page.route('**/functions/v1/password-login', async (request) => {
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
      if (request.request().method() === 'OPTIONS') {
        await request.fulfill({ status: 204, headers });
        return;
      }
      expect(request.request().postDataJSON().scope).toBe(scope);
      failures += 1;
      await request.fulfill({ status: failures >= 3 ? 429 : 401, contentType: 'application/json', headers, body: JSON.stringify({
        error: failures >= 3 ? 'Too many failed attempts. Sign-in is locked for 5 minutes.' : 'Invalid email or password.',
        attempts: Math.min(3, failures), locked_until: failures >= 3 ? lockedUntil : null,
      }) });
    });
    await page.goto(route);
    await page.locator(`#${prefix}-email`).fill('lockout-regression@example.invalid');
    await page.locator(`#${prefix}-password`).fill('Incorrect-password');
    const submit = page.locator('form').getByRole('button', { name: /^sign in$/i });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect.poll(() => failures).toBe(attempt);
      if (attempt < 3) await expect(submit).toBeEnabled();
    }
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: /Try again in/ })).toBeVisible();
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator(`#${prefix}-email`).fill('lockout-regression@example.invalid');
    await page.locator(`#${prefix}-password`).fill('Incorrect-password');
    await page.locator('form').getByRole('button', { name: /^sign in$/i }).click();
    await expect.poll(() => failures).toBe(4);
    await expect(page.locator('form').getByRole('button', { name: /^sign in$/i })).toBeDisabled();
  });
}

test('recovery page opens without an existing session and requires a recovery login', async ({ page }) => {
  await page.goto('/portal/reset-password');
  await expect(page).toHaveURL(/\/portal\/reset-password$/);
  await expect(page.getByText('Set your portal password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Open the newest password reset link');
});
