'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';

type DeletionRequest = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
  requested_at: string;
  review_note: string | null;
};

export default function PortalSettingsPage() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, status, requested_at, review_note')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) toast.error(error.message);
    setRequest((data as DeletionRequest | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRequest = async () => {
    if (!window.confirm('Request permanent deletion of your portal account and personal profile data?')) return;
    setSaving(true);
    const { error } = await supabase.rpc('request_my_account_deletion', { p_reason: reason.trim() || null });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Deletion request sent to the administrator.');
    setReason('');
    await load();
  };

  const cancelRequest = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('cancel_my_account_deletion');
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Deletion request cancelled.');
    await load();
  };

  const openRequest = request?.status === 'pending' || request?.status === 'approved';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portal settings</h1>
        <p className="text-sm text-muted-foreground">Manage your customer portal account and privacy request.</p>
      </div>

      <Card className="border-destructive/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Delete account
          </CardTitle>
          <CardDescription>
            Request permanent deletion of your login and personal portal profile. An administrator reviews the
            request to protect financial records and prevent fraudulent deletion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : openRequest ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Deletion request submitted</p>
                <Badge variant="outline" className="capitalize">{request.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Access and personal profile data will be removed after administrator approval. Financial records
                required for legal, tax, fraud-prevention, or audit purposes may be retained in anonymized form.
              </p>
              {request.status === 'pending' ? (
                <Button type="button" variant="outline" onClick={() => void cancelRequest()} disabled={saving}>
                  <XCircle className="h-4 w-4" />
                  Cancel request
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="deletion-reason">Reason (optional)</Label>
                <textarea
                  id="deletion-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Tell us anything the reviewer should know."
                />
              </div>
              {request?.status === 'rejected' && request.review_note ? (
                <p className="rounded-md bg-secondary/50 p-3 text-sm">Previous review: {request.review_note}</p>
              ) : null}
              <Button type="button" variant="destructive" onClick={() => void submitRequest()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Request account deletion
              </Button>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Read the public <Link href="/account-deletion" className="underline">account deletion information</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
