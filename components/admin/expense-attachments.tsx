'use client';

import { useRef, useState } from 'react';
import { Download, ExternalLink, FileImage, FileText, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import {
  EXPENSE_ATTACHMENT_ACCEPT,
  EXPENSE_ATTACHMENT_BUCKET,
  EXPENSE_ATTACHMENT_MAX_PER_EXPENSE,
  canEditExpenseAttachments,
  expenseAttachmentMimeType,
  expenseAttachmentStoragePath,
  formatFileSize,
  validateExpenseAttachment,
} from '@/lib/expense-attachments';
import type { ExpenseAttachment, ExpenseStatus } from '@/lib/types';

const SIGNED_URL_SECONDS = 60;

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

/** Validate a batch of files; returns the first error message or null. */
export function validateExpenseAttachmentBatch(files: File[], existingCount = 0): string | null {
  for (const file of files) {
    const problem = validateExpenseAttachment(file);
    if (problem) return problem;
  }
  if (existingCount + files.length > EXPENSE_ATTACHMENT_MAX_PER_EXPENSE) {
    return `An expense can have at most ${EXPENSE_ATTACHMENT_MAX_PER_EXPENSE} attachments.`;
  }
  return null;
}

/**
 * Upload files to internal-files/expenses/<expenseId>/ and register them.
 * Uploads sequentially and stops at the first failure (removing that orphaned
 * object). Never throws; returns how many files were attached and the error.
 */
export async function uploadExpenseAttachments(
  expenseId: string,
  files: File[]
): Promise<{ attached: number; error: string | null }> {
  let attached = 0;
  for (const file of files) {
    const mimeType = expenseAttachmentMimeType(file);
    if (!mimeType) return { attached, error: `${file.name}: unsupported file type.` };
    const path = expenseAttachmentStoragePath(expenseId, file.name);
    try {
      const { error: uploadError } = await supabase.storage
        .from(EXPENSE_ATTACHMENT_BUCKET)
        .upload(path, file, { cacheControl: '3600', contentType: mimeType, upsert: false });
      if (uploadError) return { attached, error: `${file.name}: ${uploadError.message}` };
      const { error: registerError } = await supabase.rpc('register_expense_attachment', {
        p_expense_id: expenseId,
        p_storage_path: path,
        p_file_name: file.name,
        p_mime_type: mimeType,
        p_size_bytes: file.size,
      });
      if (registerError) {
        await supabase.storage.from(EXPENSE_ATTACHMENT_BUCKET).remove([path]);
        return { attached, error: `${file.name}: ${registerError.message}` };
      }
    } catch (error) {
      return { attached, error: `${file.name}: ${errorMessage(error, 'upload failed.')}` };
    }
    attached += 1;
  }
  return { attached, error: null };
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  return mimeType.startsWith('image/') ? (
    <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
  ) : (
    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
  );
}

/** Small paperclip + count used in the expenses list. */
export function ExpenseAttachmentCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={`${count} attachment${count === 1 ? '' : 's'}`}
      aria-label={`${count} attachment${count === 1 ? '' : 's'}`}
    >
      <Paperclip className="h-3.5 w-3.5" />
      {count}
    </span>
  );
}

type PanelProps = {
  expenseId: string;
  expenseStatus: ExpenseStatus;
  attachments: ExpenseAttachment[];
  onChanged: () => void | Promise<void>;
};

/** Attachments for a saved expense: list, open, download, upload, remove. */
export function ExpenseAttachmentsPanel({ expenseId, expenseStatus, attachments, onChanged }: PanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const editable = canEditExpenseAttachments(expenseStatus);

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;
    const problem = validateExpenseAttachmentBatch(files, attachments.length);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    const { attached, error } = await uploadExpenseAttachments(expenseId, files);
    setUploading(false);
    if (error) {
      toast.error(attached ? `${attached} of ${files.length} files attached. ${error}` : error);
    } else {
      toast.success(attached === 1 ? 'File attached.' : `${attached} files attached.`);
    }
    await onChanged();
  };

  const signedUrl = async (attachment: ExpenseAttachment, download: boolean) => {
    const { data, error } = await supabase.storage
      .from(EXPENSE_ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.storage_path, SIGNED_URL_SECONDS, download ? { download: attachment.file_name } : undefined);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'Unable to open attachment.');
      return null;
    }
    return data.signedUrl;
  };

  const openAttachment = async (attachment: ExpenseAttachment) => {
    setWorkingId(attachment.id);
    const url = await signedUrl(attachment, false);
    setWorkingId(null);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadAttachment = async (attachment: ExpenseAttachment) => {
    setWorkingId(attachment.id);
    const url = await signedUrl(attachment, true);
    setWorkingId(null);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.rel = 'noopener';
    link.download = attachment.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const removeAttachment = async (attachment: ExpenseAttachment) => {
    if (!window.confirm(`Remove ${attachment.file_name} from this expense?`)) return;
    setWorkingId(attachment.id);
    const { data: path, error } = await supabase.rpc('delete_expense_attachment', {
      p_attachment_id: attachment.id,
    });
    if (error) {
      setWorkingId(null);
      toast.error(error.message);
      return;
    }
    const { error: storageError } = await supabase.storage
      .from(EXPENSE_ATTACHMENT_BUCKET)
      .remove([typeof path === 'string' && path ? path : attachment.storage_path]);
    setWorkingId(null);
    if (storageError) toast.warning(`Attachment removed, but the file could not be deleted: ${storageError.message}`);
    else toast.success('Attachment removed.');
    await onChanged();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          Invoices &amp; receipts{attachments.length ? ` (${attachments.length})` : ''}
        </p>
        {editable ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={EXPENSE_ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files)}
              aria-label="Attach invoice or receipt files"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Attach files'}
            </Button>
          </>
        ) : null}
      </div>
      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {editable ? 'No invoices or receipts attached yet. PDF, JPG, PNG or WEBP up to 10 MB each.' : 'No attachments.'}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <AttachmentIcon mimeType={attachment.mime_type} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title={`Open ${attachment.file_name}`}
                onClick={() => void openAttachment(attachment)}
              >
                {attachment.file_name}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(attachment.size_bytes)}</span>
              {workingId === attachment.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Open"
                    aria-label={`Open ${attachment.file_name}`}
                    onClick={() => void openAttachment(attachment)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Download"
                    aria-label={`Download ${attachment.file_name}`}
                    onClick={() => void downloadAttachment(attachment)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {editable ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      title="Remove"
                      aria-label={`Remove ${attachment.file_name}`}
                      onClick={() => void removeAttachment(attachment)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PendingProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

/** File picker for a new (unsaved) expense; files upload after the expense is created. */
export function PendingExpenseAttachments({ files, onChange, disabled }: PendingProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (fileList: FileList | null) => {
    const picked = Array.from(fileList || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!picked.length) return;
    const problem = validateExpenseAttachmentBatch(picked, files.length);
    if (problem) {
      toast.error(problem);
      return;
    }
    onChange([...files, ...picked]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          Invoices &amp; receipts{files.length ? ` (${files.length})` : ''}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EXPENSE_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
          aria-label="Choose invoice or receipt files"
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          Add files
        </Button>
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Optional. PDF, JPG, PNG or WEBP up to 10 MB each. Uploaded when you save.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              <AttachmentIcon mimeType={expenseAttachmentMimeType(file) || ''} />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
