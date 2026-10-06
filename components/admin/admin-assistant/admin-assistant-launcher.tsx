'use client';

import { useState } from 'react';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdminAssistantPanel } from './admin-assistant-panel';

/**
 * Header button + right-hand drawer for the admin AI assistant.
 * The admin layout only renders (and only downloads) this for active admin-role users;
 * the API route enforces the same rule server-side (403 for everyone else).
 */
export function AdminAssistantLauncher() {
  const [open, setOpen] = useState(false);
  // One chat instance for the whole admin session so the conversation survives closing the
  // drawer and navigating between admin pages. After the user answers every pending approval,
  // the chat automatically sends the approvals back so approved actions run.
  const [chat] = useState(
    () =>
      new Chat<UIMessage>({
        id: 'admin-assistant',
        transport: new DefaultChatTransport({ api: '/api/admin-assistant' }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      })
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        aria-label="Open admin assistant"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden xl:inline">Assistant</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Admin assistant
            </SheetTitle>
            <SheetDescription className="text-xs">
              Looks things up instantly. Every change needs your approval and is recorded in the audit log.
            </SheetDescription>
          </SheetHeader>
          <AdminAssistantPanel chat={chat} />
        </SheetContent>
      </Sheet>
    </>
  );
}
