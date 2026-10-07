'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Loader2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { PasswordInput } from '@/components/auth/password-input';

type DeletionRequest = { id: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed'; requested_at: string; review_note: string | null };

export default function PortalSettingsPage() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [reason, setReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('account_deletion_requests').select('id,status,requested_at,review_note').order('requested_at', { ascending: false }).limit(1).maybeSingle();
    if (error) toast.error(error.message);
    setRequest((data as DeletionRequest | null) ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match.');
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) return toast.error(error.message);
    setNewPassword(''); setConfirmPassword('');
    toast.success('Password updated successfully.');
  };

  const submitRequest = async () => {
    if (!window.confirm('Request permanent deletion of your portal account and personal profile data?')) return;
    setSaving(true);
    const { error } = await supabase.rpc('request_my_account_deletion', { p_reason: reason.trim() || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Deletion request sent to the administrator.'); setReason(''); await load();
  };

  const cancelRequest = async () => {
    setSaving(true); const { error } = await supabase.rpc('cancel_my_account_deletion'); setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Deletion request cancelled.'); await load();
  };

  const openRequest = request?.status === 'pending' || request?.status === 'approved';
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/60 bg-gradient-to-br from-cyan-500/10 via-background/90 to-violet-500/10 p-5 shadow-lg backdrop-blur-xl dark:border-white/10 sm:p-6">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-white"><ShieldCheck className="h-5 w-5" /></span><div><h1 className="text-2xl font-black tracking-tight">Security & privacy</h1><p className="text-sm text-muted-foreground">Manage your password and account deletion request.</p></div></div>
      </section>

      <Card className="border-white/60 bg-card/85 shadow-lg backdrop-blur-xl dark:border-white/10">
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent" />Change password</CardTitle><CardDescription>Use at least 8 characters. This updates your customer portal login immediately.</CardDescription></CardHeader>
        <CardContent><form onSubmit={changePassword} className="grid max-w-2xl gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-password">New password</Label><PasswordInput id="new-password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><PasswordInput id="confirm-password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div><Button type="submit" className="sm:col-span-2 sm:w-fit" disabled={passwordSaving}>{passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Update password</Button></form></CardContent>
      </Card>

      <Card className="border-destructive/25 bg-card/85 shadow-lg backdrop-blur-xl">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldAlert className="h-5 w-5 text-destructive" />Delete account</CardTitle><CardDescription>Request permanent deletion of your login and personal portal profile. An administrator reviews the request to protect financial records and prevent fraudulent deletion.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : openRequest ? (
            <div className="space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Deletion request submitted</p><Badge variant="outline" className="capitalize">{request.status}</Badge></div><p className="text-sm text-muted-foreground">Access and personal profile data will be removed after administrator approval. Financial records required for legal, tax, fraud-prevention or audit purposes may be retained in anonymized form.</p>{request.status === 'pending' ? <Button type="button" variant="outline" onClick={() => void cancelRequest()} disabled={saving}><XCircle className="h-4 w-4" />Cancel request</Button> : null}</div>
          ) : <><div className="space-y-2"><Label htmlFor="deletion-reason">Reason (optional)</Label><textarea id="deletion-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Tell us anything the reviewer should know." /></div>{request?.status === 'rejected' && request.review_note ? <p className="rounded-md bg-secondary/50 p-3 text-sm">Previous review: {request.review_note}</p> : null}<Button type="button" variant="destructive" onClick={() => void submitRequest()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Request account deletion</Button></>}
          <p className="text-xs text-muted-foreground">Read the public <Link href="/account-deletion" className="underline">account deletion information</Link>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
