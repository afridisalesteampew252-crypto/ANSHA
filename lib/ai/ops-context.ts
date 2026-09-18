import type { SupabaseClient } from '@supabase/supabase-js';

export type AiOpsGrounding = {
  counts?: {
    parts?: number;
    vehicles?: number;
    customers?: number;
    invoices_open?: number;
    invoices_total?: number;
  };
  recent_vehicles?: Array<Record<string, unknown>>;
  matched_vehicles?: Array<Record<string, unknown>>;
  matched_parts?: Array<Record<string, unknown>>;
  matched_customers?: Array<Record<string, unknown>>;
  matched_invoices?: Array<Record<string, unknown>>;
};

export async function requireOpsUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401 as const, error: 'Sign in required.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('id, role, is_active, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) {
    return { ok: false as const, status: 403 as const, error: 'Staff access required.' };
  }

  if (profile.role !== 'admin' && profile.role !== 'staff') {
    return { ok: false as const, status: 403 as const, error: 'Ops access required.' };
  }

  return { ok: true as const, user, profile };
}

export async function fetchAiOpsGrounding(
  supabase: SupabaseClient,
  query?: string | null
): Promise<AiOpsGrounding> {
  const { data, error } = await supabase.rpc('get_ai_ops_grounding', {
    p_query: query?.trim() || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to load AI grounding context.');
  }

  return (data || {}) as AiOpsGrounding;
}

export function formatGroundingForPrompt(grounding: AiOpsGrounding): string {
  return JSON.stringify(grounding, null, 0);
}

export function extractLatestUserText(
  messages: Array<{ role?: string; parts?: Array<{ type?: string; text?: string }>; content?: unknown }>
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;

    if (Array.isArray(message.parts)) {
      const text = message.parts
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim();
      if (text) return text;
    }

    if (typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim();
    }
  }

  return '';
}
