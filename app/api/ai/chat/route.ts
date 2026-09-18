import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { OPS_AI_SYSTEM_PROMPT, isAiConfigured, resolveOpsAiModel } from '@/lib/ai/config';
import {
  extractLatestUserText,
  fetchAiOpsGrounding,
  formatGroundingForPrompt,
  requireOpsUser,
} from '@/lib/ai/ops-context';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAiConfigured()) {
    return Response.json(
      {
        error:
          'AI is not configured. Set AI_GATEWAY_API_KEY or OPENAI_API_KEY in the server environment.',
      },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const auth = await requireOpsUser(supabase);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: { messages?: UIMessage[]; threadId?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    return Response.json({ error: 'messages are required.' }, { status: 400 });
  }

  const threadId = typeof body.threadId === 'string' && body.threadId ? body.threadId : null;
  const latestUserText = extractLatestUserText(messages);

  if (threadId && latestUserText) {
    const { data: thread } = await supabase
      .from('ai_chat_threads')
      .select('id, title, created_by')
      .eq('id', threadId)
      .maybeSingle();

    if (!thread || thread.created_by !== auth.user.id) {
      return Response.json({ error: 'Thread not found.' }, { status: 404 });
    }

    await supabase.from('ai_chat_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: latestUserText.slice(0, 50000),
      created_by: auth.user.id,
    });

    if (thread.title === 'New chat') {
      const nextTitle = latestUserText.slice(0, 80).trim() || 'New chat';
      await supabase.from('ai_chat_threads').update({ title: nextTitle }).eq('id', threadId);
    }
  }

  let grounding;
  try {
    grounding = await fetchAiOpsGrounding(supabase, latestUserText);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Grounding failed.' },
      { status: 500 }
    );
  }

  const result = streamText({
    model: resolveOpsAiModel(),
    instructions: `${OPS_AI_SYSTEM_PROMPT}

Current ops grounding JSON (authoritative; do not invent missing fields):
${formatGroundingForPrompt(grounding)}`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(3),
    maxOutputTokens: 1200,
    tools: {
      searchOpsCatalog: tool({
        description:
          'Search ANSHA vehicles, parts, customers, and invoices by a short keyword when the initial grounding is insufficient.',
        inputSchema: z.object({
          query: z.string().min(1).max(120),
        }),
        execute: async ({ query }: { query: string }) => fetchAiOpsGrounding(supabase, query),
      }),
    },
    onFinish: async ({ text }: { text: string }) => {
      if (!threadId || !text?.trim()) return;
      await supabase.from('ai_chat_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: text.trim().slice(0, 50000),
        created_by: auth.user.id,
      });
      await supabase
        .from('ai_chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', threadId);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
