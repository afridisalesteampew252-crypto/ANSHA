'use client';

import { AiAssistantChat } from '@/components/admin/ai-assistant-chat';

export default function AdminAiAssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ops chat for stock, customers, and invoices. Answers are grounded in live database context;
          chassis numbers and VINs are never invented.
        </p>
      </div>
      <AiAssistantChat />
    </div>
  );
}
