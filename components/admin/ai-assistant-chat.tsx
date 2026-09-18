'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { Loader2, MessageSquarePlus, Send, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AiChatMessage, AiChatThread } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function messageText(message: UIMessage): string {
  const parts = message.parts ?? [];
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
  }
  return texts.join('\n');
}

function dbMessagesToUi(rows: AiChatMessage[]): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    parts: [{ type: 'text', text: row.content }],
  }));
}

export function AiAssistantChat() {
  const [threads, setThreads] = useState<AiChatThread[]>([]);
  const [threadId, setThreadIdState] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const [input, setInput] = useState('');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const setThreadId = useCallback((id: string | null) => {
    threadIdRef.current = id;
    setThreadIdState(id);
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        body: () => ({ threadId: threadIdRef.current }),
      }),
    []
  );

  const { messages, setMessages, sendMessage, status, error, stop } = useChat({
    transport,
    id: threadId || 'new-ai-chat',
  });

  const busy = status === 'submitted' || status === 'streaming';

  const refreshThreads = useCallback(async (uid: string) => {
    const { data, error: listError } = await supabase
      .from('ai_chat_threads')
      .select('*')
      .eq('created_by', uid)
      .order('updated_at', { ascending: false })
      .limit(30);

    if (listError) {
      setHistoryError(listError.message);
      return;
    }

    setHistoryError(null);
    setThreads((data || []) as AiChatThread[]);
  }, []);

  const loadThread = useCallback(
    async (id: string) => {
      setThreadId(id);
      const { data, error: msgError } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('thread_id', id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (msgError) {
        setHistoryError(msgError.message);
        setMessages([]);
        return;
      }

      setHistoryError(null);
      setMessages(dbMessagesToUi((data || []) as AiChatMessage[]));
    },
    [setMessages]
  );

  const startNewChat = useCallback(async () => {
    if (!userId) return;
    const { data, error: createError } = await supabase
      .from('ai_chat_threads')
      .insert({ title: 'New chat', created_by: userId })
      .select('*')
      .single();

    if (createError || !data) {
      setHistoryError(createError?.message || 'Could not create chat thread.');
      return;
    }

    setThreads((current) => [data as AiChatThread, ...current]);
    setThreadId(data.id);
    setMessages([]);
    setInput('');
  }, [setMessages, userId]);

  const deleteThread = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase.from('ai_chat_threads').delete().eq('id', id);
      if (deleteError) {
        setHistoryError(deleteError.message);
        return;
      }
      setThreads((current) => current.filter((row) => row.id !== id));
      if (threadId === id) {
        setThreadId(null);
        setMessages([]);
      }
    },
    [setMessages, threadId]
  );

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBootstrapping(false);
        return;
      }
      setUserId(user.id);
      await refreshThreads(user.id);
      setBootstrapping(false);
    })();
  }, [refreshThreads]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    let activeThreadId = threadId;
    if (!activeThreadId && userId) {
      const { data, error: createError } = await supabase
        .from('ai_chat_threads')
        .insert({ title: text.slice(0, 80), created_by: userId })
        .select('*')
        .single();
      if (createError || !data) {
        setHistoryError(createError?.message || 'Could not create chat thread.');
        return;
      }
      activeThreadId = data.id;
      setThreadId(data.id);
      setThreads((current) => [data as AiChatThread, ...current]);
    }

    setInput('');
    if (activeThreadId) setThreadId(activeThreadId);
    await sendMessage({ text });
    if (userId) void refreshThreads(userId);
  };

  if (bootstrapping) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="h-[min(70vh,40rem)] overflow-hidden">
        <CardHeader className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">History</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => void startNewChat()}>
              <MessageSquarePlus className="h-4 w-4" />
              New
            </Button>
          </div>
          <CardDescription>Ops-only threads saved under your account.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(min(70vh,40rem)-7.5rem)]">
            <div className="space-y-1 p-2">
              {threads.length === 0 ? (
                <p className="px-2 py-6 text-sm text-muted-foreground">No saved chats yet.</p>
              ) : (
                threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      'group flex items-start gap-1 rounded-lg px-2 py-2 text-sm',
                      threadId === thread.id ? 'bg-accent/10 text-accent' : 'hover:bg-secondary'
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => void loadThread(thread.id)}
                    >
                      <span className="line-clamp-2 font-medium">{thread.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {new Date(thread.updated_at).toLocaleString()}
                      </span>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      aria-label="Delete thread"
                      onClick={() => void deleteThread(thread.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex h-[min(70vh,40rem)] flex-col overflow-hidden">
        <CardHeader className="border-b p-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-accent" />
            Ask ANSHA ops
          </CardTitle>
          <CardDescription>
            Grounded answers about stock, customers, and invoices. Chassis/VIN numbers are never invented.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          {(historyError || error) && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {historyError || error?.message || 'Something went wrong.'}
            </p>
          )}

          <ScrollArea className="min-h-0 flex-1 rounded-md border bg-secondary/20 p-3">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Try questions like:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>How many vehicles are in stock?</li>
                    <li>Find invoices for customer Acme</li>
                    <li>Search parts named turbo</li>
                  </ul>
                </div>
              ) : (
                messages.map((message: UIMessage) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[95%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                      message.role === 'user'
                        ? 'ml-auto bg-accent text-white'
                        : 'bg-card text-foreground shadow-sm'
                    )}
                  >
                    {messageText(message) || (busy && message.role === 'assistant' ? '…' : '')}
                  </div>
                ))
              )}
              {busy ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking with live stock context…
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2 sm:flex-row">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about stock, a customer, or an invoice…"
              className="min-h-[3rem] flex-1 resize-none"
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="flex gap-2 sm:flex-col">
              <Button type="submit" disabled={busy || !input.trim()} className="sm:min-w-[6.5rem]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
              {busy ? (
                <Button type="button" variant="outline" onClick={() => stop()}>
                  Stop
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
