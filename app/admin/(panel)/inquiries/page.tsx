'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarClock, CheckCircle2, Inbox, Loader2, Mail, MessageSquare, Package, Phone, Plus, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect, customerSelectOption, vehicleSelectOption, type SearchableSelectOption } from '@/components/admin/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { inquiryStatusLabels } from '@/lib/site-config';
import {
  canEditSalesInquiry, dateToLocalInput, emptyInquirySummary, inquiryUpdatePayload, isInquiryFieldAgent, isInquiryOverdue,
  leadStageLabels, leadStages, loadSalesInquiryDeepLink, matchesInquiryFilters, salesInquiryStockHref, sourceLabels, validateManualInquiry, verifiedAssignees,
  type AgentVerificationSummary, type InquiryDeepLinkClient, type InquiryDraft, type LeadStage, type SalesInquiry, type SalesInquiryEvent, type SalesInquirySummary,
} from '@/lib/sales-inquiries';

type InboxProfile = { id: string; role: string; full_name: string | null; is_active: boolean };
type CustomerOption = { id: string; full_name: string; customer_code?: string; company_name?: string | null; phone: string | null; email: string | null };
type ManualDraft = { name: string; email: string; phone: string; message: string; source: 'manual' | 'whatsapp' | 'phone'; productKind: 'none' | 'part' | 'vehicle'; productId: string };
const emptyManual: ManualDraft = { name: '', email: '', phone: '', message: '', source: 'manual', productKind: 'none', productId: '' };
const stageColors: Record<LeadStage, string> = {
  new: 'border-blue-200 bg-blue-50 text-blue-700', assigned: 'border-violet-200 bg-violet-50 text-violet-700',
  contacted: 'border-amber-200 bg-amber-50 text-amber-800', quoted: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  won: 'border-emerald-200 bg-emerald-50 text-emerald-700', lost: 'border-border bg-muted text-muted-foreground', archived: 'border-border bg-muted text-muted-foreground',
};

function dateLabel(value: string | null) {
  if (!value) return 'No follow-up scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No follow-up scheduled' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

export default function AdminInquiriesPage() {
  return <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}><InquiryInbox /></Suspense>;
}

function InquiryInbox() {
  const searchParams = useSearchParams();
  const requestedInquiry = searchParams.get('inquiry');
  const [profile, setProfile] = useState<InboxProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [agents, setAgents] = useState<AgentVerificationSummary[]>([]);
  const [agentError, setAgentError] = useState('');
  const [items, setItems] = useState<SalesInquiry[]>([]);
  const [summary, setSummary] = useState<SalesInquirySummary>(emptyInquirySummary);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [introducerFilter, setIntroducerFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<SalesInquiry | null>(null);
  const [draft, setDraft] = useState<InquiryDraft>({ stage: 'new', assigneeId: '', dueLocal: '', note: '', customerId: '' });
  const [events, setEvents] = useState<SalesInquiryEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState<ManualDraft>(emptyManual);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const [productOptions, setProductOptions] = useState<SearchableSelectOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const authEpoch = useRef(0);
  const loadSequence = useRef(0);
  const openedDeepLink = useRef('');
  const deepLinkRequest = useRef('');
  const deepLinkRecord = useRef('');

  const admin = profile?.role === 'admin';
  const ops = admin || profile?.role === 'staff';
  const fieldAgent = Boolean(profile && isInquiryFieldAgent(profile.role));
  const ownVerification = agents.find((agent) => agent.agent_id === profile?.id);
  const verified = ownVerification?.verification_status === 'verified';
  const assignable = useMemo(() => verifiedAssignees(agents), [agents]);
  const mayCreate = Boolean(profile && (admin || profile.role === 'staff' || (fieldAgent && verified)));
  const canEdit = Boolean(profile && selected && canEditSalesInquiry(profile.role, profile.id, ownVerification?.verification_status, selected));

  const bootstrap = useCallback(async () => {
    const epoch = ++authEpoch.current;
    setAuthLoading(true);
    setAuthError('');
    setAgentError('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('Sign in with an active workspace account to open the inquiry inbox.');
      const { data: currentProfile, error: profileError } = await supabase.from('admin_profiles')
        .select('id,role,full_name,is_active').eq('id', session.user.id).eq('is_active', true).maybeSingle();
      if (profileError) throw profileError;
      if (!currentProfile || !['admin', 'staff', 'sales', 'freelancer'].includes(currentProfile.role)) throw new Error('Your role does not have access to the inquiry inbox.');
      const current = currentProfile as InboxProfile;
      let agentRows: AgentVerificationSummary[] = [];
      if (current.role === 'admin' || isInquiryFieldAgent(current.role)) {
        const { data, error } = await supabase.rpc('get_sales_agents');
        if (error) {
          if (epoch === authEpoch.current) setAgentError(error.message || 'Agent verification could not be loaded.');
        } else agentRows = Array.isArray(data) ? data as AgentVerificationSummary[] : [];
      }
      if (epoch !== authEpoch.current) return;
      setAgents(agentRows);
      setProfile(current);
    } catch (error) {
      if (epoch === authEpoch.current) {
        setProfile(null); setAgents([]); setItems([]); setSummary(emptyInquirySummary);
        setSelected(null); setManualOpen(false); setProductOptions([]); setCustomers([]);
        setAuthError(errorMessage(error, 'Workspace access could not be checked.')); setLoading(false);
      }
    } finally { if (epoch === authEpoch.current) setAuthLoading(false); }
  }, []);

  useEffect(() => {
    void bootstrap();
    let timeout: number | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
      authEpoch.current += 1;
      loadSequence.current += 1;
      setProfile(null); setItems([]); setSummary(emptyInquirySummary); setAgents([]); setSelected(null);
      setManualOpen(false); setManual(emptyManual); setProductOptions([]); setCustomers([]); setEvents([]);
      setSaving(false); setManualSaving(false);
      setDeepLinkLoading(false); setDeepLinkError(''); deepLinkRequest.current = ''; deepLinkRecord.current = '';
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => void bootstrap(), 0);
    });
    return () => { authEpoch.current += 1; loadSequence.current += 1; window.clearTimeout(timeout); subscription.unsubscribe(); };
  }, [bootstrap]);

  const load = useCallback(async () => {
    if (!profile) return;
    const sequence = ++loadSequence.current;
    const epoch = authEpoch.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_sales_inquiries', {
        p_stage: stageFilter === 'all' ? null : stageFilter, p_scope: 'all', p_search: search.trim() || null, p_limit: 300,
      });
      if (sequence !== loadSequence.current || epoch !== authEpoch.current) return;
      if (error) throw error;
      const result = data as { items?: SalesInquiry[]; summary?: Partial<SalesInquirySummary> } | null;
      const returnedItems = result?.items;
      const nextItems = Array.isArray(returnedItems) ? returnedItems : [];
      if (deepLinkRecord.current && !nextItems.some((item) => item.id === deepLinkRecord.current)) {
        // Close the older detail before rechecking its reference under current RLS.
        deepLinkRecord.current = ''; openedDeepLink.current = ''; deepLinkRequest.current = '';
        setDeepLinkError('');
      }
      setItems(nextItems);
      setSelected((current) => current ? nextItems.find((item) => item.id === current.id) || null : null);
      setSummary({ ...emptyInquirySummary, ...(result?.summary || {}) });
      setLoadError('');
    } catch (error) {
      if (sequence === loadSequence.current && epoch === authEpoch.current) {
        setItems([]); setSelected(null); setSummary(emptyInquirySummary);
        setLoadError(errorMessage(error, 'Inquiries could not be loaded.'));
      }
    } finally { if (sequence === loadSequence.current && epoch === authEpoch.current) setLoading(false); }
  }, [profile, search, stageFilter]);

  useEffect(() => {
    if (!profile) return;
    const timeout = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timeout);
  }, [load, profile]);

  useEffect(() => {
    if (!profile) return;
    let timeout: number | undefined;
    const refresh = () => {
      if (document.hidden) return;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => void load(), 500);
    };
    const channel = supabase.channel('sales-inquiry-inbox-' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_requests' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications', filter: 'recipient_id=eq.' + profile.id }, refresh)
      .subscribe();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('ansha:notification', refresh);
    return () => {
      window.clearTimeout(timeout); document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('ansha:notification', refresh); void supabase.removeChannel(channel);
    };
  }, [profile, load]);

  useEffect(() => {
    if (!selected || !profile) return;
    let active = true;
    const epoch = authEpoch.current;
    setEvents([]); setEventsLoading(true); setEventsError('');
    void Promise.resolve(supabase.rpc('get_sales_inquiry_events', { p_inquiry_id: selected.id })).then(({ data, error }) => {
      if (!active || epoch !== authEpoch.current) return;
      if (error) setEventsError(error.message || 'Activity could not be loaded.');
      else setEvents(Array.isArray(data) ? data as SalesInquiryEvent[] : []);
      setEventsLoading(false);
    }).catch(() => { if (active && epoch === authEpoch.current) { setEventsError('Activity could not be loaded.'); setEventsLoading(false); } });
    return () => { active = false; };
  }, [selected, profile]);

  useEffect(() => {
    if (!selected || !admin) return;
    let active = true;
    setCustomersError('');
    void supabase.from('customers').select('id,customer_code,full_name,company_name,phone,email').eq('is_active', true).order('full_name').limit(300).then(({ data, error }) => {
      if (!active) return;
      if (error) setCustomersError(error.message || 'Customer matches could not be loaded.');
      else setCustomers((data || []) as CustomerOption[]);
    });
    return () => { active = false; };
  }, [selected, admin]);

  useEffect(() => {
    if (!manualOpen || manual.productKind === 'none') { setProductOptions([]); setProductsLoading(false); return; }
    let active = true;
    setProductOptions([]);
    setProductsLoading(true);
    const query = manual.productKind === 'part'
      ? supabase.from('parts').select('id,name,part_code').order('name').limit(300)
      : supabase.from('vehicles').select('id,title,stock_number,make,model').order('title').limit(300);
    void query.then(({ data, error }) => {
      if (!active) return;
      if (error) setManualError(error.message || 'Product choices could not be loaded.');
      else setProductOptions((data || []).map((row) => 'name' in row
        ? { value: String(row.id), label: String(row.part_code || '') + ' — ' + String(row.name), keywords: [String(row.name), String(row.part_code || '')] }
        : vehicleSelectOption(row)));
      setProductsLoading(false);
    });
    return () => { active = false; };
  }, [manualOpen, manual.productKind]);

  const visibleItems = useMemo(() => items.filter((item) => matchesInquiryFilters(item, { source: sourceFilter, assignee: assigneeFilter, introducer: introducerFilter, overdue: overdueOnly })), [items, sourceFilter, assigneeFilter, introducerFilter, overdueOnly]);
  const filterIntroducers = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) if (item.introduced_by) map.set(item.introduced_by, item.introduced_by_name || 'Introducing agent');
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [items]);
  const filterAssignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) if (item.assigned_to) map.set(item.assigned_to, item.assignee_name || 'Assigned agent');
    for (const agent of assignable) map.set(agent.agent_id, agent.full_name || agent.email || 'Verified agent');
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [items, assignable]);
  const customerOptions = useMemo(() => {
    const map = new Map<string, CustomerOption>();
    for (const customer of customers) map.set(customer.id, customer);
    for (const customer of selected?.duplicate_candidates || []) map.set(customer.id, customer);
    if (selected?.customer_id && !map.has(selected.customer_id)) map.set(selected.customer_id, { id: selected.customer_id, full_name: 'Current linked customer', phone: null, email: null });
    return Array.from(map.values()).map(customerSelectOption);
  }, [customers, selected]);

  const openInquiry = useCallback((inquiry: SalesInquiry) => {
    deepLinkRecord.current = '';
    setSelected(inquiry);
    setDraft({ stage: inquiry.lead_stage, assigneeId: inquiry.assigned_to || '', dueLocal: dateToLocalInput(inquiry.due_at), note: '', customerId: inquiry.customer_id || '' });
    setSaveError('');
  }, []);
  const closeInquiry = useCallback(() => { deepLinkRecord.current = ''; setSelected(null); }, []);
  useEffect(() => {
    if (!requestedInquiry) { setDeepLinkLoading(false); setDeepLinkError(''); deepLinkRequest.current = ''; return; }
    if (!profile || loading || loadError) return;
    const key = profile.id + ':' + authEpoch.current + ':' + requestedInquiry;
    if (openedDeepLink.current === key) return;
    const inquiry = items.find((item) => item.id === requestedInquiry);
    if (inquiry) { openedDeepLink.current = key; setDeepLinkError(''); openInquiry(inquiry); return; }
    if (deepLinkRequest.current === key) return;
    deepLinkRequest.current = key;
    const epoch = authEpoch.current;
    let active = true;
    let finished = false;
    setDeepLinkLoading(true); setDeepLinkError('');
    setSelected((current) => current?.id === requestedInquiry ? null : current);
    void loadSalesInquiryDeepLink(supabase as unknown as InquiryDeepLinkClient, requestedInquiry, () => active && epoch === authEpoch.current).then((record) => {
      if (!active || epoch !== authEpoch.current) return;
      if (record) { openedDeepLink.current = key; openInquiry(record); deepLinkRecord.current = record.id; }
    }).catch(() => {
      if (active && epoch === authEpoch.current) {
        deepLinkRecord.current = '';
        setDeepLinkError('This inquiry is unavailable or outside your current access.');
      }
    }).finally(() => { finished = true; if (active && epoch === authEpoch.current) setDeepLinkLoading(false); });
    return () => {
      active = false;
      setDeepLinkLoading(false);
      if (!finished && openedDeepLink.current !== key && deepLinkRequest.current === key) deepLinkRequest.current = '';
    };
  }, [requestedInquiry, profile, loading, loadError, items, openInquiry]);
  const saveInquiry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !selected || !canEdit) return;
    setSaving(true); setSaveError('');
    const epoch = authEpoch.current;
    try {
      const payload = inquiryUpdatePayload(selected, draft, { role: profile.role, userId: profile.id, verificationStatus: ownVerification?.verification_status });
      const { error } = await supabase.rpc('update_sales_inquiry', payload);
      if (error) throw error;
      if (epoch !== authEpoch.current) return;
      toast.success('Inquiry updated.');
      closeInquiry();
      await load();
    } catch (error) { if (epoch === authEpoch.current) setSaveError(errorMessage(error, 'The inquiry could not be updated.')); }
    finally { if (epoch === authEpoch.current) setSaving(false); }
  };
  const createInquiry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mayCreate) return;
    const validation = validateManualInquiry(manual);
    if (validation) { setManualError(validation); return; }
    setManualSaving(true); setManualError('');
    const epoch = authEpoch.current;
    try {
      const { data, error } = await supabase.rpc('create_agent_inquiry', {
        p_customer_name: manual.name.trim(), p_customer_email: manual.email.trim().toLowerCase() || null,
        p_customer_phone: manual.phone.trim() || null, p_message: manual.message.trim(), p_source: manual.source,
        p_part_id: manual.productKind === 'part' && manual.productId ? manual.productId : null,
        p_vehicle_id: manual.productKind === 'vehicle' && manual.productId ? manual.productId : null,
      });
      if (error) throw error;
      if (epoch !== authEpoch.current) return;
      const result = data as { inquiry_number?: string } | null;
      if (!result?.inquiry_number) throw new Error('Inquiry confirmation is unavailable. Refresh the inbox before logging this conversation again.');
      toast.success('Inquiry ' + result.inquiry_number + ' saved for administrator assignment.');
      setManualOpen(false); setManual(emptyManual);
      await load();
    } catch (error) { if (epoch === authEpoch.current) setManualError(errorMessage(error, 'The inquiry could not be created.')); }
    finally { if (epoch === authEpoch.current) setManualSaving(false); }
  };
  const stockHref = selected ? salesInquiryStockHref(selected, fieldAgent ? 'public' : 'admin') : null;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">{fieldAgent ? 'My inquiries' : 'Inquiry inbox'}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{fieldAgent ? 'Follow up on your assigned customers. Inquiries you log remain read-only until an administrator assigns them.' : 'Review incoming leads, assign verified agents, and keep customer follow-ups in one place.'}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={authLoading || loading} onClick={() => void bootstrap()}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />Refresh</Button>{mayCreate ? <Button onClick={() => { setManual(emptyManual); setManualError(''); setManualOpen(true); }}><Plus className="h-4 w-4" />Add inquiry</Button> : null}</div>
    </div>

    {authError ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{authError}<Button variant="ghost" onClick={() => void bootstrap()}>Retry access check</Button></div> : null}
    {agentError ? <div role="alert" className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">{agentError}<Button variant="ghost" size="sm" onClick={() => void bootstrap()}>Retry verification</Button></div> : null}
    {fieldAgent && !verified ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950"><div><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Agent verification: {ownVerification?.verification_status || 'pending'}</p><p className="mt-1">Submit your name, phone, and email, then contact an administrator for manual verification.</p>{ownVerification?.review_note ? <p className="mt-1">Review note: {ownVerification.review_note}</p> : null}</div><Button asChild variant="outline"><Link href="/admin/agents">Review my verification</Link></Button></div> : null}

    {profile ? <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {[...leadStages.filter((stage) => stage !== 'archived').map((stage) => ({ key: stage, label: leadStageLabels[stage], value: summary[stage] })), { key: 'unassigned', label: 'Unassigned', value: summary.unassigned }, { key: 'overdue', label: 'Overdue', value: summary.overdue }].map((metric) => <button key={metric.key} className={cn('rounded-lg border bg-card p-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', metric.key === 'overdue' && 'border-destructive/30')} onClick={() => { if (metric.key === 'unassigned') { setStageFilter('all'); setAssigneeFilter('unassigned'); setOverdueOnly(false); } else if (metric.key === 'overdue') { setStageFilter('all'); setAssigneeFilter('all'); setOverdueOnly(true); } else { setStageFilter(metric.key); setOverdueOnly(false); } }}><span className="block text-xs text-muted-foreground">{metric.label}</span><span className={cn('mt-1 block text-xl font-bold', metric.key === 'overdue' && 'text-destructive')}>{loading ? '—' : metric.value}</span></button>)}
      </div>
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="sm:col-span-2 xl:col-span-5"><Label htmlFor="inquiry-search" className="mb-2 block">Search inquiries</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="inquiry-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, customer name, phone, email, or message" className="pl-10" maxLength={160} /></div></div>
        <div><Label htmlFor="stage-filter" className="mb-2 block">Sales stage</Label><NativeSelect id="stage-filter" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option>{leadStages.map((stage) => <option key={stage} value={stage}>{leadStageLabels[stage]}</option>)}</NativeSelect></div>
        <div><Label htmlFor="source-filter" className="mb-2 block">Source</Label><NativeSelect id="source-filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option>{Object.entries(sourceLabels).map(([source, label]) => <option key={source} value={source}>{label}</option>)}</NativeSelect></div>
        <div><Label htmlFor="introducer-filter" className="mb-2 block">Introduced by</Label><NativeSelect id="introducer-filter" value={introducerFilter} onChange={(event) => setIntroducerFilter(event.target.value)}><option value="all">All introducers</option><option value="direct">Direct customer</option>{filterIntroducers.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</NativeSelect></div>
        <div><Label htmlFor="assignee-filter" className="mb-2 block">Assigned agent</Label><NativeSelect id="assignee-filter" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">All visible assignments</option><option value="unassigned">Unassigned</option>{filterAssignees.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</NativeSelect></div>
        <div className="flex flex-wrap items-end gap-2"><Button variant={overdueOnly ? 'default' : 'outline'} aria-pressed={overdueOnly} onClick={() => setOverdueOnly((value) => !value)}><CalendarClock className="h-4 w-4" />Overdue only</Button><Button variant="ghost" onClick={() => { setSearch(''); setStageFilter('all'); setSourceFilter('all'); setAssigneeFilter('all'); setIntroducerFilter('all'); setOverdueOnly(false); }}>Clear filters</Button></div>
      </div>
      <p className="text-xs text-muted-foreground">Showing {visibleItems.length} of {items.length} loaded inquiries · {summary.total} accessible matches. Stage totals follow the current search; source, introducer, assignee, and overdue filters refine the latest 300 results.</p>
    </> : null}

    {loadError ? <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{loadError}<Button size="sm" variant="ghost" onClick={() => void load()}>Retry</Button></div> : null}
    {deepLinkLoading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Opening linked inquiry…</p> : null}
    {deepLinkError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{deepLinkError}</p> : null}
    {authLoading || loading ? <div className="space-y-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)}</div> : !loadError && profile && visibleItems.length === 0 ? <Card><CardContent className="py-12 text-center"><Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" /><h2 className="mt-3 font-semibold">No inquiries match these filters</h2><p className="mt-1 text-sm text-muted-foreground">{fieldAgent ? 'Your administrator will assign incoming leads here.' : 'New website and manually logged inquiries will appear here.'}</p></CardContent></Card> : <div className="space-y-3">{visibleItems.map((inquiry) => <button key={inquiry.id} type="button" onClick={() => openInquiry(inquiry)} className="w-full rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{inquiry.customer_name}</span><Badge variant="outline" className={stageColors[inquiry.lead_stage]}>{leadStageLabels[inquiry.lead_stage]}</Badge><Badge variant="secondary">{sourceLabels[inquiry.inquiry_source] || inquiry.inquiry_source}</Badge>{isInquiryOverdue(inquiry) ? <Badge variant="destructive">Overdue</Badge> : null}{fieldAgent && inquiry.assigned_to !== profile?.id ? <Badge variant="outline">Awaiting admin assignment · read-only</Badge> : null}</span><span className="mt-1 block text-xs text-muted-foreground">{inquiry.inquiry_number} · Introduced by {inquiry.introduced_by_name || (inquiry.introduced_by ? 'Introducing agent' : 'Direct customer')} · Assigned to {inquiry.assignee_name || (inquiry.assigned_to ? 'Assigned agent' : 'Unassigned')}</span>{inquiry.stock_name ? <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Package className="h-3 w-3" />{inquiry.stock_name}</span> : null}<span className="mt-2 block line-clamp-2 text-sm text-muted-foreground">{inquiry.message}</span><span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{inquiry.customer_email ? <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{inquiry.customer_email}</span> : null}{inquiry.customer_phone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{inquiry.customer_phone}</span> : null}<span>{dateLabel(inquiry.due_at)}</span></span></button>)}</div>}

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !saving) closeInquiry(); }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{selected?.inquiry_number || 'Inquiry details'}</DialogTitle><DialogDescription>Customer details, attribution, assignment, follow-up, and recorded activity.</DialogDescription></DialogHeader>
        {selected ? <form onSubmit={saveInquiry} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Customer</p><p className="font-semibold">{selected.customer_name}</p>{selected.customer_email ? <a href={'mailto:' + selected.customer_email} className="mt-1 block break-all text-sm text-primary underline">{selected.customer_email}</a> : null}{selected.customer_phone ? <a href={'tel:' + selected.customer_phone.replace(/[^+\d]/g, '')} className="mt-1 block text-sm text-primary underline">{selected.customer_phone}</a> : null}</div><div className="space-y-1 text-sm"><p>Source: <strong>{sourceLabels[selected.inquiry_source]}</strong></p><p>Introduced by: <strong>{selected.introduced_by_name || (selected.introduced_by ? 'Introducing agent' : 'Direct customer')}</strong></p><p>Assigned agent: <strong>{selected.assignee_name || (selected.assigned_to ? 'Assigned agent' : 'Unassigned')}</strong></p><p className="text-xs text-muted-foreground">Received {dateLabel(selected.created_at)} · Message status: {inquiryStatusLabels[selected.status]}</p></div></div>
          <div className="whitespace-pre-wrap rounded-lg bg-secondary/50 p-3 text-sm">{selected.message}</div>
          <div className="flex flex-wrap gap-2">{selected.request_id ? <Button asChild size="sm" variant="outline"><Link href={'/admin/requests/' + selected.request_id}>Open request ticket</Link></Button> : null}{stockHref ? <Button asChild size="sm" variant="outline"><Link href={stockHref}><Package className="h-4 w-4" />{selected.stock_name || 'View stock'}</Link></Button> : selected.stock_name ? <p className="text-sm text-muted-foreground">Stock: {selected.stock_name}</p> : null}{selected.customer_id && ops ? <Button asChild size="sm" variant="outline"><Link href={'/admin/customers/' + selected.customer_id}><UserRound className="h-4 w-4" />Linked customer</Link></Button> : selected.customer_id ? <span className="self-center text-sm text-muted-foreground">Customer account linked</span> : null}</div>
          {!canEdit ? <div className="rounded-lg border bg-secondary/40 p-3 text-sm">This inquiry is read-only. An administrator must assign it to your verified agent account before you can update it.</div> : null}
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="inquiry-stage" className="mb-2 block">Sales stage</Label><NativeSelect id="inquiry-stage" value={draft.stage} disabled={!canEdit || saving} onChange={(event) => setDraft((value) => ({ ...value, stage: event.target.value as LeadStage }))}>{selected.lead_stage === 'archived' ? <option value="archived" disabled>Archived · choose a sales stage to reclassify</option> : null}{leadStages.filter((stage) => stage !== 'archived').map((stage) => <option key={stage} value={stage}>{leadStageLabels[stage]}</option>)}</NativeSelect><p className="mt-1 text-xs text-muted-foreground">Won records sales progress. Invoice, payment, and commission approvals follow their existing processes.</p></div><div><Label htmlFor="inquiry-followup" className="mb-2 block">Next follow-up</Label><Input id="inquiry-followup" type="datetime-local" value={draft.dueLocal} disabled={!canEdit || saving} onChange={(event) => setDraft((value) => ({ ...value, dueLocal: event.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">Uses your local time. Clear the date to remove a follow-up.</p></div></div>
          {admin ? <div className="space-y-4 rounded-lg border p-4"><div><Label htmlFor="inquiry-assignee" className="mb-2 block">Assign a verified agent</Label><NativeSelect id="inquiry-assignee" value={draft.assigneeId} disabled={saving || !canEdit || Boolean(agentError)} onChange={(event) => setDraft((value) => ({ ...value, assigneeId: event.target.value }))}><option value="">Unassigned</option>{selected.assigned_to && !assignable.some((agent) => agent.agent_id === selected.assigned_to) ? <option value={selected.assigned_to} disabled>{selected.assignee_name || 'Current agent'} · currently unverified/inactive</option> : null}{assignable.map((agent) => <option key={agent.agent_id} value={agent.agent_id}>{agent.full_name || agent.email} · {agent.role}</option>)}</NativeSelect><p className="mt-1 text-xs text-muted-foreground">Assignment changes the follow-up owner and preserves the original introducing agent.</p>{!assignable.length && !agentError ? <p className="mt-1 text-xs text-amber-700">No active verified agents are available. Review agents before assigning.</p> : null}</div><div><Label htmlFor="inquiry-customer-link" className="mb-2 block">Link an existing customer</Label><SearchableSelect id="inquiry-customer-link" value={draft.customerId} onValueChange={(value) => setDraft((current) => ({ ...current, customerId: value }))} options={customerOptions} disabled={saving || !canEdit || Boolean(selected.customer_profile_id)} placeholder="Keep unlinked or choose a reviewed customer" clearLabel="Leave inquiry unlinked" searchPlaceholder="Search customer name, phone, email, or code" /><p className="mt-1 text-xs text-muted-foreground">{selected.customer_profile_id ? 'This portal inquiry belongs to its existing customer account; its account link is fixed.' : 'Linking does not merge customers or change customer account ownership.'}</p>{customersError ? <p role="alert" className="mt-2 text-sm text-destructive">{customersError}</p> : null}</div><div><p className="text-sm font-semibold">Possible existing customer matches</p><p className="mt-1 text-xs text-muted-foreground">Compare the contact details before linking. Suggestions never merge records automatically.</p>{selected.duplicate_candidates?.length ? <div className="mt-2 space-y-2">{selected.duplicate_candidates.map((customer) => <div key={customer.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3', draft.customerId === customer.id && 'border-primary bg-primary/5')}><div><p className="text-sm font-medium">{customer.full_name}</p><p className="break-all text-xs text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(' · ')}</p></div><Button type="button" variant="outline" size="sm" disabled={saving || !canEdit || Boolean(selected.customer_profile_id)} onClick={() => setDraft((value) => ({ ...value, customerId: customer.id }))}>{draft.customerId === customer.id ? <CheckCircle2 className="h-4 w-4" /> : null}{draft.customerId === customer.id ? 'Selected for linking' : 'Select this customer'}</Button></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No contact match was found.</p>}</div></div> : null}
          <div><Label htmlFor="inquiry-note" className="mb-2 block">Add a follow-up note</Label><Textarea id="inquiry-note" placeholder="Call outcome, quotation details, or agreed next step" maxLength={5000} rows={3} value={draft.note} disabled={!canEdit || saving} onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))} /></div>
          {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
          {canEdit ? <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={closeInquiry}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save inquiry</Button></div> : null}
          <div className="border-t pt-4"><h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />Activity</h3>{eventsLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading activity…</p> : eventsError ? <p role="alert" className="mt-2 text-sm text-destructive">{eventsError}</p> : events.length ? <ol className="mt-3 space-y-3">{events.map((item) => <li key={item.id} className="border-l-2 border-border pl-3"><p className="text-sm font-medium">{item.event_type.replace(/_/g, ' ')} · {item.actor_name || 'System'}</p>{item.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.created_at)}</p></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">No activity has been recorded yet.</p>}</div>
        </form> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={manualOpen} onOpenChange={(open) => { if (!manualSaving) setManualOpen(open); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add customer inquiry</DialogTitle><DialogDescription>Log a WhatsApp message, phone call, or other customer conversation. An administrator assigns the follow-up agent.</DialogDescription></DialogHeader>
        <form onSubmit={createInquiry} className="space-y-4">
          <div><Label htmlFor="manual-name">Customer name</Label><Input id="manual-name" value={manual.name} onChange={(event) => setManual((value) => ({ ...value, name: event.target.value }))} maxLength={120} required disabled={manualSaving} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="manual-email">Email</Label><Input id="manual-email" type="email" value={manual.email} onChange={(event) => setManual((value) => ({ ...value, email: event.target.value }))} maxLength={254} disabled={manualSaving} /></div><div><Label htmlFor="manual-phone">Phone / WhatsApp</Label><Input id="manual-phone" type="tel" value={manual.phone} onChange={(event) => setManual((value) => ({ ...value, phone: event.target.value }))} maxLength={40} placeholder="+971…" disabled={manualSaving} /></div></div><p className="text-xs text-muted-foreground">Enter at least one contact method.</p>
          <div><Label htmlFor="manual-source">Conversation source</Label><NativeSelect id="manual-source" value={manual.source} disabled={manualSaving} onChange={(event) => setManual((value) => ({ ...value, source: event.target.value as ManualDraft['source'] }))}><option value="manual">Manual / other conversation</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone call</option></NativeSelect></div>
          <div><Label htmlFor="manual-product-kind">Related product (optional)</Label><NativeSelect id="manual-product-kind" value={manual.productKind} disabled={manualSaving} onChange={(event) => setManual((value) => ({ ...value, productKind: event.target.value as ManualDraft['productKind'], productId: '' }))}><option value="none">No specific product</option><option value="part">Part</option><option value="vehicle">Vehicle</option></NativeSelect></div>
          {manual.productKind !== 'none' ? <div><Label htmlFor="manual-product" className="mb-2 block">Choose {manual.productKind}</Label><SearchableSelect id="manual-product" value={manual.productId} onValueChange={(value) => setManual((current) => ({ ...current, productId: value }))} options={productOptions} disabled={manualSaving || productsLoading} placeholder={productsLoading ? 'Loading products…' : 'Choose a product or leave empty'} searchPlaceholder="Search loaded products" /><p className="mt-1 text-xs text-muted-foreground">Up to 300 accessible products are loaded. Include a stock reference in the message if it is not listed.</p></div> : null}
          <div><Label htmlFor="manual-message">Customer request and conversation details</Label><Textarea id="manual-message" value={manual.message} onChange={(event) => setManual((value) => ({ ...value, message: event.target.value }))} required maxLength={5000} rows={4} disabled={manualSaving} /></div>
          {manualError ? <p role="alert" className="text-sm text-destructive">{manualError}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={manualSaving} onClick={() => setManualOpen(false)}>Cancel</Button><Button type="submit" disabled={manualSaving || !mayCreate}>{manualSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Log inquiry</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
