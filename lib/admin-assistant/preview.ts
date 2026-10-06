/**
 * Shape of the approval preview the server attaches to every write-tool approval request
 * (sent as `approval.requestReason` JSON). Shared by the API route and the chat UI, so
 * keep it free of server-only imports.
 */
export type AssistantChangePreview = {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};

export type AssistantActionPreview = {
  kind: 'assistant-action-preview';
  /** Human summary, e.g. "Change FOB price". */
  action: string;
  record: { type: string; id: string | null; label: string; adminUrl?: string | null };
  changes: AssistantChangePreview[];
  warnings?: string[];
};

export function parseActionPreview(reason: string | null | undefined): AssistantActionPreview | null {
  if (!reason) return null;
  try {
    const value = JSON.parse(reason) as Partial<AssistantActionPreview>;
    if (value && value.kind === 'assistant-action-preview' && value.record && Array.isArray(value.changes)) {
      return value as AssistantActionPreview;
    }
  } catch {
    // Not a preview (e.g. a plain-text denial reason).
  }
  return null;
}

/** Tools that change data and therefore always need explicit approval in the UI. */
export const ASSISTANT_WRITE_TOOL_NAMES = [
  'updateListingPrice',
  'setListingPublished',
  'updateListingDetails',
  'createWorkspaceRequest',
  'updateWorkspaceRequest',
  'setInquiryStatus',
] as const;

export type AssistantWriteToolName = (typeof ASSISTANT_WRITE_TOOL_NAMES)[number];
