'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ClipboardList, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect, vehicleSelectOption } from '@/components/admin/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import {
  REQUEST_STATUSES,
  REQUEST_TYPES,
  STAFF_REQUEST_TYPES,
  isRequestOverdue,
  requestStatusClass,
  requestStatusLabel,
  requestTypeLabel,
  type RequestStatus,
  type RequestType,
} from '@/lib/workspace-requests';
import type { AdminProfile, AdminRole, WorkspaceRequest } from '@/lib/types';

type RequestRow = WorkspaceRequest & {
  assigned?: Pick<AdminProfile, 'id' | 'full_name' | 'email'> | null;
  vehicles?: { id: string; title: string } | null;
};

type VehicleOption = { id: string; title: string; stock_number: string | null; chassis_number?: string | null; make?: string | null; model?: string | null };

export default function AdminRequestsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <AdminRequestsPageInner />
    </Suspense>
  );
}

function AdminRequestsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleFromQuery = searchParams.get('vehicle') || '';

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [staff, setStaff] = useState<Pick<AdminProfile, 'id' | 'full_name' | 'email'>[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('openish');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newType, setNewType] = useState<Exclude<RequestType, 'inquiry' | 'part_request'>>('shipping');
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newVehicle, setNewVehicle] = useState(vehicleFromQuery);
  const canCreate = role === 'admin' || role === 'staff';
  const canAssign = role === 'admin';
  const isFieldAgent = role === 'sales' || role === 'freelancer';

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const actorId = sessionData.session?.user.id || null;
    const profileRes = actorId
      ? await supabase.from('admin_profiles').select('role, is_active').eq('id', actorId).maybeSingle()
      : null;
    const activeRole = profileRes?.data?.is_active === true &&
      ['admin', 'staff', 'sales', 'freelancer', 'manager', 'accounts'].includes(profileRes.data.role)
      ? profileRes.data.role : null;
    setUserId(actorId);
    setRole(activeRole);
    if (!actorId || !activeRole) {
      setRows([]);
      setStaff([]);
      setVehicles([]);
      setLoading(false);
      toast.error('An active workspace account is required.');
      return;
    }
    const ops = activeRole === 'admin' || activeRole === 'staff';
    const [requestsRes, staffRes, vehiclesRes] = await Promise.all([
      supabase
        .from('workspace_requests')
        .select('*, assigned:admin_profiles!assigned_to(id, full_name, email), vehicles(id, title)')
        .order('created_at', { ascending: false }),
      ops ? supabase.from('admin_profiles').select('id, full_name, email').eq('is_active', true).order('full_name') : Promise.resolve({ data: [] }),
      ops ? supabase.from('vehicles').select('id, title, stock_number, chassis_number, make, model').order('created_at', { ascending: false }).limit(80) : Promise.resolve({ data: [] }),
    ]);
    if (requestsRes.error) toast.error(requestsRes.error.message);
    setRows((requestsRes.data || []) as unknown as RequestRow[]);
    setStaff((staffRes.data || []) as Pick<AdminProfile, 'id' | 'full_name' | 'email'>[]);
    setVehicles((vehiclesRes.data || []) as VehicleOption[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (vehicleFromQuery && canCreate) {
      setNewVehicle(vehicleFromQuery);
      setShowCreate(true);
    }
  }, [vehicleFromQuery, canCreate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const typeMatch = typeFilter === 'all' || row.request_type === typeFilter;
      const statusMatch =
        statusFilter === 'all'
          ? true
          : statusFilter === 'openish'
            ? row.status === 'open' || row.status === 'in_progress' || row.status === 'waiting'
            : row.status === statusFilter;
      const assigneeMatch =
        assigneeFilter === 'all'
          ? true
          : assigneeFilter === 'unassigned'
            ? !row.assigned_to
            : assigneeFilter === 'mine'
              ? row.assigned_to === userId
              : row.assigned_to === assigneeFilter;
      const vehicleMatch = !vehicleFromQuery || row.vehicle_id === vehicleFromQuery;
      const searchMatch =
        !q ||
        row.title.toLowerCase().includes(q) ||
        (row.notes || '').toLowerCase().includes(q) ||
        (row.assigned?.full_name || '').toLowerCase().includes(q) ||
        (row.vehicles?.title || '').toLowerCase().includes(q);
      return typeMatch && statusMatch && assigneeMatch && vehicleMatch && searchMatch;
    });
  }, [assigneeFilter, rows, search, statusFilter, typeFilter, userId, vehicleFromQuery]);

  const createRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    if (!newTitle.trim()) {
      toast.error('Title is required.');
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc('create_workspace_request', {
      p_request_type: newType,
      p_title: newTitle.trim(),
      p_notes: newNotes.trim() || null,
      p_assigned_to: canAssign ? newAssignee || null : null,
      p_due_at: newDue ? new Date(newDue).toISOString() : null,
      p_vehicle_id: newVehicle || null,
      p_customer_id: null,
      p_inquiry_id: null,
      p_part_request_id: null,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success('Request created.');
    setNewTitle('');
    setNewNotes('');
    setNewAssignee('');
    setNewDue('');
    setShowCreate(false);
    await load();
    const created = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
    if (created?.id) router.push(`/admin/requests/${created.id}`);
  };

  const deleteRequest = async (row: RequestRow) => {
    if (!canCreate || row.inquiry_id || row.request_type === 'inquiry') return;
    const ok = window.confirm(
      `Delete request “${row.title}”?\n\nThis permanently removes the ticket, activity, and attachments. Website intake rows are kept. This cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(row.id);
    const { error } = await supabase.rpc('delete_workspace_request', { p_request_id: row.id });
    setDeletingId(null);
    if (error) return toast.error(error.message);
    toast.success('Request deleted.');
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{isFieldAgent ? 'My requests' : 'Requests'}</h1>
          <p className="text-sm text-muted-foreground">
            {isFieldAgent ? 'Your assigned work and readable inquiry tickets. Manage sales leads in the inquiries inbox.' : 'Website inquiries and part requests open tickets automatically. Create BL, inspection, or shipping tickets for assignable work.'}
          </p>
        </div>
        {canCreate ? <Button type="button" onClick={() => setShowCreate((open) => !open)}>
          <Plus className="h-4 w-4" />
          New ticket
        </Button> : null}
      </div>

      {canCreate && showCreate ? (
        <Card>
          <CardContent className="p-4">
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void createRequest(event)}>
              <div className="space-y-1.5">
                <Label htmlFor="req-type">Type</Label>
                <select
                  id="req-type"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={newType}
                  onChange={(event) => setNewType(event.target.value as Exclude<RequestType, 'inquiry' | 'part_request'>)}
                >
                  {STAFF_REQUEST_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {canAssign ? <div className="space-y-1.5">
                <Label htmlFor="req-assignee">Assign to</Label>
                <select
                  id="req-assignee"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={newAssignee}
                  onChange={(event) => setNewAssignee(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || person.email || person.id}
                    </option>
                  ))}
                </select>
              </div> : null}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="req-title">Title</Label>
                <Input id="req-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-due">Due</Label>
                <Input id="req-due" type="datetime-local" value={newDue} onChange={(event) => setNewDue(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-vehicle">Vehicle (optional)</Label>
                <SearchableSelect
                  id="req-vehicle"
                  value={newVehicle}
                  onValueChange={setNewVehicle}
                  options={vehicles.map((vehicle) =>
                    vehicleSelectOption({
                      ...vehicle,
                      label: `${vehicle.title}${vehicle.stock_number ? ` (${vehicle.stock_number})` : ''}`,
                    })
                  )}
                  placeholder="None"
                  searchPlaceholder="Search stock #, chassis, title…"
                  clearLabel="None"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="req-notes">Notes</Label>
                <Textarea id="req-notes" rows={3} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create ticket
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search title, notes, assignee, vehicle..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10"
          />
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {REQUEST_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="openish">Active</option>
          <option value="all">All statuses</option>
          {REQUEST_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
          <option value="all">{canCreate ? 'Anyone' : 'All readable requests'}</option>
          <option value="mine">Assigned to me</option>
          {canCreate ? <option value="unassigned">Unassigned</option> : null}
          {canCreate ? staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name || person.email}
            </option>
          )) : null}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">No requests found</h3>
            <p className="mt-1 text-muted-foreground">Intake tickets and staff-created work will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const overdue = isRequestOverdue(row.due_at, row.status);
            return (
              <Card key={row.id} className="transition-shadow hover:shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link href={`/admin/requests/${row.id}`} className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{row.title}</h3>
                        <Badge variant="outline">{requestTypeLabel(row.request_type)}</Badge>
                        <Badge variant="outline" className={requestStatusClass[row.status as RequestStatus]}>
                          {requestStatusLabel(row.status)}
                        </Badge>
                        {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {row.assigned?.full_name || row.assigned?.email || 'Unassigned'}
                        {row.vehicles?.title ? ` · ${row.vehicles.title}` : ''}
                        {row.due_at ? ` · due ${format(new Date(row.due_at), 'dd MMM yyyy HH:mm')}` : ''}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{format(new Date(row.created_at), 'dd MMM yyyy')}</span>
                      {canCreate && !row.inquiry_id && row.request_type !== 'inquiry' ? <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingId === row.id}
                        aria-label={`Delete ${row.title}`}
                        onClick={() => void deleteRequest(row)}
                      >
                        {deletingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
