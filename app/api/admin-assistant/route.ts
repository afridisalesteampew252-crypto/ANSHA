import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { requireAssistantAdmin } from '@/lib/admin-assistant/auth';
import {
  getApprovalSecret,
  isAdminAssistantConfigured,
  resolveAdminAssistantModelId,
} from '@/lib/admin-assistant/model';
import { buildAssistantInstructions, loadAssistantKnowledge } from '@/lib/admin-assistant/prompt';
import { consumeAssistantQuota } from '@/lib/admin-assistant/rate-limit';
import { createReadTools } from '@/lib/admin-assistant/read-tools';
import type { AssistantToolContext } from '@/lib/admin-assistant/shared';
import { createWriteTools } from '@/lib/admin-assistant/write-tools';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY_BYTES = 400_000;
const MAX_HISTORY_MESSAGES = 40;
const MAX_STEPS = 8;

function json(status: number, error: string, headers?: Record<string, string>) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Reject cross-site browser posts (cookies are SameSite=Lax, this is defence in depth). */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Keep the most recent messages, starting at a user message. */
function trimHistory(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser > 0 ? recent.slice(firstUser) : recent;
}

/**
 * Admin-only AI assistant (POST). Streams a UI message stream for `useChat`.
 *
 * Security:
 * - 401 without a Supabase session; 403 unless admin_profiles.role = 'admin' and active.
 * - Every tool runs with the caller's cookie session (RLS + existing RPC checks apply);
 *   the service-role key is never used.
 * - Write tools require a signed, per-call user approval (experimental_toolApprovalSecret)
 *   and are audit-logged before and after they run.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json(403, 'Cross-site request rejected.');

  const supabase = await createServerSupabaseClient();
  const auth = await requireAssistantAdmin(supabase);
  if (!auth.ok) return json(auth.status, auth.error);

  if (!isAdminAssistantConfigured()) {
    return json(
      503,
      'The assistant is not configured. Set AI_GATEWAY_API_KEY locally (on Vercel the AI Gateway uses OIDC automatically).'
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, 'Conversation is too long. Start a new chat.');
  let body: { messages?: unknown };
  try {
    body = JSON.parse(raw) as { messages?: unknown };
  } catch {
    return json(400, 'Invalid JSON body.');
  }
  const messages = Array.isArray(body.messages) ? (body.messages as UIMessage[]) : [];
  if (!messages.length || !messages.every((m) => m && typeof m === 'object' && Array.isArray(m.parts))) {
    return json(400, 'messages are required.');
  }

  const quota = await consumeAssistantQuota(supabase, auth.admin.userId);
  if (!quota.allowed) {
    return json(429, quota.message, { 'Retry-After': String(quota.retryAfterSeconds) });
  }

  const approvalSecret = getApprovalSecret();
  const writesDisabledReason = !approvalSecret
    ? 'Changes are disabled because ADMIN_ASSISTANT_APPROVAL_SECRET is not configured on the server.'
    : !quota.durable
      ? 'Changes are disabled until the admin-assistant database migration (audit log + rate limit) is applied.'
      : null;

  const modelId = resolveAdminAssistantModelId();
  const ctx: AssistantToolContext = {
    supabase,
    admin: auth.admin,
    modelId,
    writesDisabledReason,
    writeProposals: { count: 0 },
  };
  const write = createWriteTools(ctx);
  const tools = { ...createReadTools(ctx), ...write.tools };

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(trimHistory(messages));
  } catch {
    return json(400, 'Could not read the conversation. Start a new chat.');
  }

  const knowledge = await loadAssistantKnowledge();
  const result = streamText({
    model: modelId,
    instructions: buildAssistantInstructions({
      knowledge,
      adminName: auth.admin.fullName || auth.admin.email || 'the admin',
      writesDisabledReason,
      now: new Date(),
    }),
    messages: modelMessages,
    tools,
    toolApproval: write.approvals,
    // Binds each approval to its tool name, call id and exact input, so a client cannot
    // forge an approval or swap the arguments after the user approved.
    ...(approvalSecret ? { experimental_toolApprovalSecret: approvalSecret } : {}),
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: 2000,
    abortSignal: req.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/approval/i.test(message) && /signature|invalid/i.test(message)) {
          return 'This approval could not be verified (it may be from an old session). Ask again to get a fresh approval.';
        }
        if (/gateway|api key|authentication|unauthorized|oidc/i.test(message)) {
          return 'The AI service is unavailable or not configured. Try again later.';
        }
        return 'Something went wrong while generating the answer. Please try again.';
      },
    }),
    headers: { 'Cache-Control': 'no-store' },
  });
}
