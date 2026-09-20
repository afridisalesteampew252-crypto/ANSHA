'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Paperclip, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { RemittanceSubNav } from '@/components/admin/remittance-sub-nav';
import { Card, CardContent } from '@/components/ui/card';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, Remittance, RemittanceDocument, RemittanceOffice, RemittanceShift } from '@/lib/types';

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(Number(value || 0));

export default function MyRemittancesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [documents, setDocuments] = useState<RemittanceDocument[]>([]);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [shifts, setShifts] = useState<RemittanceShift[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);

  const finance = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    setUserId(session.user.id);
    const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
    setRole((prof?.role as AdminRole) || null);

    const [remRes, docRes, officeRes, shiftRes, unknownRes] = await Promise.all([
      supabase
        .from('remittances')
        .select('*')
        .eq('received_by', session.user.id)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('remittance_documents').select('*').order('created_at'),
      supabase.from('remittance_offices').select('*'),
      supabase.from('remittance_shifts').select('*'),
      canManageReceivables(prof?.role)
        ? supabase.rpc('count_unknown_remittances')
        : Promise.resolve({ data: 0 }),
    ]);

    if (remRes.error) toast.error(remRes.error.message);
    setRemittances((remRes.data || []) as Remittance[]);
    setDocuments((docRes.data || []) as RemittanceDocument[]);
    setOffices((officeRes.data || []) as RemittanceOffice[]);
    setShifts((shiftRes.data || []) as RemittanceShift[]);
    setUnknownCount(Number(unknownRes.data || 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const officeName = useMemo(() => {
    const map = new Map(offices.map((o) => [o.id, o.name]));
    return (id: string | null) => (id ? map.get(id) || '—' : '—');
  }, [offices]);

  const shiftName = useMemo(() => {
    const map = new Map(shifts.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? map.get(id) || '—' : '—');
  }, [shifts]);

  const viewDocument = async (document: RemittanceDocument) => {
    const { data, error } = await supabase.storage.from('remittance-documents').createSignedUrl(document.storage_path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message || 'Could not open document.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Remittances</p>
        <h1 className="text-2xl font-black tracking-tight">My remittances</h1>
        <p className="text-sm text-muted-foreground">
          Remittances where you are the linked receiving staff user. Read-only
          {finance ? ' — use Remittances to edit or allocate.' : '.'}
        </p>
        <RemittanceSubNav canManageFinance={finance} unknownCount={unknownCount} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-4">Record</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Office / shift</th>
                <th className="p-4">Date / TTS</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4">Documents</th>
              </tr>
            </thead>
            <tbody>
              {remittances.map((item) => {
                const docs = documents.filter((d) => d.remittance_id === item.id);
                return (
                  <tr key={item.id} className="border-t align-top">
                    <td className="p-4 font-semibold">{item.remittance_number}</td>
                    <td className="p-4">{item.customer_name}</td>
                    <td className="p-4">
                      {officeName(item.office_id)}
                      <p className="text-xs text-muted-foreground">{shiftName(item.shift_id)}</p>
                    </td>
                    <td className="p-4">
                      {item.received_date}
                      <p className="text-xs text-muted-foreground">{item.bank_reference || 'No reference'}</p>
                    </td>
                    <td className="p-4 text-right font-semibold">{money(item.amount, item.currency)}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                          item.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'unknown' || item.is_unknown
                              ? 'bg-rose-100 text-rose-700'
                              : item.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-4">
                      {docs.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="space-y-1">
                          {docs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => void viewDocument(doc)}
                              className="flex max-w-48 items-center gap-1.5 text-left text-xs text-primary hover:underline"
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{doc.file_name}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {remittances.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-3 h-9 w-9" />
                    No remittances tagged to you yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
