import type { AdminRole } from '@/lib/types';

/** Catalog browse + reservation + draft proforma only (sales / contractor). */
export function isFieldAgentRole(role: string | null | undefined): boolean {
  return role === 'sales' || role === 'freelancer';
}

/** Day-to-day trading / finance ops. */
export function isOpsRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

/** Receivables / remittances / finance views (not full admin). */
export function isAccountsRole(role: string | null | undefined): boolean {
  return role === 'accounts';
}

/** Ops or accounts — customer invoices, remittances, related finance. */
export function canManageReceivables(role: string | null | undefined): boolean {
  return isOpsRole(role) || isAccountsRole(role);
}

export function isAccountAdminRole(role: string | null | undefined): boolean {
  return role === 'admin';
}

/** HR section visibility: ops manage; manager views (+ own attendance). */
export function canAccessHr(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff' || role === 'manager';
}

/** Locations / assignments / attendance admin writes. */
export function canManageHr(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

/**
 * Tawk agent inbox (`/admin/live-chat`).
 * Strict allowlist: **admin** and **manager** only.
 * Do not broaden to staff, sales, freelancer, or accounts.
 */
export function canAccessLiveChat(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Nav + proxy allowlist for sales/freelancer. */
export const FIELD_AGENT_NAV_HREFS = new Set([
  '/admin/dashboard',
  '/admin/parts',
  '/admin/vehicles',
  '/admin/auction-stock',
  '/admin/customers',
  '/admin/reservations',
  '/admin/invoices',
  '/admin/chat',
]);

export function isFieldAgentAllowedPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard' || pathname === '/admin/profile') return true;
  if (pathname === '/admin/parts' || pathname === '/admin/vehicles' || pathname === '/admin/auction-stock')
    return true;
  // No catalog create/edit routes for field agents
  if (pathname.startsWith('/admin/parts/') || pathname.startsWith('/admin/vehicles/')) return false;
  if (pathname.startsWith('/admin/customers')) return true;
  if (pathname.startsWith('/admin/reservations')) return true;
  // Draft proforma only — list / new / detail / edit query on new
  if (pathname === '/admin/invoices' || pathname === '/admin/invoices/new') return true;
  if (pathname.startsWith('/admin/invoices/') && !pathname.startsWith('/admin/invoices/supplier')) return true;
  if (pathname.startsWith('/admin/chat')) return true;
  return false;
}

/** Accounts role: receivables + finance views, not catalog/purchase/HR/marketing/users. */
export const ACCOUNTS_NAV_HREFS = new Set([
  '/admin/dashboard',
  '/admin/customers',
  '/admin/invoices',
  '/admin/invoices/supplier',
  '/admin/remittances',
  '/admin/bank-accounts',
  '/admin/expenses',
  '/admin/ledger',
  '/admin/reports',
  '/admin/vat-return',
  '/admin/chat',
]);

export function isAccountsAllowedPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard' || pathname === '/admin/profile') return true;
  if (pathname.startsWith('/admin/customers')) return true;
  if (pathname.startsWith('/admin/invoices')) return true;
  if (pathname.startsWith('/admin/remittances')) return true;
  if (pathname.startsWith('/admin/bank-accounts')) return true;
  if (pathname.startsWith('/admin/expenses')) return true;
  if (pathname.startsWith('/admin/ledger')) return true;
  if (pathname.startsWith('/admin/reports')) return true;
  if (pathname.startsWith('/admin/vat-return')) return true;
  if (pathname.startsWith('/admin/chat')) return true;
  return false;
}

export const ADMIN_ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'sales', label: 'Sales agent — catalog + reservations + draft proforma' },
  { value: 'freelancer', label: 'Freelancer — catalog + reservations + draft proforma' },
  { value: 'accounts', label: 'Accounts — invoices, remittances, finance views' },
  { value: 'manager', label: 'Manager — ops view + HR (shifts/attendance)' },
  { value: 'staff', label: 'Staff — full operations' },
  { value: 'admin', label: 'Admin — full access + account admin' },
];

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  sales: 'Sales agent',
  freelancer: 'Freelancer',
  manager: 'Manager',
  accounts: 'Accounts',
};
