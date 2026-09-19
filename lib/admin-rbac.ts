import type { AdminRole } from '@/lib/types';

/** Catalog browse + reservation request only (sales / contractor). */
export function isFieldAgentRole(role: string | null | undefined): boolean {
  return role === 'sales' || role === 'freelancer';
}

/** Day-to-day trading / finance ops. */
export function isOpsRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
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

/** Nav + proxy allowlist for sales/freelancer (customers needed to complete vehicle reserve). */
export const FIELD_AGENT_NAV_HREFS = new Set([
  '/admin/dashboard',
  '/admin/parts',
  '/admin/vehicles',
  '/admin/customers',
  '/admin/reservations',
  '/admin/chat',
]);

export function isFieldAgentAllowedPath(pathname: string): boolean {
  if (pathname === '/admin/dashboard' || pathname === '/admin/profile') return true;
  if (pathname === '/admin/parts' || pathname === '/admin/vehicles') return true;
  // No catalog create/edit routes for field agents
  if (pathname.startsWith('/admin/parts/') || pathname.startsWith('/admin/vehicles/')) return false;
  if (pathname.startsWith('/admin/customers')) return true;
  if (pathname.startsWith('/admin/reservations')) return true;
  if (pathname.startsWith('/admin/chat')) return true;
  return false;
}

export const ADMIN_ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'sales', label: 'Sales agent — catalog + reservations' },
  { value: 'freelancer', label: 'Freelancer — catalog + reservations (contractor)' },
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
};
