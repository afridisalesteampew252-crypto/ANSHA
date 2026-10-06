import type { ExpenseAttachment, ExpenseStatus } from '@/lib/types';

/** Private bucket shared with chat / mail / requests / vehicle files. */
export const EXPENSE_ATTACHMENT_BUCKET = 'internal-files';

/** Keep in sync with supabase/migrations/20261006040000_expense_attachments.sql. */
export const EXPENSE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const EXPENSE_ATTACHMENT_MAX_PER_EXPENSE = 25;

export const EXPENSE_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ExpenseAttachmentMimeType = (typeof EXPENSE_ATTACHMENT_MIME_TYPES)[number];

/** Value for <input type="file" accept>. */
export const EXPENSE_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

const EXTENSION_MIME: Record<string, ExpenseAttachmentMimeType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Resolve a supported MIME type from the browser-reported type or the extension. */
export function expenseAttachmentMimeType(file: Pick<File, 'name' | 'type'>): ExpenseAttachmentMimeType | null {
  const reported = (file.type || '').toLowerCase();
  if ((EXPENSE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(reported)) {
    return reported as ExpenseAttachmentMimeType;
  }
  if (reported === 'image/jpg' || reported === 'image/pjpeg') return 'image/jpeg';
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_MIME[extension] || null;
}

/** Returns an error message, or null when the file can be attached. */
export function validateExpenseAttachment(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!expenseAttachmentMimeType(file)) return `${file.name}: only PDF, JPG, PNG or WEBP files can be attached.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > EXPENSE_ATTACHMENT_MAX_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}

export function safeExpenseFileName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-120) || 'attachment'
  );
}

/** expenses/<expenseId>/<uuid>-<safe-name> — must match the RPC/storage policy prefix. */
export function expenseAttachmentStoragePath(expenseId: string, fileName: string) {
  return `expenses/${expenseId}/${crypto.randomUUID()}-${safeExpenseFileName(fileName)}`;
}

/** Cancelled expenses are read-only (enforced again in the RPCs). */
export function canEditExpenseAttachments(status: ExpenseStatus) {
  return status !== 'cancelled';
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function groupAttachmentsByExpense(rows: ExpenseAttachment[]) {
  const map = new Map<string, ExpenseAttachment[]>();
  for (const row of rows) {
    const list = map.get(row.expense_id);
    if (list) list.push(row);
    else map.set(row.expense_id, [row]);
  }
  return map;
}
