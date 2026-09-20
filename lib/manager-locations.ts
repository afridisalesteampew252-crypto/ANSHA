import type { StockOrigin } from '@/lib/stock';
import { STOCK_ORIGINS } from '@/lib/stock';
import { canAccessStockOrigin, isManagerRole, managerAllowedOrigins } from '@/lib/admin-rbac';

export { canAccessStockOrigin, managerAllowedOrigins };

const VALID = new Set(STOCK_ORIGINS.map((o) => o.value));

export function sanitizeStockOrigins(input: unknown): StockOrigin[] {
  if (!Array.isArray(input)) return [];
  const out: StockOrigin[] = [];
  for (const raw of input) {
    const value = String(raw || '')
      .trim()
      .toLowerCase();
    if (VALID.has(value as StockOrigin) && !out.includes(value as StockOrigin)) {
      out.push(value as StockOrigin);
    }
  }
  return out;
}

export function stockOriginOptionsForProfile(
  profile: { role?: string | null; allowed_stock_origins?: string[] | null } | null | undefined
) {
  if (!isManagerRole(profile?.role)) return STOCK_ORIGINS;
  const allowed = managerAllowedOrigins(profile);
  if (!allowed.length) return [];
  return STOCK_ORIGINS.filter((o) => allowed.includes(o.value));
}
