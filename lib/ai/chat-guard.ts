import { safeValidateUIMessages, type UIMessage } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

export const AI_CHAT_LIMITS = {
  bodyBytes: 128 * 1024,
  messages: 40,
  partsPerMessage: 32,
  messageCharacters: 12000,
  textBytes: 48 * 1024,
  groundingBytes: 48 * 1024,
} as const;

export class AiChatRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'AiChatRequestError';
  }
}

const tooLarge = () => new AiChatRequestError('This conversation is too long. Start a new chat or shorten your message.', 413);
const encoder = new TextEncoder();

/** Bound the actual stream, including requests without a Content-Length header. */
export async function readAiChatRequest(req: Request): Promise<{ messages: UIMessage[]; threadId: string | null }> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > AI_CHAT_LIMITS.bodyBytes) throw tooLarge();
  if (!req.body) throw new AiChatRequestError('messages are required.', 400);
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > AI_CHAT_LIMITS.bodyBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof AiChatRequestError) throw error;
    throw new AiChatRequestError('Could not read the request body.', 400);
  } finally {
    reader.releaseLock();
  }

  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AiChatRequestError('Invalid JSON body.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AiChatRequestError('Invalid chat request.', 400);
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.messages) || !input.messages.length) throw new AiChatRequestError('messages are required.', 400);
  if (input.messages.length > AI_CHAT_LIMITS.messages) throw tooLarge();
  const threadId = input.threadId == null ? null : input.threadId;
  if (threadId !== null && (typeof threadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId))) {
    throw new AiChatRequestError('Invalid thread ID.', 400);
  }

  // Only text is sent back to the model. Prior tool output, reasoning, metadata
  // and URLs come from an untrusted client and are not authoritative grounding.
  const history: UIMessage[] = [];
  let totalTextBytes = 0;
  for (const entry of input.messages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new AiChatRequestError('Invalid chat message.', 400);
    const message = entry as Record<string, unknown>;
    if (typeof message.id !== 'string' || !message.id || message.id.length > 128 ||
        !['user', 'assistant'].includes(String(message.role)) || !Array.isArray(message.parts) || !message.parts.length) {
      throw new AiChatRequestError('Invalid chat message.', 400);
    }
    if (message.parts.length > AI_CHAT_LIMITS.partsPerMessage) throw tooLarge();
    const texts: string[] = [];
    for (const part of message.parts) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) throw new AiChatRequestError('Invalid message part.', 400);
      if (part.type === 'text') {
        if (typeof part.text !== 'string') throw new AiChatRequestError('Invalid message text.', 400);
        texts.push(part.text);
      } else if (message.role !== 'assistant' || !['step-start', 'reasoning', 'tool-searchOpsCatalog'].includes(part.type)) {
        throw new AiChatRequestError('Only text messages are supported.', 400);
      }
    }
    const content = texts.join('\n');
    if (content.length > AI_CHAT_LIMITS.messageCharacters) throw tooLarge();
    totalTextBytes += encoder.encode(content).byteLength;
    if (totalTextBytes > AI_CHAT_LIMITS.textBytes) throw tooLarge();
    if (!content.trim()) {
      if (message.role === 'user') throw new AiChatRequestError('Enter a message.', 400);
      continue;
    }
    history.push({ id: message.id, role: message.role as 'user' | 'assistant', parts: [{ type: 'text', text: content }] });
  }
  if (input.messages.at(-1)?.role !== 'user' || history.at(-1)?.role !== 'user') {
    throw new AiChatRequestError('The last message must be a user question.', 400);
  }
  const validated = await safeValidateUIMessages({ messages: history });
  if (!validated.success) throw new AiChatRequestError('Invalid chat messages.', 400);
  return { messages: validated.data, threadId: threadId as string | null };
}

/** No instance-local fallback: a missing migration or failed check must stop spend. */
export async function consumeOpsChatQuota(supabase: SupabaseClient): Promise<
  { allowed: true } | { allowed: false; status: 429 | 503; retryAfterSeconds: number; message: string }
> {
  const unavailable = { allowed: false as const, status: 503 as const, retryAfterSeconds: 30, message: 'AI usage checks are temporarily unavailable. Try again shortly.' };
  try {
    const { data, error } = await supabase.rpc('ops_ai_chat_consume_quota');
    if (error || !data || typeof data.allowed !== 'boolean') return unavailable;
    if (data.allowed === true) return { allowed: true };
    if (!['short', 'daily'].includes(data.reason) || !Number.isFinite(data.retry_after_seconds) || data.retry_after_seconds < 1) return unavailable;
    return {
      allowed: false, status: 429,
      retryAfterSeconds: Math.min(86400, Math.ceil(data.retry_after_seconds)),
      message: data.reason === 'daily' ? 'Daily AI chat limit reached (200 requests per 24 hours).' : 'AI chat limit reached (20 requests per 10 minutes). Please wait before trying again.',
    };
  } catch { return unavailable; }
}

/** Insert the message and update its owned thread in one database transaction. */
export async function persistOpsChatMessage(supabase: SupabaseClient, threadId: string, role: 'user' | 'assistant', content: string) {
  const { error } = await supabase.rpc('ops_ai_chat_append_message', {
    p_thread_id: threadId, p_role: role, p_content: content,
  });
  if (error) throw new AiChatRequestError(role === 'assistant'
    ? 'The answer could not be saved. Copy it before leaving this page.'
    : 'Your message could not be saved. Please try again.', 503);
}
