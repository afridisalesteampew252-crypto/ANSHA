import { expect, test } from '@playwright/test';
import { loginAs, missingRoleReason, type AdminRole } from './helpers';

const access: Record<AdminRole, { allowed: string[]; denied: string[] }> = {
  sales: { allowed: ['/admin/customers', '/admin/reservations', '/admin/invoices'], denied: ['/admin/users', '/admin/live-chat', '/admin/ledger'] },
  freelancer: { allowed: ['/admin/customers', '/admin/reservations', '/admin/invoices'], denied: ['/admin/users', '/admin/live-chat', '/admin/ledger'] },
  accounts: { allowed: ['/admin/remittances', '/admin/reports', '/admin/ledger'], denied: ['/admin/parts', '/admin/users', '/admin/live-chat'] },
  manager: { allowed: ['/admin/hr', '/admin/live-chat', '/admin/stock'], denied: ['/admin/users', '/admin/payroll', '/admin/ledger'] },
  admin: { allowed: ['/admin/users', '/admin/audit-log', '/admin/live-chat'], denied: [] },
};

for (const role of Object.keys(access) as AdminRole[]) {
  test.describe(`${role} role restrictions`, () => {
    test.beforeEach(async ({ page }) => {
      test.skip(Boolean(missingRoleReason(role)), missingRoleReason(role));
      await loginAs(page, role);
    });

    for (const path of access[role].allowed) {
      test(`allows ${path}`, async ({ page }) => {
        await page.goto(path);
        expect(new URL(page.url()).pathname).toBe(path);
      });
    }

    for (const path of access[role].denied) {
      test(`blocks ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/admin\/dashboard(?:[/?#]|$)/);
      });
    }
  });
}
