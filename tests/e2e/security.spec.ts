import { expect, test } from '@playwright/test';

for (const path of ['/admin/dashboard', '/admin/users', '/admin/audit-log', '/admin/remittances', '/admin/agents', '/admin/inquiries', '/admin/requests']) {
  test(`anonymous ${path} redirects to admin sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
}

for (const path of ['/portal/dashboard', '/portal/invoices']) {
  test(`anonymous ${path} redirects to portal sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/portal(?:\?.*)?$/);
  });
}

test('invalid invoice verification reveals no invoice data', async ({ page }) => {
  await page.goto('/verify/invoice/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Invoice could not be verified' })).toBeVisible();
  await expect(page.getByText(/invoice number|customer TRN|balance due/i)).toHaveCount(0);
});

test('verified invoice exposes only approved public fields', async ({ page }) => {
  const code = process.env.E2E_INVOICE_VERIFICATION_CODE;
  test.skip(!code, 'Set E2E_INVOICE_VERIFICATION_CODE');
  await page.goto(`/verify/invoice/${code}`);
  await expect(page.getByRole('heading', { name: 'Invoice verified' })).toBeVisible();
  await expect(page.getByText(/Issued by/)).toBeVisible();
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const forbidden of ['created_by', 'updated_by', 'service_role', 'auth.users', 'storage_path', 'supplier_id', 'internal notes']) {
    expect(body).not.toContain(forbidden);
  }
});

test('service worker excludes private, API, portal, and Supabase traffic', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toMatch(/\/admin/);
  expect(source).toMatch(/\/api/);
  expect(source).toMatch(/\/portal/);
  expect(source).toMatch(/url\.origin\s*!==\s*self\.location\.origin/);
  expect(source).not.toMatch(/supabase\.co.*cache|cache.*supabase\.co/i);
});
