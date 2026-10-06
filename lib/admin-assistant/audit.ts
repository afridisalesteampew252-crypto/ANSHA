import type { SupabaseClient } from '@supabase/supabase-js';

export type AssistantAuditPhase = 'approved' | 'executed' | 'failed';

export type AssistantAuditEntry = {
  tool: string;
  phase: AssistantAuditPhase;
  entityType: string;
  entityId: string | null;
  toolCallId: string;
  args: unknown;
  before?: unknown;
  after?: unknown;
  error?: string;
  model?: string;
};

/**
 * Append one row to public.audit_logs (action `ai_assistant.<tool>`) through the
 * admin-only RPC `log_admin_assistant_action` (migration 20261006020000), using the
 * signed-in admin's session. Returns an error message instead of throwing.
 */
export async function logAssistantAction(
  supabase: SupabaseClient,
  entry: AssistantAuditEntry
): Promise<{ ok: true } | { ok: false; error: string }> {
  const details: Record<string, unknown> = {
    tool_call_id: entry.toolCallId,
    args: entry.args ?? null,
  };
  if (entry.before !== undefined) details.before = entry.before;
  if (entry.after !== undefined) details.after = entry.after;
  if (entry.error) details.error = entry.error.slice(0, 500);
  if (entry.model) details.model = entry.model;

  const { error } = await supabase.rpc('log_admin_assistant_action', {
    p_tool: entry.tool,
    p_phase: entry.phase,
    p_entity_type: entry.entityType,
    p_entity_id: entry.entityId,
    p_details: details,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
