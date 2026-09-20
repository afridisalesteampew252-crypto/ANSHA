'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileText, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { siteConfig } from '@/lib/site-config';
import { supabase } from '@/lib/supabase/client';

type LinkedInvoice = {
  item_id: string;
  description: string | null;
  line_total: number;
  id: string;
  invoice_number: string;
  status: string;
  document_type: string;
  issue_date: string;
  total_amount: number;
  currency: string;
  balance_due: number;
  verification_code: string;
  verification_enabled: boolean;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: currency || 'AED' }).format(Number(value || 0));

const docLabel = (type: string) =>
  type
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

type Props = {
  vehicleId?: string | null;
  partId?: string | null;
};

export function StockLinkedInvoices({ vehicleId, partId }: Props) {
  const [rows, setRows] = useState<LinkedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!vehicleId && !partId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    let query = supabase
      .from('invoice_items')
      .select(
        'id, description, line_total, invoices!inner(id, invoice_number, status, document_type, issue_date, total_amount, currency, balance_due, verification_code, verification_enabled)'
      )
      .order('created_at', { ascending: false });
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (partId) query = query.eq('part_id', partId);

    const { data, error: queryError } = await query;
    setLoading(false);
    if (queryError) {
      setError(queryError.message);
      setRows([]);
      return;
    }

    const mapped: LinkedInvoice[] = [];
    for (const row of data || []) {
      const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
      if (!inv || inv.status === 'cancelled') continue;
      mapped.push({
        item_id: row.id,
        description: row.description,
        line_total: Number(row.line_total || 0),
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        document_type: inv.document_type,
        issue_date: inv.issue_date,
        total_amount: Number(inv.total_amount || 0),
        currency: inv.currency,
        balance_due: Number(inv.balance_due || 0),
        verification_code: inv.verification_code,
        verification_enabled: Boolean(inv.verification_enabled),
      });
    }
    // Deduplicate by invoice when multiple lines point at same doc
    const seen = new Set<string>();
    setRows(
      mapped.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
    );
  }, [vehicleId, partId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4" />
          Invoices &amp; documents
        </CardTitle>
        <CardDescription>
          Proformas and invoices that include this stock unit — open, print, or verify.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices linked to this item yet.</p>
        ) : (
          rows.map((row) => {
            const verifyUrl = `${siteConfig.url}/verify/invoice/${row.verification_code}`;
            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">
                    <Link href={`/admin/invoices/${row.id}`} className="hover:underline">
                      {row.invoice_number}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {docLabel(row.document_type)} · {row.issue_date} ·{' '}
                    <span className="capitalize">{row.status.replaceAll('_', ' ')}</span>
                  </p>
                  <p className="text-sm font-medium">
                    {money(row.total_amount, row.currency)}
                    {row.balance_due > 0 ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Balance {money(row.balance_due, row.currency)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/invoices/${row.id}`}>Open</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/invoices/${row.id}`} target="_blank">
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </Link>
                  </Button>
                  {row.verification_enabled ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={verifyUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Verify
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
