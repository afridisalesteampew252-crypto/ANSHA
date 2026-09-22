'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

type RequestRow = {
  id: string;
  email_snapshot: string;
  reason: string | null;
  status: string;
  requested_at: string;
  review_note: string | null;
};

export default function AccountDeletionAdminPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, email_snapshot, reason, status, requested_at, review_note')
      .order('requested_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as RequestRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (row: RequestRow, action: 'approve' | 'reject') => {
    const promptText = action === 'approve'
      ? 'Approve permanent account deletion? The login and personal customer data will be removed.'
      : 'Optional reason for rejecting this request:';
    const note = action === 'approve'
      ? (window.confirm(promptText) ? '' : null)
      : window.prompt(promptText, '');
    if (note === null) return;

    setWorkingId(row.id);
    const { data, error } = await supabase.functions.invoke('portal-delete-account', {
      body: { request_id: row.id, action, review_note: note },
    });
    setWorkingId(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Review failed.');
      return;
    }
    toast.success(action === 'approve' ? 'Account deletion completed.' : 'Deletion request rejected.');
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account deletion requests</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only queue. Approval removes the Auth login, anonymizes customer PII, and keeps statutory transaction records.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5" />
            Review queue
          </CardTitle>
          <CardDescription>Confirm ownership concerns before approving. Do not reject a valid request merely to retain the account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No account deletion requests.</p>
          ) : rows.map((row) => (
            <div key={row.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.email_snapshot}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(row.requested_at), 'dd MMM yyyy, HH:mm')}</p>
                  {row.reason ? <p className="mt-2 text-sm">{row.reason}</p> : null}
                  {row.review_note ? <p className="mt-2 text-xs text-muted-foreground">Review: {row.review_note}</p> : null}
                </div>
                <Badge variant="outline" className="capitalize">{row.status}</Badge>
              </div>
              {row.status === 'pending' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void review(row, 'approve')} disabled={workingId === row.id}>
                    {workingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve & delete
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void review(row, 'reject')} disabled={workingId === row.id}>
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
