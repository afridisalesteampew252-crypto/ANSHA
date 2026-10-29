import type { AdminRole } from '@/lib/types';

/** Reject missing activation and unknown roles before applying route permissions. */
export function isActiveAdminProfile(
  profile: { role?: unknown; is_active?: unknown } | null | undefined
): profile is { role: AdminRole; is_active: true } {
  return profile?.is_active === true && typeof profile.role === 'string'
    && ['admin', 'staff', 'sales', 'freelancer', 'manager', 'accounts'].includes(profile.role);
}

/** Catalog browse + reservation + draft proforma only (sales / contractor). */
export function isFieldAgentRole(role: string | null | undefined): boolean {
  return role === 'sales' || role === 'freelancer';
}

/** Inquiry records are scoped again by the database, including direct RPC access. */
export function canAccessInquiries(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff' || isFieldAgentRole(role);
}

/** Administrators review agents; agents submit and view their own verification. */
export function canAccessAgentVerification(role: string | null | undefined): boolean {
  return role === 'admin' || isFieldAgentRole(role);
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

export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'manager';
}

/**
 * Manager inventory/ops routes (Phase 66) — location-scoped via allowed_stock_origins + RLS.
 * Finance, marketing, purchase writes, and user admin stay blocked.
 */
export const MANAGER_NAV_HREFS = new Set([
  '/admin/dashboard',
  '/admin/parts',
  '/admin/vehicles',
  '/admin/auction-stock',
  '/admin/stock',
  '/admin/parts/stock',
  '/admin/reservations',
  '/admin/export-shipments',
  '/admin/freight-charges',
  '/admin/commissions',
  '/admin/hr',
  '/admin/hr/locations',
  '/admin/hr/shifts',
  '/admin/hr/attendance',
  '/admin/remittances/mine',
  '/admin/customers',
  '/admin/invoices',
  '/admin/chat',
  '/admin/live-chat',
  '/admin/customer-support',
]);

export function isManagerAllowedPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard' || pathname === '/admin/profile') return true;
  if (pathname === '/admin/parts' || pathname === '/admin/vehicles' || pathname === '/admin/auction-stock')
    return true;
  // Detail/edit/new for catalog — managers may manage within location scope (RLS enforces origin)
  if (pathname.startsWith('/admin/parts/') || pathname.startsWith('/admin/vehicles/')) return true;
  if (pathname.startsWith('/admin/stock')) return true;
  if (pathname.startsWith('/admin/reservations')) return true;
  if (pathname.startsWith('/admin/export-shipments')) return true;
  // Freight charge master — read-only for managers (writes are receivables RLS)
  if (pathname.startsWith('/admin/freight-charges')) return true;
  if (pathname.startsWith('/admin/commissions')) return true;
  if (pathname.startsWith('/admin/hr')) return true;
  // Tagged remittances only (not full finance remittance module)
  if (pathname === '/admin/remittances/mine') return true;
  // Customer and invoice visibility is owner-scoped by Supabase RLS; managers are view-only.
  if (pathname.startsWith('/admin/customers')) return true;
  if (pathname === '/admin/invoices' || pathname.startsWith('/admin/invoices/')) return true;
  // Payroll stays ops-only (RLS is_ops_user) — do not allowlist for managers
  if (pathname.startsWith('/admin/chat')) return true;
  if (pathname.startsWith('/admin/live-chat')) return true;
  if (pathname.startsWith('/admin/customer-support')) return true;
  return false;
}

/** Normalize manager allowed_stock_origins from a profile row. */
export function managerAllowedOrigins(
  profile: { role?: string | null; allowed_stock_origins?: string[] | null } | null | undefined
): string[] {
  if (!profile || profile.role !== 'manager') return [];
  const raw = profile.allowed_stock_origins;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => String(o).trim().toLowerCase()).filter(Boolean);
}

/** Whether a stock_origin is visible/editable for this profile (ops unrestricted). */
export function canAccessStockOrigin(
  profile: { role?: string | null; allowed_stock_origins?: string[] | null } | null | undefined,
  origin: string | null | undefined
): boolean {
  if (!profile || profile.role !== 'manager') return true;
  const allowed = managerAllowedOrigins(profile);
  if (!allowed.length || !origin) return false;
  return allowed.includes(String(origin).trim().toLowerCase());
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
  '/admin/commissions',
  '/admin/inquiries',
  '/admin/requests',
  '/admin/agents',
  '/admin/remittances/mine',
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
  if (pathname.startsWith('/admin/commissions')) return true;
  if (pathname === '/admin/inquiries' || pathname.startsWith('/admin/requests/')) return true;
  if (pathname === '/admin/requests' || pathname === '/admin/agents') return true;
  // Remittances tagged to this user only
  if (pathname === '/admin/remittances/mine') return true;
  if (pathname.startsWith('/admin/chat')) return true;
  return false;
}

/** Accounts role: receivables + finance views, not catalog/purchase/HR/marketing/users. */
export const ACCOUNTS_NAV_HREFS = new Set([
  '/admin/dashboard',
  '/admin/customers',
  '/admin/invoices',
  '/admin/invoices/supplier',
  '/admin/commissions',
  '/admin/remittances',
  '/admin/remittances/dashboard',
  '/admin/remittances/mine',
  '/admin/remittances/unknown',
  '/admin/bank-accounts',
  '/admin/expenses',
  '/admin/ledger',
  '/admin/reports',
  '/admin/reports/customer-balance-payments',
  '/admin/reports/customer-sales-value-stats',
  '/admin/reports/customer-registrations',
  '/admin/reports/office-sales-stats',
  '/admin/reports/purchase-statistics',
  '/admin/reports/resource-sales-stats',
  '/admin/reports/resource-sales-value-stats',
  '/admin/reports/financial',
  '/admin/vat-return',
  '/admin/freight-charges',
  '/admin/chat',
]);

export function isAccountsAllowedPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard' || pathname === '/admin/profile') return true;
  if (pathname.startsWith('/admin/customers')) return true;
  if (pathname.startsWith('/admin/invoices')) return true;
  if (pathname.startsWith('/admin/commissions')) return true;
  if (pathname.startsWith('/admin/remittances')) return true;
  if (pathname.startsWith('/admin/bank-accounts')) return true;
  if (pathname.startsWith('/admin/expenses')) return true;
  if (pathname.startsWith('/admin/ledger')) return true;
  if (pathname.startsWith('/admin/reports')) return true;
  if (pathname.startsWith('/admin/vat-return')) return true;
  if (pathname.startsWith('/admin/freight-charges')) return true;
  if (pathname.startsWith('/admin/chat')) return true;
  return false;
}

export const ADMIN_ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'sales', label: 'Sales agent — catalog + reservations + draft proforma' },
  { value: 'freelancer', label: 'Freelancer — catalog + reservations + draft proforma' },
  { value: 'accounts', label: 'Accounts — invoices, remittances, finance views' },
  { value: 'manager', label: 'Manager — location-scoped inventory/ops + HR' },
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
