export const REQUEST_TYPES = [
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'part_request', label: 'Part request' },
  { value: 'bl', label: 'BL' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'other', label: 'Other' },
] as const;

export const STAFF_REQUEST_TYPES = REQUEST_TYPES.filter(
  (item) => item.value !== 'inquiry' && item.value !== 'part_request'
);

export const REQUEST_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]['value'];
export type RequestStatus = (typeof REQUEST_STATUSES)[number]['value'];

export const requestStatusClass: Record<RequestStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  waiting: 'bg-violet-50 text-violet-800 border-violet-200',
  done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

export function requestTypeLabel(value: string | null | undefined) {
  return REQUEST_TYPES.find((item) => item.value === value)?.label || value || 'Request';
}

export function requestStatusLabel(value: string | null | undefined) {
  return REQUEST_STATUSES.find((item) => item.value === value)?.label || value || 'Open';
}

export function requestEventLabel(value: string | null | undefined) {
  switch (value) {
    case 'opened':
      return 'Opened';
    case 'status_change':
      return 'Status';
    case 'assignment':
      return 'Assignment';
    case 'due_date':
      return 'Due date';
    case 'note':
      return 'Note';
    case 'title_change':
      return 'Title';
    case 'attachment':
      return 'Attachment';
    default:
      return value || 'Event';
  }
}

export function isRequestOverdue(dueAt: string | null | undefined, status: string | null | undefined) {
  if (!dueAt || status === 'done' || status === 'cancelled') return false;
  return new Date(dueAt).getTime() < Date.now();
}

export const REQUEST_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export function safeRequestFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

export function requestAttachmentStoragePath(requestId: string, fileName: string) {
  return `requests/${requestId}/${crypto.randomUUID()}-${safeRequestFileName(fileName)}`;
}
