'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Search, UserRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase/client';
import type {
  AdminProfile,
  Employee,
  EmployeeStatus,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveType,
  PayrollLine,
  PayrollRun,
  PayrollRunStatus,
} from '@/lib/types';

type EosEstimate = {
  employee_id: string;
  full_name: string;
  join_date: string;
  as_of_date: string;
  basic_salary: number;
  currency: string;
  years_of_service: number;
  estimate_amount: number;
  formula: string;
  disclaimer: string;
};

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const empStatusBadge: Record<EmployeeStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-slate-100 text-slate-700',
  terminated: 'bg-zinc-200 text-zinc-700',
};

const leaveStatusBadge: Record<LeaveRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

const runStatusBadge: Record<PayrollRunStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  posted: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-zinc-200 text-zinc-700',
};

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'sick', label: 'Sick' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'other', label: 'Other' },
];

export default function PayrollPage() {
  const [tab, setTab] = useState('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [isAccountAdmin, setIsAccountAdmin] = useState(false);

  const [empName, setEmpName] = useState('');
  const [empJoin, setEmpJoin] = useState(() => new Date().toISOString().slice(0, 10));
  const [empSalary, setEmpSalary] = useState('');
  const [empCurrency, setEmpCurrency] = useState('AED');
  const [empStatus, setEmpStatus] = useState<EmployeeStatus>('active');
  const [empProfileId, setEmpProfileId] = useState('');
  const [empNotes, setEmpNotes] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

  const [leaveEmployeeId, setLeaveEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [leaveStart, setLeaveStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaveNotes, setLeaveNotes] = useState('');

  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [runCurrency, setRunCurrency] = useState('AED');
  const [runNotes, setRunNotes] = useState('');

  const [eosEmployeeId, setEosEmployeeId] = useState('');
  const [eosAsOf, setEosAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [eosResult, setEosResult] = useState<EosEstimate | null>(null);

  const load = useCallback(async () => {
    const [empRes, profRes, leaveRes, runRes, sessionRes] = await Promise.all([
      supabase.from('employees').select('*').order('full_name').limit(200),
      supabase.from('admin_profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('payroll_runs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.auth.getSession(),
    ]);
    if (empRes.error) toast.error(empRes.error.message);
    if (leaveRes.error) toast.error(leaveRes.error.message);
    if (runRes.error) toast.error(runRes.error.message);
    setEmployees((empRes.data || []) as Employee[]);
    setProfiles((profRes.data || []) as AdminProfile[]);
    setLeaveRequests((leaveRes.data || []) as LeaveRequest[]);
    setRuns((runRes.data || []) as PayrollRun[]);
    const uid = sessionRes.data.session?.user?.id;
    if (uid) {
      const self = (profRes.data || []).find((row) => row.id === uid);
      setIsAccountAdmin(self?.role === 'admin');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const employeeName = useCallback(
    (id: string) => employees.find((e) => e.id === id)?.full_name || id.slice(0, 8),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.currency.toLowerCase().includes(q) ||
        e.status.toLowerCase().includes(q)
    );
  }, [employees, query]);

  const filteredLeave = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leaveRequests;
    return leaveRequests.filter(
      (row) =>
        employeeName(row.employee_id).toLowerCase().includes(q) ||
        row.leave_type.includes(q) ||
        row.status.includes(q)
    );
  }, [leaveRequests, query, employeeName]);

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (row) =>
        row.run_number.toLowerCase().includes(q) ||
        row.status.includes(q) ||
        row.currency.toLowerCase().includes(q)
    );
  }, [runs, query]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) || null;

  const openRun = async (id: string) => {
    setSelectedRunId(id);
    const { data, error } = await supabase
      .from('payroll_lines')
      .select('*')
      .eq('payroll_run_id', id)
      .order('created_at');
    if (error) toast.error(error.message);
    setLines((data || []) as PayrollLine[]);
  };

  const resetEmployeeForm = () => {
    setEditingEmployeeId(null);
    setEmpName('');
    setEmpJoin(new Date().toISOString().slice(0, 10));
    setEmpSalary('');
    setEmpCurrency('AED');
    setEmpStatus('active');
    setEmpProfileId('');
    setEmpNotes('');
  };

  const startEditEmployee = (row: Employee) => {
    setEditingEmployeeId(row.id);
    setEmpName(row.full_name);
    setEmpJoin(row.join_date);
    setEmpSalary(String(row.basic_salary));
    setEmpCurrency(row.currency);
    setEmpStatus(row.status);
    setEmpProfileId(row.admin_profile_id || '');
    setEmpNotes(row.notes || '');
  };

  const saveEmployee = async () => {
    if (!empName.trim()) return toast.error('Name is required');
    const salary = Number(empSalary);
    if (!Number.isFinite(salary) || salary < 0) return toast.error('Valid basic salary required');
    setBusy(true);
    const payload = {
      full_name: empName.trim(),
      join_date: empJoin,
      basic_salary: salary,
      currency: empCurrency.trim().toUpperCase() || 'AED',
      status: empStatus,
      admin_profile_id: empProfileId || null,
      notes: empNotes.trim() || null,
    };
    const res = editingEmployeeId
      ? await supabase.from('employees').update(payload).eq('id', editingEmployeeId).select('*').single()
      : await supabase.from('employees').insert(payload).select('*').single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editingEmployeeId ? 'Employee updated' : 'Employee added');
    resetEmployeeForm();
    await load();
  };

  const submitLeave = async () => {
    if (!leaveEmployeeId) return toast.error('Select an employee');
    if (leaveEnd < leaveStart) return toast.error('End date must be on or after start date');
    setBusy(true);
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: leaveEmployeeId,
      leave_type: leaveType,
      start_date: leaveStart,
      end_date: leaveEnd,
      notes: leaveNotes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Leave request submitted');
    setLeaveNotes('');
    await load();
  };

  const decideLeave = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(true);
    const { error } = await supabase.rpc('decide_leave_request', {
      p_leave_id: id,
      p_status: status,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Leave ${status}`);
    await load();
  };

  const createRun = async () => {
    if (periodEnd < periodStart) return toast.error('Period end must be on or after start');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_payroll_run', {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_currency: runCurrency.trim().toUpperCase() || 'AED',
      p_notes: runNotes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Payroll run created');
    setRunNotes('');
    await load();
    if (data?.id) await openRun(data.id);
    setTab('runs');
  };

  const saveLine = async (line: PayrollLine, basic: string, allow: string, deduct: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('update_payroll_line', {
      p_line_id: line.id,
      p_basic_salary: Number(basic) || 0,
      p_allowances: Number(allow) || 0,
      p_deductions: Number(deduct) || 0,
      p_notes: line.notes,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Line updated');
    await load();
    if (selectedRunId) await openRun(selectedRunId);
  };

  const postRun = async (id: string) => {
    if (!window.confirm('Post this payroll run? Posted runs are locked for edits.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('post_payroll_run', { p_run_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Payroll run posted');
    await load();
    await openRun(id);
  };

  const cancelRun = async (id: string) => {
    if (!window.confirm('Cancel this payroll run?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_payroll_run', { p_run_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Payroll run cancelled');
    await load();
    await openRun(id);
  };

  const estimateEos = async () => {
    if (!eosEmployeeId) return toast.error('Select an employee');
    setBusy(true);
    const { data, error } = await supabase.rpc('estimate_employee_eos', {
      p_employee_id: eosEmployeeId,
      p_as_of_date: eosAsOf,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEosResult(data as EosEstimate);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold">Payroll / leave / EOS</h1>
          <p className="text-sm text-muted-foreground">
            Ops MVP for employees, leave approvals, and payroll runs. EOS helper is a rough estimate only — not legal advice.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="runs">Payroll runs</TabsTrigger>
          <TabsTrigger value="eos">EOS estimate</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{editingEmployeeId ? 'Edit employee' : 'Add employee'}</CardTitle>
              <CardDescription>Optional link to an admin profile. Salary is the payroll basic.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="Employee name" />
              </div>
              <div className="space-y-1.5">
                <Label>Join date</Label>
                <Input type="date" value={empJoin} onChange={(e) => setEmpJoin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Basic salary</Label>
                <Input type="number" min="0" step="0.01" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={empCurrency} onChange={(e) => setEmpCurrency(e.target.value)} maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={empStatus}
                  onChange={(e) => setEmpStatus(e.target.value as EmployeeStatus)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Admin profile (optional)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={empProfileId}
                  onChange={(e) => setEmpProfileId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                <Label>Notes</Label>
                <Textarea value={empNotes} onChange={(e) => setEmpNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-2 md:col-span-2 lg:col-span-3">
                <Button onClick={() => void saveEmployee()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingEmployeeId ? 'Save changes' : 'Add employee'}
                </Button>
                {editingEmployeeId && (
                  <Button variant="outline" onClick={resetEmployeeForm}>
                    Cancel edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {filteredEmployees.length === 0 && (
              <p className="text-sm text-muted-foreground">No employees yet.</p>
            )}
            {filteredEmployees.map((row) => (
              <Card key={row.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold">{row.full_name}</p>
                      <Badge className={empStatusBadge[row.status]}>{row.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Joined {row.join_date} · {money(row.basic_salary, row.currency)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => startEditEmployee(row)}>
                    Edit
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New leave request</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={leaveEmployeeId}
                  onChange={(e) => setLeaveEmployeeId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {employees.filter((e) => e.status === 'active').map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Notes</Label>
                <Input value={leaveNotes} onChange={(e) => setLeaveNotes(e.target.value)} />
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <Button onClick={() => void submitLeave()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Submit leave
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {filteredLeave.length === 0 && <p className="text-sm text-muted-foreground">No leave requests.</p>}
            {filteredLeave.map((row) => (
              <Card key={row.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{employeeName(row.employee_id)}</p>
                      <Badge className={leaveStatusBadge[row.status]}>{row.status}</Badge>
                      <span className="text-xs uppercase text-muted-foreground">{row.leave_type}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.start_date} → {row.end_date}
                      {row.notes ? ` · ${row.notes}` : ''}
                    </p>
                  </div>
                  {row.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => void decideLeave(row.id, 'approved')}>
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void decideLeave(row.id, 'rejected')}>
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New payroll run</CardTitle>
              <CardDescription>
                Creates draft lines for all active employees in the selected currency (basic = current salary).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Period start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={runCurrency} onChange={(e) => setRunCurrency(e.target.value)} maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={runNotes} onChange={(e) => setRunNotes(e.target.value)} />
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <Button onClick={() => void createRun()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create draft run
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {filteredRuns.length === 0 && <p className="text-sm text-muted-foreground">No payroll runs yet.</p>}
              {filteredRuns.map((row) => (
                <Card
                  key={row.id}
                  className={selectedRunId === row.id ? 'border-primary' : 'cursor-pointer'}
                  onClick={() => void openRun(row.id)}
                >
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{row.run_number}</p>
                      <Badge className={runStatusBadge[row.status]}>{row.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.period_start} → {row.period_end} · Net {money(row.total_net, row.currency)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div>
              {!selectedRun && <p className="text-sm text-muted-foreground">Select a run to view lines.</p>}
              {selectedRun && (
                <Card>
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">{selectedRun.run_number}</CardTitle>
                        <CardDescription>
                          Basic {money(selectedRun.total_basic, selectedRun.currency)} · Allowances{' '}
                          {money(selectedRun.total_allowances, selectedRun.currency)} · Deductions{' '}
                          {money(selectedRun.total_deductions, selectedRun.currency)} · Net{' '}
                          {money(selectedRun.total_net, selectedRun.currency)}
                        </CardDescription>
                      </div>
                      <Badge className={runStatusBadge[selectedRun.status]}>{selectedRun.status}</Badge>
                    </div>
                    {selectedRun.status === 'draft' && (
                      <div className="flex flex-wrap gap-2">
                        {isAccountAdmin ? (
                          <Button size="sm" disabled={busy} onClick={() => void postRun(selectedRun.id)}>
                            <CheckCircle2 className="h-4 w-4" />
                            Post
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancelRun(selectedRun.id)}>
                          <XCircle className="h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    )}
                    {selectedRun.status === 'posted' && isAccountAdmin && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancelRun(selectedRun.id)}>
                        <XCircle className="h-4 w-4" />
                        Cancel posted run
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {lines.map((line) => (
                      <PayrollLineEditor
                        key={line.id}
                        line={line}
                        employeeLabel={employeeName(line.employee_id)}
                        currency={selectedRun.currency}
                        editable={selectedRun.status === 'draft'}
                        busy={busy}
                        onSave={(basic, allow, deduct) => void saveLine(line, basic, allow, deduct)}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="eos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">End-of-service estimate</CardTitle>
              <CardDescription>
                Rough helper: basic salary × years of service (days ÷ 365.25). Not legal advice and not a UAE labour-law
                gratuity calculation.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={eosEmployeeId}
                  onChange={(e) => setEosEmployeeId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>As of</Label>
                <Input type="date" value={eosAsOf} onChange={(e) => setEosAsOf(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void estimateEos()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Estimate
                </Button>
              </div>
            </CardContent>
          </Card>

          {eosResult && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="font-semibold">
                  {eosResult.full_name}: {money(eosResult.estimate_amount, eosResult.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {eosResult.years_of_service} years · basic {money(eosResult.basic_salary, eosResult.currency)} · joined{' '}
                  {eosResult.join_date} · as of {eosResult.as_of_date}
                </p>
                <p className="text-xs text-muted-foreground">{eosResult.formula}</p>
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {eosResult.disclaimer}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PayrollLineEditor({
  line,
  employeeLabel,
  currency,
  editable,
  busy,
  onSave,
}: {
  line: PayrollLine;
  employeeLabel: string;
  currency: string;
  editable: boolean;
  busy: boolean;
  onSave: (basic: string, allow: string, deduct: string) => void;
}) {
  const [basic, setBasic] = useState(String(line.basic_salary));
  const [allow, setAllow] = useState(String(line.allowances));
  const [deduct, setDeduct] = useState(String(line.deductions));

  useEffect(() => {
    setBasic(String(line.basic_salary));
    setAllow(String(line.allowances));
    setDeduct(String(line.deductions));
  }, [line.basic_salary, line.allowances, line.deductions, line.id]);

  const net = (Number(basic) || 0) + (Number(allow) || 0) - (Number(deduct) || 0);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium">{employeeLabel}</p>
        <p className="text-sm text-muted-foreground">Net {money(editable ? net : line.net_pay, currency)}</p>
      </div>
      {editable ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Basic</Label>
            <Input type="number" min="0" step="0.01" value={basic} onChange={(e) => setBasic(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Allowances</Label>
            <Input type="number" min="0" step="0.01" value={allow} onChange={(e) => setAllow(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deductions</Label>
            <Input type="number" min="0" step="0.01" value={deduct} onChange={(e) => setDeduct(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button size="sm" disabled={busy} onClick={() => onSave(basic, allow, deduct)}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Basic {money(line.basic_salary, currency)} · Allow {money(line.allowances, currency)} · Deduct{' '}
          {money(line.deductions, currency)}
        </p>
      )}
    </div>
  );
}
