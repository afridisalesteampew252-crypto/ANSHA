import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssistantAdmin } from './auth';

/** Per-request context shared by all assistant tools. Uses the admin's own session. */
export type AssistantToolContext = {
  supabase: SupabaseClient;
  admin: AssistantAdmin;
  modelId: string;
  /** Null when write tools may run; otherwise the reason they are disabled. */
  writesDisabledReason: string | null;
  /** Mutable counter: write tools proposed in this request (guards mass updates). */
  writeProposals: { count: number };
};

/** Max write proposals the model may raise in a single request (each still needs approval). */
export const MAX_WRITE_PROPOSALS_PER_REQUEST = 5;

/**
 * Make free text safe for a PostgREST `or=(...ilike...)` filter: keep letters, digits,
 * spaces and - _ / ; turn whitespace into `%` so "toyota hilux" matches "Toyota Hilux".
 */
export function toIlikePattern(query: string | null | undefined): string | null {
  const cleaned = (query ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s_\-/]/gu, ' ')
    .trim()
    .slice(0, 80);
  if (!cleaned) return null;
  return `%${cleaned.split(/\s+/).join('%')}%`;
}

export function clip(value: string | null | undefined, max = 280): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message).slice(0, 300);
  }
  return String(error).slice(0, 300);
}

export function vehicleLabel(v: {
  title?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  stock_number?: string | null;
}): string {
  const name = v.title || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
  return v.stock_number ? `${name} (stock ${v.stock_number})` : name;
}

export function partLabel(p: { name?: string | null; part_code?: string | null }): string {
  return p.part_code ? `${p.name || 'Part'} (${p.part_code})` : p.name || 'Part';
}

/** Start of "today" in UTC as ISO date (YYYY-MM-DD). */
export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type StaffRow = { id: string; full_name: string | null; email: string | null; role: string; is_active: boolean };

export async function loadStaff(supabase: SupabaseClient): Promise<StaffRow[]> {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id, full_name, email, role, is_active')
    .order('full_name');
  if (error) throw new Error(`Could not load staff: ${error.message}`);
  return (data ?? []) as StaffRow[];
}

export function staffName(staff: StaffRow[], id: string | null | undefined): string | null {
  if (!id) return null;
  const row = staff.find((s) => s.id === id);
  return row ? row.full_name || row.email || row.id : id;
}
