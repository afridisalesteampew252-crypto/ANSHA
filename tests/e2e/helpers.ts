import { expect, type APIRequestContext, type Page } from '@playwright/test';

export type AdminRole = 'sales' | 'freelancer' | 'accounts' | 'manager' | 'admin';

export function roleCredentials(role: AdminRole) {
  const prefix = `E2E_${role.toUpperCase()}_`;
  const email = process.env[`${prefix}EMAIL`];
  const password = process.env[`${prefix}PASSWORD`];
  return email && password ? { email, password } : null;
}

export function missingRoleReason(role: AdminRole) {
  return roleCredentials(role) ? undefined : `Set E2E_${role.toUpperCase()}_EMAIL and E2E_${role.toUpperCase()}_PASSWORD`;
}

export async function loginAs(page: Page, role: AdminRole) {
  const credentials = roleCredentials(role);
  if (!credentials) throw new Error(missingRoleReason(role));
  await page.goto('/admin');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:[/?#]|$)/);
}

export function mutationSkipReason() {
  if (process.env.E2E_ALLOW_MUTATIONS !== '1') return 'Set E2E_ALLOW_MUTATIONS=1 for stateful tests';
  const db = process.env.E2E_SUPABASE_URL || '';
  const site = process.env.PLAYWRIGHT_BASE_URL || '';
  if (!db || !process.env.E2E_SUPABASE_PUBLISHABLE_KEY) return 'Set E2E_SUPABASE_URL and E2E_SUPABASE_PUBLISHABLE_KEY';
  if (db.includes('spmnxwhwsgpaoiklezex') || db.includes('ydrnilquojvalhgifest')) return 'Mutation tests are blocked against production Supabase';
  if (/anshatradingco\.com/i.test(site)) return 'Mutation tests are blocked against production';
  return undefined;
}

export async function adminAccessToken(request: APIRequestContext) {
  const credentials = roleCredentials('admin');
  if (!credentials) throw new Error(missingRoleReason('admin'));
  const response = await request.post(`${process.env.E2E_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: process.env.E2E_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
    data: credentials,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token as string;
}

export function supabaseHeaders(token: string) {
  return {
    apikey: process.env.E2E_SUPABASE_PUBLISHABLE_KEY!,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}
