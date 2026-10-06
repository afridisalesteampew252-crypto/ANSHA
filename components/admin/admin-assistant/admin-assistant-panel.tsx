'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useChat, type Chat } from '@ai-sdk/react';
import {
  getToolOrDynamicToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai';
import { AlertTriangle, Check, CircleSlash, Loader2, RotateCcw, Search, Send, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { requestPublicRevalidation } from '@/lib/revalidate-public';
import {
  ASSISTANT_WRITE_TOOL_NAMES,
  parseActionPreview,
  type AssistantActionPreview,
} from '@/lib/admin-assistant/preview';

type AnyToolPart = ToolUIPart | DynamicToolUIPart;

const WRITE_TOOLS = new Set<string>(ASSISTANT_WRITE_TOOL_NAMES);

const SUGGESTIONS = [
  "What's in today's work queue?",
  'Summarize customer dues by currency',
  'Find vehicle price outliers in available stock',
  'Show new website inquiries',
];

const READ_TOOL_LABELS: Record<string, string> = {
  searchVehicles: 'Searching vehicles',
  searchParts: 'Searching parts',
  searchCustomers: 'Searching customers',
  searchInquiries: 'Checking inquiries',
  searchPartRequests: 'Checking part requests',
  searchWorkspaceRequests: 'Checking workspace requests',
  listStaff: 'Looking up staff',
  searchInvoices: 'Searching invoices',
  summarizeDues: 'Summarizing dues',
  todaysWorkQueue: "Building today's work queue",
  checkPriceOutliers: 'Checking prices against peers',
};

/** Turns the transport error (often the JSON body of a 4xx/5xx) into a readable sentence. */
function friendlyError(error: Error | undefined): string | null {
  if (!error) return null;
  const raw = error.message || 'Request failed.';
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON
  }
  if (/failed to fetch|network/i.test(raw)) return 'Network error. Check your connection and try again.';
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

/** Safe tiny formatter: **bold**, `code`, [label](/internal) and bare /admin/... paths become links. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((\/(?![/\\])[^)\s\\]*)\)|(?<![\w/])\/(?:admin|vehicles|parts|offers)\/[A-Za-z0-9/_\-.#?=&]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={key} className="rounded bg-muted px-1 text-[0.85em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith('[')) {
      const label = token.slice(1, token.indexOf(']'));
      out.push(<Link key={key} href={match[2]} className="text-primary underline underline-offset-2">{label}</Link>);
    } else {
      const href = token.replace(/[.,;:]+$/, '');
      out.push(<Link key={key} href={href} className="text-primary underline underline-offset-2">{href}</Link>);
      if (href.length < token.length) out.push(token.slice(href.length));
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MessageText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, index) => {
        const heading = /^#{1,4}\s+(.*)$/.exec(line);
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        if (!line.trim()) return <div key={index} className="h-1" />;
        if (heading) return <p key={index} className="pt-1 font-semibold">{renderInline(heading[1], `h${index}`)}</p>;
        if (bullet) {
          return (
            <p key={index} className="flex gap-2 pl-1">
              <span aria-hidden>•</span>
              <span className="min-w-0 break-words">{renderInline(bullet[1], `b${index}`)}</span>
            </p>
          );
        }
        return <p key={index} className="break-words">{renderInline(line, `l${index}`)}</p>;
      })}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function PreviewTable({ preview }: { preview: AssistantActionPreview }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {preview.record.type}:{' '}
        {preview.record.adminUrl ? (
          <Link href={preview.record.adminUrl} className="font-medium text-foreground underline underline-offset-2">
            {preview.record.label}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{preview.record.label}</span>
        )}
      </div>
      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="w-1/4 pb-1 font-medium">Field</th>
            <th className="pb-1 font-medium">Before</th>
            <th className="pb-1 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {preview.changes.map((c, index) => (
            <tr key={index} className="border-t align-top">
              <td className="py-1 pr-2 font-medium break-words">{c.field}</td>
              <td className="py-1 pr-2 break-words text-muted-foreground line-through decoration-muted-foreground/40">{formatValue(c.before)}</td>
              <td className="py-1 break-words font-medium">{formatValue(c.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.warnings?.length ? (
        <ul className="space-y-1">
          {preview.warnings.map((w, index) => (
            <li key={index} className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ActionCard({
  part,
  busy,
  onRespond,
}: {
  part: AnyToolPart;
  busy: boolean;
  onRespond: (approvalId: string, approved: boolean) => void;
}) {
  const preview = parseActionPreview(part.approval?.requestReason);
  const title = preview?.action ?? getToolOrDynamicToolName(part);
  let status: ReactNode = null;
  let tone = 'border-border';
  let actions: ReactNode = null;

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      status = <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Preparing preview…</span>;
      break;
    case 'approval-requested':
      if (part.approval.isAutomatic) {
        status = <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking…</span>;
        break;
      }
      tone = 'border-primary/60 bg-primary/5';
      status = <span className="font-medium text-primary">Waiting for your approval</span>;
      actions = (
        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={busy} onClick={() => onRespond(part.approval.id, true)} className="gap-1">
            <Check className="h-4 w-4" />Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onRespond(part.approval.id, false)} className="gap-1">
            <X className="h-4 w-4" />Deny
          </Button>
        </div>
      );
      break;
    case 'approval-responded':
      status = part.approval.approved ? (
        <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Approved — applying…</span>
      ) : (
        <span className="flex items-center gap-1.5 text-muted-foreground"><CircleSlash className="h-3.5 w-3.5" />Denied</span>
      );
      break;
    case 'output-available': {
      tone = 'border-emerald-500/50 bg-emerald-500/5';
      const output = part.output as { message?: string } | undefined;
      status = (
        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />Done{output?.message ? ` — ${output.message}` : ''}
        </span>
      );
      break;
    }
    case 'output-error':
      tone = 'border-destructive/50 bg-destructive/5';
      status = <span className="flex items-start gap-1.5 text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{part.errorText}</span>;
      break;
    case 'output-denied':
      status = (
        <span className="flex items-start gap-1.5 text-muted-foreground">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {part.approval.isAutomatic ? `Not allowed: ${part.approval.reason ?? 'blocked by policy.'}` : 'You denied this change. Nothing was saved.'}
        </span>
      );
      break;
  }

  return (
    <div className={cn('space-y-2 rounded-lg border p-3', tone)}>
      <div className="text-sm font-semibold">{title}</div>
      {preview ? <PreviewTable preview={preview} /> : null}
      <div className="text-xs">{status}</div>
      {actions}
    </div>
  );
}

function ReadToolStatus({ part }: { part: AnyToolPart }) {
  const name = getToolOrDynamicToolName(part);
  const label = READ_TOOL_LABELS[name] ?? name;
  const running = part.state === 'input-streaming' || part.state === 'input-available';
  if (part.state === 'output-error') {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{label} failed: {part.errorText}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
      {label}
      {running ? '…' : ''}
    </div>
  );
}

function hasPendingApproval(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  return last.parts.some((p) => isToolUIPart(p) && p.state === 'approval-requested' && !p.approval.isAutomatic);
}

export function AdminAssistantPanel({ chat }: { chat: Chat<UIMessage> }) {
  const { messages, sendMessage, addToolApprovalResponse, status, error, stop, setMessages, clearError } = useChat({ chat });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const pending = hasPendingApproval(messages);
  const errorText = friendlyError(error);

  // Belt and braces: if the server could not revalidate public pages after an approved
  // listing change, ask /api/revalidate (the #105 helper) from the browser once per call.
  const revalidatedCallsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== 'output-available') continue;
        if (revalidatedCallsRef.current.has(part.toolCallId)) continue;
        const output = part.output as
          | { revalidatedPaths?: string[]; revalidate?: { kind: 'vehicle' | 'part' | 'offer'; slugs: string[] } | null }
          | undefined;
        if (!output?.revalidate) continue;
        revalidatedCallsRef.current.add(part.toolCallId);
        if (!output.revalidatedPaths?.length) requestPublicRevalidation(output.revalidate.kind, output.revalidate.slugs);
      }
    }
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy || pending) return;
    if (error) clearError();
    void sendMessage({ text: value.slice(0, 4000) });
    setInput('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask about stock, prices, customers, inquiries, requests or dues. I can also prepare changes (prices,
              publishing, listing text, request assignment, inquiry status) — you approve each one.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left text-xs" onClick={() => submit(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[92%] space-y-2 rounded-xl px-3 py-2',
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
              )}
            >
              {message.parts.map((part, index) => {
                const key = `${message.id}-${index}`;
                if (part.type === 'text') {
                  return message.role === 'user' ? (
                    <p key={key} className="whitespace-pre-wrap break-words text-sm">{part.text}</p>
                  ) : (
                    <MessageText key={key} text={part.text} />
                  );
                }
                if (isToolUIPart(part)) {
                  return WRITE_TOOLS.has(getToolOrDynamicToolName(part)) ? (
                    <ActionCard
                      key={key}
                      part={part}
                      busy={busy}
                      onRespond={(id, approved) => void addToolApprovalResponse({ id, approved })}
                    />
                  ) : (
                    <ReadToolStatus key={key} part={part} />
                  );
                }
                return <Fragment key={key} />;
              })}
            </div>
          </div>
        ))}

        {status === 'submitted' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking…
          </div>
        ) : null}

        {errorText ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{errorText}</span>
          </div>
        ) : null}
      </div>

      <form
        className="space-y-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        {pending ? (
          <p className="text-xs text-primary">Approve or deny the pending change above to continue.</p>
        ) : null}
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(input);
            }
          }}
          placeholder={pending ? 'Waiting for your approval…' : 'Ask the assistant… (Enter to send, Shift+Enter for a new line)'}
          rows={2}
          maxLength={4000}
          disabled={pending}
          className="min-h-[3.25rem] resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            disabled={busy || messages.length === 0}
            onClick={() => {
              clearError();
              setMessages([]);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />New chat
          </Button>
          {busy ? (
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => void stop()}>
              <Square className="h-3.5 w-3.5" />Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" className="gap-1" disabled={!input.trim() || pending}>
              <Send className="h-3.5 w-3.5" />Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
