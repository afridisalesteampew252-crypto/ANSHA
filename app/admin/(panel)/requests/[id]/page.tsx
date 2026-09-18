'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Paperclip, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import {
  REQUEST_ATTACHMENT_MAX_BYTES,
  REQUEST_STATUSES,
  isRequestOverdue,
  requestAttachmentStoragePath,
  requestEventLabel,
  requestStatusClass,
  requestStatusLabel,
  requestTypeLabel,
  type RequestStatus,
} from '@/lib/workspace-requests';
import type {
  AdminProfile,
  Inquiry,
  PartRequest,
  WorkspaceRequest,
  WorkspaceRequestAttachment,
  WorkspaceRequestEvent,
} from '@/lib/types';

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type RequestDetail = WorkspaceRequest & {
  assigned?: Pick<AdminProfile, 'id' | 'full_name' | 'email'> | null;
  vehicles?: { id: string; title: string; slug: string } | null;
  inquiries?: Pick<Inquiry, 'id' | 'customer_name' | 'customer_email' | 'customer_phone' | 'message' | 'status'> | null;
  part_requests?: Pick<
    PartRequest,
    'id' | 'customer_name' | 'email' | 'phone' | 'part_name' | 'part_number' | 'vehicle_make' | 'vehicle_model' | 'message' | 'status'
  > | null;
};

export default function AdminRequestDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const router = useRouter();

  const [row, setRow] = useState<RequestDetail | null>(null);
  const [events, setEvents] = useState<WorkspaceRequestEvent[]>([]);
  const [attachments, setAttachments] = useState<WorkspaceRequestAttachment[]>([]);
  const [staff, setStaff] = useState<Pick<AdminProfile, 'id' | 'full_name' | 'email'>[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noting, setNoting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<RequestStatus>('open');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [activity, setActivity] = useState('');

  const load = useCallback(async () => {
    setFetching(true);
    const [requestRes, eventsRes, attachmentsRes, staffRes] = await Promise.all([
      supabase
        .from('workspace_requests')
        .select(
          '*, assigned:admin_profiles!assigned_to(id, full_name, email), vehicles(id, title, slug), inquiries(id, customer_name, customer_email, customer_phone, message, status), part_requests(id, customer_name, email, phone, part_name, part_number, vehicle_make, vehicle_model, message, status)'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('workspace_request_events').select('*').eq('request_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('workspace_request_attachments').select('*').eq('request_id', id).order('created_at', { ascending: false }),
      supabase.from('admin_profiles').select('id, full_name, email').order('full_name'),
    ]);

    if (requestRes.error || !requestRes.data) {
      toast.error(requestRes.error?.message || 'Request not found.');
      router.push('/admin/requests');
      return;
    }

    const next = requestRes.data as unknown as RequestDetail;
    setRow(next);
    setTitle(next.title);
    setNotes(next.notes || '');
    setStatus(next.status);
    setAssignedTo(next.assigned_to || '');
    setDueAt(toLocalInput(next.due_at));
    setEvents((eventsRes.data || []) as WorkspaceRequestEvent[]);
    setAttachments((attachmentsRes.data || []) as WorkspaceRequestAttachment[]);
    setStaff((staffRes.data || []) as Pick<AdminProfile, 'id' | 'full_name' | 'email'>[]);
    setFetching(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!row) return;
    setSaving(true);
    const { error } = await supabase.rpc('update_workspace_request', {
      p_request_id: id,
      p_status: status,
      p_assigned_to: assignedTo || null,
      p_set_assigned: true,
      p_due_at: dueAt ? new Date(dueAt).toISOString() : null,
      p_set_due: true,
      p_title: title.trim(),
      p_notes: notes,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Request updated.');
    await load();
  };

  const addNote = async () => {
    if (!activity.trim()) {
      toast.error('Write a note first.');
      return;
    }
    setNoting(true);
    const { error } = await supabase.rpc('record_workspace_request_event', {
      p_request_id: id,
      p_notes: activity.trim(),
    });
    setNoting(false);
    if (error) return toast.error(error.message);
    setActivity('');
    toast.success('Note added.');
    await load();
  };

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    const tooLarge = files.find((file) => file.size > REQUEST_ATTACHMENT_MAX_BYTES);
    if (tooLarge) {
      toast.error(`${tooLarge.name} is larger than 25 MB.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const path = requestAttachmentStoragePath(id, file.name);
        const { error: uploadError } = await supabase.storage.from('internal-files').upload(path, file, { cacheControl: '3600' });
        if (uploadError) throw uploadError;
        const { error: registerError } = await supabase.rpc('register_workspace_request_attachment', {
          p_request_id: id,
          p_storage_path: path,
          p_file_name: file.name,
          p_mime_type: file.type || null,
          p_size_bytes: file.size,
        });
        if (registerError) {
          await supabase.storage.from('internal-files').remove([path]);
          throw registerError;
        }
      }
      toast.success(files.length === 1 ? 'File attached.' : `${files.length} files attached.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to attach file.');
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = async (attachment: WorkspaceRequestAttachment) => {
    const { data, error } = await supabase.storage.from('internal-files').createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'Unable to open attachment.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const removeAttachment = async (attachment: WorkspaceRequestAttachment) => {
    setRemovingId(attachment.id);
    const { error: storageError } = await supabase.storage.from('internal-files').remove([attachment.storage_path]);
    if (storageError) {
      setRemovingId(null);
      toast.error(storageError.message);
      return;
    }
    const { error } = await supabase.rpc('delete_workspace_request_attachment', {
      p_attachment_id: attachment.id,
    });
    setRemovingId(null);
    if (error) return toast.error(error.message);
    toast.success('Attachment removed.');
    await load();
  };

  const formatBytes = (value: number | null) => {
    if (!value) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (fetching || !row) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const overdue = isRequestOverdue(row.due_at, row.status);
  const intake = row.inquiries || row.part_requests;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/admin/requests">
            <ArrowLeft className="h-4 w-4" />
            Back to requests
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/chat?request=${row.id}`}>Open linked chat</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{row.title}</h1>
          <Badge variant="outline">{requestTypeLabel(row.request_type)}</Badge>
          <Badge variant="outline" className={requestStatusClass[row.status]}>
            {requestStatusLabel(row.status)}
          </Badge>
          {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Intake status stays on the original inquiry or part request. This ticket is for assignment, due dates, and activity.
        </p>
      </div>

      {intake ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Website intake</CardTitle>
            <CardDescription>Original customer submission. Ticket workflow does not replace these fields.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {'customer_name' in intake ? <p><span className="text-muted-foreground">Customer: </span>{intake.customer_name}</p> : null}
            {'customer_email' in intake && intake.customer_email ? <p><span className="text-muted-foreground">Email: </span>{intake.customer_email}</p> : null}
            {'email' in intake && intake.email ? <p><span className="text-muted-foreground">Email: </span>{intake.email}</p> : null}
            {'customer_phone' in intake && intake.customer_phone ? <p><span className="text-muted-foreground">Phone: </span>{intake.customer_phone}</p> : null}
            {'phone' in intake && intake.phone ? <p><span className="text-muted-foreground">Phone: </span>{intake.phone}</p> : null}
            {'part_name' in intake && intake.part_name ? <p><span className="text-muted-foreground">Part: </span>{intake.part_name}{intake.part_number ? ` (${intake.part_number})` : ''}</p> : null}
            {'vehicle_make' in intake && (intake.vehicle_make || intake.vehicle_model) ? (
              <p><span className="text-muted-foreground">Vehicle: </span>{[intake.vehicle_make, intake.vehicle_model].filter(Boolean).join(' ')}</p>
            ) : null}
            {intake.message ? <p className="whitespace-pre-wrap rounded-md bg-secondary/50 p-3">{intake.message}</p> : null}
            {row.inquiry_id ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/inquiries">Open inquiries list</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {row.vehicles ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Linked vehicle</p>
              <p className="font-medium">{row.vehicles.title}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/vehicles/${row.vehicles.id}`}>Vehicle record</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assignment and status</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as RequestStatus)}
              >
                {REQUEST_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignee">Assigned to</Label>
              <select
                id="assignee"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
              >
                <option value="">Unassigned</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name || person.email || person.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">Due</Label>
              <Input id="due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Ticket notes</Label>
              <Textarea id="notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save ticket
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attachments</CardTitle>
          <CardDescription>Private files on this ticket. Chat and mail stay on their own conversations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="request-files" className="sr-only">
              Attach files
            </Label>
            <Input
              id="request-files"
              type="file"
              multiple
              disabled={uploading}
              onChange={(event) => {
                void uploadFiles(event.target.files);
                event.currentTarget.value = '';
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">PDF, images, Office, ZIP, or text. 25 MB each.</p>
          </div>
          {uploading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </p>
          ) : null}
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          ) : (
            <ul className="space-y-2">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <button type="button" className="text-left text-sm font-medium underline-offset-2 hover:underline" onClick={() => void openAttachment(attachment)}>
                    {attachment.file_name}
                  </button>
                  <span className="text-xs text-muted-foreground">{formatBytes(attachment.size_bytes)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{format(new Date(attachment.created_at), 'dd MMM yyyy HH:mm')}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removingId === attachment.id}
                    onClick={() => void removeAttachment(attachment)}
                  >
                    {removingId === attachment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
          <CardDescription>Append-only. Use this for handoffs and follow-ups.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea rows={3} value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="Add a note" />
          <Button type="button" onClick={() => void addNote()} disabled={noting}>
            {noting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add note
          </Button>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{requestEventLabel(event.event_type)}</Badge>
                    {event.event_type === 'status_change' ? (
                      <span className="text-sm font-medium">
                        {requestStatusLabel(event.from_status)} → {requestStatusLabel(event.to_status)}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(event.created_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  {event.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{event.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
