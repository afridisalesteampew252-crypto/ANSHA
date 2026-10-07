import { validateInquiryContact } from '@/lib/inquiry-referral';

export const leadStages = ['new', 'assigned', 'contacted', 'quoted', 'won', 'lost', 'archived'] as const;
export type LeadStage = typeof leadStages[number];
export type SalesInquirySource = 'website' | 'mobile' | 'portal' | 'whatsapp' | 'phone' | 'manual';
export type AgentVerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export const leadStageLabels: Record<LeadStage, string> = {
  new: 'New', assigned: 'Assigned', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost', archived: 'Archived',
};
export const sourceLabels: Record<SalesInquirySource, string> = {
  website: 'Website', mobile: 'Mobile', portal: 'Customer portal', whatsapp: 'WhatsApp', phone: 'Phone', manual: 'Manual',
};
export type AgentVerificationSummary = {
  agent_id: string; full_name: string | null; email: string | null; phone: string | null;
  role: string; is_active: boolean; verification_status: AgentVerificationStatus;
  referral_code: string | null; reviewed_at: string | null; review_note: string | null;
};
export type DuplicateCustomer = { id: string; full_name: string; phone: string | null; email: string | null };
export type SalesInquiry = {
  id: string; inquiry_number: string; inquiry_source: SalesInquirySource; lead_stage: LeadStage;
  introduced_by: string | null; introduced_by_name: string | null; assigned_to: string | null; assignee_name: string | null;
  created_by: string | null; request_id: string | null; due_at: string | null; customer_id: string | null;
  customer_profile_id?: string | null;
  stock_name: string | null; stock_slug: string | null; part_id: string | null; vehicle_id: string | null;
  customer_name: string; customer_email: string | null; customer_phone: string | null;
  message: string; status: 'new' | 'read' | 'responded' | 'closed'; created_at: string; updated_at: string;
  duplicate_candidates?: DuplicateCustomer[]; can_edit?: boolean;
};
export type SalesInquiryEvent = {
  id: string; event_type: string; notes: string | null; created_at: string; actor_name: string | null;
};
export type SalesInquirySummary = Record<LeadStage | 'unassigned' | 'overdue' | 'total', number>;
export const emptyInquirySummary: SalesInquirySummary = { new: 0, assigned: 0, contacted: 0, quoted: 0, won: 0, lost: 0, archived: 0, unassigned: 0, overdue: 0, total: 0 };
export type InquiryActor = { role: string; userId: string; verificationStatus?: AgentVerificationStatus | null };
export type InquiryDraft = { stage: LeadStage; assigneeId: string; dueLocal: string; note: string; customerId: string };

export function isInquiryFieldAgent(role: string) { return role === 'sales' || role === 'freelancer'; }

export function canEditSalesInquiry(role: string, userId: string, verificationStatus: AgentVerificationStatus | null | undefined, inquiry: SalesInquiry) {
  if (!userId) return false;
  if (inquiry.can_edit === false) return false;
  if (role === 'admin' || role === 'staff') return true;
  return isInquiryFieldAgent(role) && verificationStatus === 'verified' && inquiry.assigned_to === userId;
}

export function verifiedAssignees(agents: AgentVerificationSummary[]) {
  return agents.filter((agent) => agent.is_active && isInquiryFieldAgent(agent.role) && agent.verification_status === 'verified');
}

export function isInquiryOverdue(inquiry: Pick<SalesInquiry, 'due_at' | 'lead_stage'>, now = Date.now()) {
  return !['won', 'lost', 'archived'].includes(inquiry.lead_stage) && Boolean(inquiry.due_at && new Date(inquiry.due_at).getTime() < now);
}

export function matchesInquiryFilters(inquiry: SalesInquiry, filters: { source?: string; assignee?: string; introducer?: string; overdue?: boolean }, now = Date.now()) {
  if (filters.source && filters.source !== 'all' && inquiry.inquiry_source !== filters.source) return false;
  if (filters.assignee === 'unassigned' && inquiry.assigned_to) return false;
  if (filters.assignee && !['all', 'unassigned'].includes(filters.assignee) && inquiry.assigned_to !== filters.assignee) return false;
  if (filters.introducer === 'direct' && inquiry.introduced_by) return false;
  if (filters.introducer && !['all', 'direct'].includes(filters.introducer) && inquiry.introduced_by !== filters.introducer) return false;
  return !filters.overdue || isInquiryOverdue(inquiry, now);
}

export function dateToLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Build only actions this actor can request. The database independently enforces these limits. */
export function inquiryUpdatePayload(inquiry: SalesInquiry, draft: InquiryDraft, actor: InquiryActor) {
  if (!canEditSalesInquiry(actor.role, actor.userId, actor.verificationStatus, inquiry)) throw new Error('This inquiry is read-only until an administrator assigns it to you.');
  if (!leadStages.includes(draft.stage)) throw new Error('Choose a valid sales stage.');
  if (draft.stage === 'archived' && inquiry.lead_stage !== 'archived') throw new Error('Choose an active sales stage. Archived is reserved for historical closed inquiries.');
  const dueChanged = draft.dueLocal !== dateToLocalInput(inquiry.due_at);
  const due = draft.dueLocal ? new Date(draft.dueLocal) : null;
  if (dueChanged && due && Number.isNaN(due.getTime())) throw new Error('Choose a valid follow-up date.');
  const admin = actor.role === 'admin';
  return {
    p_inquiry_id: inquiry.id,
    p_stage: draft.stage !== inquiry.lead_stage ? draft.stage : null,
    p_assigned_to: admin && draft.assigneeId ? draft.assigneeId : null,
    p_set_assignee: admin && draft.assigneeId !== (inquiry.assigned_to || ''),
    p_due_at: dueChanged && due ? due.toISOString() : null,
    p_set_due: dueChanged,
    p_note: draft.note.trim() || null,
    p_customer_id: admin && draft.customerId ? draft.customerId : null,
    p_set_customer: admin && draft.customerId !== (inquiry.customer_id || ''),
  };
}

export function salesInquiryStockHref(inquiry: Pick<SalesInquiry, 'part_id' | 'vehicle_id' | 'stock_slug'>, audience: 'public' | 'admin' = 'admin') {
  if (audience === 'public') {
    if (!inquiry.stock_slug) return null;
    if (inquiry.part_id) return `/parts/${encodeURIComponent(inquiry.stock_slug)}`;
    if (inquiry.vehicle_id) return `/vehicles/${encodeURIComponent(inquiry.stock_slug)}`;
    return null;
  }
  if (inquiry.part_id) return `/admin/parts/${encodeURIComponent(inquiry.part_id)}`;
  if (inquiry.vehicle_id) return `/admin/vehicles/${encodeURIComponent(inquiry.vehicle_id)}`;
  return null;
}

export function validateManualInquiry(input: { name: string; email: string; phone: string; message: string }) {
  if (!input.name.trim() || input.name.trim().length > 120) return 'Enter the customer name (up to 120 characters).';
  const contactError = validateInquiryContact(input.email, input.phone);
  if (contactError) return contactError;
  if (!input.message.trim() || input.message.trim().length > 5000) return 'Enter inquiry details (up to 5000 characters).';
  return null;
}

export type InquiryDeepLinkClient = {
  from(table: 'inquiries'): {
    select(columns: 'inquiry_number'): {
      eq(column: 'id', id: string): {
        maybeSingle(): PromiseLike<{ data: { inquiry_number?: string } | null; error: unknown }>;
      };
    };
  };
  rpc(name: 'get_sales_inquiries', params: { p_stage: null; p_scope: 'all'; p_search: string; p_limit: number }): PromiseLike<{
    data: { items?: SalesInquiry[] } | null; error: unknown;
  }>;
};

/** Resolve an older detail link through recipient RLS, then the role-scoped inbox RPC. */
export async function loadSalesInquiryDeepLink(client: InquiryDeepLinkClient, id: string, isCurrent: () => boolean = () => true): Promise<SalesInquiry | null> {
  const unavailable = 'This inquiry is unavailable or outside your current access.';
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new Error(unavailable);
  if (!isCurrent()) return null;
  const lookup = await client.from('inquiries').select('inquiry_number').eq('id', id).maybeSingle();
  if (!isCurrent()) return null;
  const reference = lookup.data?.inquiry_number;
  if (lookup.error || !reference || !/^[a-z0-9_-]{1,80}$/i.test(reference)) throw new Error(unavailable);
  const response = await client.rpc('get_sales_inquiries', { p_stage: null, p_scope: 'all', p_search: reference, p_limit: 300 });
  if (!isCurrent()) return null;
  const rows = response.data?.items;
  if (response.error || !Array.isArray(rows)) throw new Error(unavailable);
  const inquiry = rows.find((item) => item.id === id);
  if (!inquiry) throw new Error(unavailable);
  return inquiry;
}
