import type { SupabaseClient } from '@supabase/supabase-js';

export type QuotaResult =
  | { allowed: true; durable: boolean }
  | { allowed: false; retryAfterSeconds: number; message: string };

const SHORT_LIMIT = 20;
const SHORT_WINDOW_MS = 10 * 60 * 1000;

/** Per-instance fallback used only until the DB rate-limit RPC exists. */
const memoryBuckets = new Map<string, number[]>();

function consumeMemoryQuota(userId: string, now: number): QuotaResult {
  const recent = (memoryBuckets.get(userId) ?? []).filter((t) => now - t < SHORT_WINDOW_MS);
  if (recent.length >= SHORT_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + SHORT_WINDOW_MS - now) / 1000));
    memoryBuckets.set(userId, recent);
    return {
      allowed: false,
      retryAfterSeconds,
      message: `Rate limit reached (${SHORT_LIMIT} requests per 10 minutes). Try again in ${retryAfterSeconds}s.`,
    };
  }
  recent.push(now);
  memoryBuckets.set(userId, recent);
  if (memoryBuckets.size > 500) {
    memoryBuckets.forEach((times, key) => {
      if (!times.some((t) => now - t < SHORT_WINDOW_MS)) memoryBuckets.delete(key);
    });
  }
  return { allowed: true, durable: false };
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|does not exist/i.test(error.message ?? '')
  );
}

/**
 * Per-admin rate limit: 20 requests / 10 minutes and 200 / 24 h, enforced in Postgres via
 * `admin_assistant_consume_quota()` (migration 20261006020000). `durable: false` means the
 * migration is not applied yet: an in-memory limiter is used instead and write tools stay
 * disabled because the audit-log RPC from the same migration is missing too.
 */
export async function consumeAssistantQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc('admin_assistant_consume_quota');
  if (error) {
    if (isMissingFunction(error)) return consumeMemoryQuota(userId, Date.now());
    // Fail closed on unexpected errors (e.g. role changed mid-session).
    return { allowed: false, retryAfterSeconds: 30, message: 'Could not check the rate limit. Try again shortly.' };
  }
  const result = (data ?? {}) as { allowed?: boolean; retry_after_seconds?: number; reason?: string };
  if (result.allowed) return { allowed: true, durable: true };
  const retryAfterSeconds = Math.max(1, Number(result.retry_after_seconds) || 60);
  return {
    allowed: false,
    retryAfterSeconds,
    message:
      result.reason === 'daily'
        ? 'Daily assistant limit reached (200 requests per 24 hours).'
        : `Rate limit reached (20 requests per 10 minutes). Try again in ${retryAfterSeconds}s.`,
  };
}
