import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, tool, toUIMessageStream, type UIMessageChunk } from 'ai';
import { z } from 'zod';
import { OPS_AI_SYSTEM_PROMPT, isAiConfigured, resolveOpsAiModel } from '@/lib/ai/config';
import { extractLatestUserText, fetchAiOpsGrounding, formatGroundingForPrompt, requireOpsUser, type AiOpsGrounding } from '@/lib/ai/ops-context';
import { AI_CHAT_LIMITS, AiChatRequestError, consumeOpsChatQuota, persistOpsChatMessage, readAiChatRequest } from '@/lib/ai/chat-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(status: number, error: string, headers?: Record<string, string>) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function boundedGrounding(grounding: AiOpsGrounding): string {
  const text = formatGroundingForPrompt(grounding);
  if (new TextEncoder().encode(text).byteLength > AI_CHAT_LIMITS.groundingBytes) {
    throw new AiChatRequestError('Too many matching records. Try a more specific question.', 413);
  }
  return text;
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(req.url).origin) return json(403, 'Cross-site request rejected.');
    } catch { return json(403, 'Cross-site request rejected.'); }
  }
  const supabase = await createServerSupabaseClient();
  const auth = await requireOpsUser(supabase);
  if (!auth.ok) return json(auth.status, auth.error);
  if (!isAiConfigured()) return json(503, 'AI is not configured. Contact an administrator.');

  try {
    const { messages, threadId } = await readAiChatRequest(req);
    if (threadId) {
      const { data: thread, error } = await supabase.from('ai_chat_threads').select('id,created_by').eq('id', threadId).abortSignal(req.signal).maybeSingle();
      if (error) return json(503, 'Your conversation could not be checked. Please retry.');
      if (!thread || thread.created_by !== auth.user.id) return json(404, 'Thread not found.');
    }
    const modelMessages = await convertToModelMessages(messages);
    const quota = await consumeOpsChatQuota(supabase);
    if (!quota.allowed) return json(quota.status, quota.message, { 'Retry-After': String(quota.retryAfterSeconds) });
    const latestUserText = extractLatestUserText(messages);
    const grounding = boundedGrounding(await fetchAiOpsGrounding(supabase, latestUserText));
    if (threadId) await persistOpsChatMessage(supabase, threadId, 'user', latestUserText);

    return createUIMessageStreamResponse({
      headers: { 'Cache-Control': 'no-store' },
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          const result = streamText({
            model: resolveOpsAiModel(),
            instructions: `${OPS_AI_SYSTEM_PROMPT}\n\nCurrent ops grounding JSON (authoritative; do not invent missing fields):\n${grounding}`,
            messages: modelMessages,
            stopWhen: stepCountIs(3), maxOutputTokens: 1200, maxRetries: 0, abortSignal: req.signal,
            tools: {
              searchOpsCatalog: tool({
                description: 'Search ANSHA vehicles, parts, customers, and invoices by a short keyword.',
                inputSchema: z.object({ query: z.string().min(1).max(120) }),
                execute: async ({ query }: { query: string }) => JSON.parse(boundedGrounding(await fetchAiOpsGrounding(supabase, query))) as AiOpsGrounding,
              }),
            },
          });
          let finish: UIMessageChunk | undefined;
          let failed = false;
          const reader = toUIMessageStream({ stream: result.stream, onError: () => 'The answer could not be generated. Please retry.' }).getReader();
          try { while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) break;
            if (chunk.type === 'finish') finish = chunk;
            else {
              if (chunk.type === 'error' || chunk.type === 'abort') failed = true;
              writer.write(chunk);
            }
          } } finally { reader.releaseLock(); }
          if (!failed && !req.signal.aborted && threadId) {
            const text = await result.text;
            if (text.trim()) await persistOpsChatMessage(supabase, threadId, 'assistant', text.trim().slice(0, 50000));
          }
          if (finish) writer.write(finish);
        },
        onError: (error) => error instanceof AiChatRequestError ? error.message : 'The answer could not be completed. Please retry.',
      }),
    });
  } catch (error) {
    return json(error instanceof AiChatRequestError ? error.status : 503,
      error instanceof AiChatRequestError ? error.message : 'AI chat is temporarily unavailable. Please retry.');
  }
}
