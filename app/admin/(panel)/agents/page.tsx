'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, Loader2, Pencil, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  AGENT_VERIFICATION_LABEL, AGENT_VERIFICATION_STATUSES, canShareAgentReferral,
  normalizeSalesAgentContact, salesAgentReferralUrl, validateSalesAgentContact,
  type AgentVerificationStatus, type SalesAgentContact, type SalesAgentVerification,
} from '@/lib/agent-verification';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Viewer = { id: string; role: 'admin' | 'sales' | 'freelancer' };
const emptyContact: SalesAgentContact = { full_name: '', email: '', phone: '' };

export default function AgentsPage() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [agents, setAgents] = useState<SalesAgentVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AgentVerificationStatus | 'all'>('all');
  const [editingAgent, setEditingAgent] = useState<SalesAgentVerification | null>(null);
  const [contact, setContact] = useState<SalesAgentContact>(emptyContact);
  const [reviewingAgent, setReviewingAgent] = useState<SalesAgentVerification | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AgentVerificationStatus>('verified');
  const [reviewNote, setReviewNote] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [sharedLink, setSharedLink] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Sign in to view agent verification.');
      const { data: profile, error: profileError } = await supabase.from('admin_profiles')
        .select('id,role,is_active').eq('id', user.id).maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile?.is_active || !['admin', 'sales', 'freelancer'].includes(profile.role)) {
        setViewer(null);
        setAgents([]);
        throw new Error('This page is available to active admins, sales agents and freelancers.');
      }
      setViewer({ id: user.id, role: profile.role as Viewer['role'] });
      const { data, error: agentsError } = await supabase.rpc('get_sales_agents');
      if (agentsError) throw new Error(agentsError.message);
      if (!Array.isArray(data)) throw new Error('The agent list could not be loaded.');
      setAgents(data as SalesAgentVerification[]);
    } catch (cause) {
      setAgents([]);
      setError(cause instanceof Error ? cause.message : 'Unable to load agent verification.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function editContact(agent: SalesAgentVerification) {
    setEditingAgent(agent);
    setContact({ full_name: agent.full_name, email: agent.email, phone: agent.phone });
    setDialogError('');
  }

  function openReview(agent: SalesAgentVerification) {
    setReviewingAgent(agent);
    setReviewStatus(agent.is_active ? 'verified' : 'suspended');
    setReviewNote('');
    setDialogError('');
  }

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    if (!editingAgent || busy) return;
    const validation = validateSalesAgentContact(contact);
    if (validation) { setDialogError(validation); return; }
    setBusy(true);
    setDialogError('');
    try {
      const normalized = normalizeSalesAgentContact(contact);
      const { data, error: saveError } = await supabase.rpc('save_sales_agent_contact', {
        p_agent_id: editingAgent.agent_id, p_full_name: normalized.full_name,
        p_email: normalized.email, p_phone: normalized.phone,
      });
      if (saveError) throw new Error(saveError.message);
      setMessage(data?.verification_status === 'suspended'
        ? 'Contact details saved. The account remains suspended until an admin reviews it.'
        : data?.verification_status === 'verified'
          ? 'Contact details were unchanged. Admin verification is still current.'
          : 'Contact details saved for admin review.');
      setSharedLink('');
      setEditingAgent(null);
      await load();
    } catch (cause) { setDialogError(cause instanceof Error ? cause.message : 'Unable to save contact details.'); }
    finally { setBusy(false); }
  }

  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewingAgent || viewer?.role !== 'admin' || busy) return;
    if (['rejected', 'suspended'].includes(reviewStatus) && !reviewNote.trim()) {
      setDialogError('Enter a reason for rejecting or suspending this agent.');
      return;
    }
    setBusy(true);
    setDialogError('');
    try {
      const { error: reviewError } = await supabase.rpc('review_sales_agent', {
        p_agent_id: reviewingAgent.agent_id, p_status: reviewStatus, p_note: reviewNote.trim() || null,
        p_expected_contact: { full_name: reviewingAgent.full_name, email: reviewingAgent.email, phone: reviewingAgent.phone },
      });
      if (reviewError) throw new Error(reviewError.message);
      setMessage(`Review saved: ${AGENT_VERIFICATION_LABEL[reviewStatus].toLowerCase()}.`);
      setSharedLink('');
      setReviewingAgent(null);
      await load();
    } catch (cause) { setDialogError(cause instanceof Error ? cause.message : 'Unable to save the review.'); }
    finally { setBusy(false); }
  }

  async function copyReferral(agent: SalesAgentVerification) {
    const url = salesAgentReferralUrl(agent, window.location.origin);
    if (!url) return;
    setSharedLink(url);
    setError('');
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Public referral link copied. Share it with a customer before they submit an inquiry.');
    } catch {
      setMessage('Select and copy the referral link below.');
    }
  }

  if (loading) return <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="sr-only">Loading agent verification</span></div>;
  const isAdmin = viewer?.role === 'admin';
  const query = search.trim().toLowerCase();
  const visibleAgents = agents.filter((agent) => (filter === 'all' || agent.verification_status === filter) &&
    (!query || [agent.full_name, agent.email, agent.phone].some((value) => value.toLowerCase().includes(query))));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isAdmin ? 'Agent verification' : 'My agent verification'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {isAdmin ? 'Review sales and freelancer contact details before enabling their referral links and assigned inquiry work.'
              : 'Submit your name, phone and email for admin review. Verified agents can share their referral link and work on assigned inquiries.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />{message}</p> : null}
      {viewer ? <>
        <p className="rounded-lg border bg-secondary/30 p-4 text-sm text-muted-foreground">
          An admin manually reviews these contact details. Changing reviewed details requires another review. Contact email is separate from your sign-in email.
        </p>
        {isAdmin ? <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AGENT_VERIFICATION_STATUSES.map((status) => <button key={status} type="button"
              onClick={() => setFilter(filter === status ? 'all' : status)}
              aria-pressed={filter === status}
              className={`rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent ${filter === status ? 'border-primary ring-1 ring-primary' : ''}`}>
              <p className="text-2xl font-bold">{agents.filter((agent) => agent.verification_status === status).length}</p>
              <p className="mt-1 text-xs text-muted-foreground">{AGENT_VERIFICATION_LABEL[status]}</p>
            </button>)}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5"><Label htmlFor="agent-search">Find an agent</Label><Input id="agent-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone or email" /></div>
            <div className="space-y-1.5"><Label htmlFor="agent-filter">Verification status</Label><select id="agent-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option>{AGENT_VERIFICATION_STATUSES.map((status) => <option key={status} value={status}>{AGENT_VERIFICATION_LABEL[status]}</option>)}</select></div>
          </div>
        </> : null}
        {sharedLink ? <div className="space-y-1.5 rounded-lg border bg-card p-4"><Label htmlFor="agent-share-link">Public referral link</Label><Input id="agent-share-link" value={sharedLink} readOnly onFocus={(event) => event.target.select()} /><p className="text-xs text-muted-foreground">Customers can submit an inquiry from this link. Assignment is handled by an admin.</p></div> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleAgents.map((agent) => <Card key={agent.agent_id}>
            <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5 text-primary" />{agent.full_name || 'Contact details needed'}</CardTitle><Badge variant={agent.verification_status === 'verified' && agent.is_active ? 'default' : 'secondary'}>{AGENT_VERIFICATION_LABEL[agent.verification_status]}</Badge></div><p className="text-xs capitalize text-muted-foreground">{agent.role}{agent.is_active ? '' : ' · Inactive account'}</p></CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Contact email</dt><dd className="break-all">{agent.email || 'Not submitted'}</dd></div><div><dt className="text-xs text-muted-foreground">Contact phone</dt><dd>{agent.phone || 'Not submitted'}</dd></div></dl>
              {agent.review_note ? <p className="rounded-lg border bg-secondary/30 p-3 text-sm"><span className="font-medium">Admin note: </span>{agent.review_note}</p> : null}
              {agent.reviewed_at ? <p className="text-xs text-muted-foreground">Last reviewed {new Date(agent.reviewed_at).toLocaleString()}</p> : null}
              {!agent.is_active ? <p className="text-sm text-muted-foreground">Referral intake and assigned inquiry work are disabled while this account is inactive.</p> : agent.verification_status === 'pending' ? <p className="text-sm text-muted-foreground">{agent.referral_code ? 'Contact submitted. Waiting for admin review.' : 'Save complete contact details to request review.'}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => editContact(agent)} disabled={busy}><Pencil className="h-4 w-4" />{agent.referral_code ? 'Edit contact' : 'Submit contact'}</Button>
                {isAdmin ? <Button onClick={() => openReview(agent)} disabled={busy || !agent.referral_code}><ShieldCheck className="h-4 w-4" />Review agent</Button> : null}
                {canShareAgentReferral(agent) ? <Button variant="outline" onClick={() => void copyReferral(agent)} disabled={busy}><Copy className="h-4 w-4" />Copy referral link</Button> : null}
              </div>
              {!isAdmin && canShareAgentReferral(agent) ? <Link href="/admin/inquiries" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Open my inquiries</Link> : null}
            </CardContent>
          </Card>)}
        </div>
        {visibleAgents.length === 0 ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{isAdmin ? 'No matching sales or freelancer accounts. Create agent accounts under Team → Users.' : 'Your agent record could not be loaded. Refresh this page or contact an admin.'}</p> : null}
      </> : null}

      <Dialog open={Boolean(editingAgent)} onOpenChange={(open) => { if (!open && !busy) setEditingAgent(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{isAdmin ? 'Edit agent contact' : 'My contact details'}</DialogTitle><DialogDescription>Provide the name, phone and email the admin should review. Changes to verified details return the record to pending review.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void saveContact(event)} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="agent-name">Full name</Label><Input id="agent-name" autoComplete="name" value={contact.full_name} onChange={(event) => setContact((current) => ({ ...current, full_name: event.target.value }))} required minLength={2} maxLength={160} disabled={busy} /></div>
            <div className="space-y-1.5"><Label htmlFor="agent-email">Contact email</Label><Input id="agent-email" type="email" autoComplete="email" value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} required maxLength={254} disabled={busy} /></div>
            <div className="space-y-1.5"><Label htmlFor="agent-phone">Contact phone</Label><Input id="agent-phone" type="tel" autoComplete="tel" value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} required maxLength={40} placeholder="+971 50 123 4567" disabled={busy} /></div>
            {dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save contact details</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reviewingAgent)} onOpenChange={(open) => { if (!open && !busy) setReviewingAgent(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Review {reviewingAgent?.full_name}</DialogTitle><DialogDescription>Review the agent&apos;s submitted name, phone and email before approving their access. A reason is required for rejection or suspension.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void saveReview(event)} className="space-y-4">
            <div className="space-y-1 rounded-lg border bg-secondary/30 p-3 text-sm"><p>{reviewingAgent?.full_name}</p><p className="break-all">{reviewingAgent?.email}</p><p>{reviewingAgent?.phone}</p></div>
            <div className="space-y-1.5"><Label htmlFor="agent-review-status">Review decision</Label><select id="agent-review-status" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as AgentVerificationStatus)} disabled={busy} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{AGENT_VERIFICATION_STATUSES.map((status) => <option key={status} value={status} disabled={status === 'verified' && !reviewingAgent?.is_active}>{AGENT_VERIFICATION_LABEL[status]}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="agent-review-note">Admin note</Label><Textarea id="agent-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} required={['rejected', 'suspended'].includes(reviewStatus)} maxLength={2000} disabled={busy} placeholder="Record the reason or review outcome" /><p className="text-xs text-muted-foreground">The agent can read this note.</p></div>
            {dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save review decision</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
