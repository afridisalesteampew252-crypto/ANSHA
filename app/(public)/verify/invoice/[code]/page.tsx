import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Verify Invoice Authenticity',
  description: 'Verify an ANSHA Trading invoice using its secure QR code.',
  robots: { index: false, follow: false, noarchive: true },
};

type VerificationItem = { description: string; quantity: number; unit_price: number; tax_rate: number; line_total: number };
type Verification = {
  valid: boolean; invoice_number?: string; document_type?: string; issue_date?: string; due_date?: string;
  seller_name?: string; seller_tax_registration_number?: string; seller_address?: string;
  customer_name?: string; customer_company?: string; customer_tax_registration_number?: string;
  currency?: string; subtotal?: number; discount_amount?: number; tax_amount?: number; total_amount?: number;
  amount_paid?: number; balance_due?: number; status?: string; provider_status?: string;
  verification_issued_at?: string; line_items?: VerificationItem[];
};

const money = (value: number | undefined, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(Number(value || 0));
const title = (value?: string) => ({ proforma_invoice: 'Proforma Invoice', tax_invoice: 'Tax Invoice', commercial_invoice: 'Commercial Invoice' }[value || ''] || 'Invoice');

export default async function VerifyInvoicePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let result: Verification | null = null;
  if (url && key && /^[0-9a-f-]{36}$/i.test(code)) {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await client.rpc('verify_invoice', { p_verification_code: code });
    result = data as Verification | null;
  }

  if (!result?.valid) {
    return (
      <main className="container-page py-16 sm:py-24">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-600" />
          <h1 className="mt-4 text-2xl font-bold">Invoice could not be verified</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">This QR code is invalid, disabled, or does not belong to an invoice issued by ANSHA Trading. Do not transfer funds until our team confirms the document.</p>
          <Link href="/contact" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Contact ANSHA</Link>
        </div>
      </main>
    );
  }

  const currency = result.currency || 'AED';
  return (
    <main className="bg-secondary/20 py-10 sm:py-16">
      <div className="container-page">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-xl">
          <div className="border-b border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white"><CheckCircle2 className="h-7 w-7" /></span><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Authentic ANSHA document</p><h1 className="text-2xl font-extrabold sm:text-3xl">Invoice verified</h1></div></div>
              <ShieldCheck className="hidden h-12 w-12 text-emerald-600 sm:block" />
            </div>
          </div>

          <div className="space-y-8 p-5 sm:p-8">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Document</p><p className="mt-1 font-bold">{title(result.document_type)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice number</p><p className="mt-1 font-bold">{result.invoice_number}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Issue date</p><p className="mt-1 font-medium">{result.issue_date}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1 font-bold capitalize">{result.status?.replaceAll('_', ' ')}</p></div>
            </section>

            <section className="grid gap-5 rounded-xl border bg-secondary/20 p-4 sm:grid-cols-2 sm:p-5">
              <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Issued by</p><p className="font-bold">{result.seller_name}</p><p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{result.seller_address}</p><p className="mt-1 text-sm">TRN: {result.seller_tax_registration_number}</p></div>
              <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Issued to</p><p className="font-bold">{result.customer_company || result.customer_name}</p>{result.customer_company && <p className="text-sm text-muted-foreground">{result.customer_name}</p>}{result.customer_tax_registration_number && <p className="mt-1 text-sm">TRN: {result.customer_tax_registration_number}</p>}</div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><FileCheck2 className="h-5 w-5 text-primary" />Invoice details</h2>
              <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[560px] text-sm"><thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Unit price</th><th className="p-3 text-right">VAT</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{(result.line_items || []).map((item, index) => <tr key={index} className="border-t"><td className="whitespace-pre-line p-3">{item.description}</td><td className="p-3 text-right">{item.quantity}</td><td className="p-3 text-right">{money(item.unit_price, currency)}</td><td className="p-3 text-right">{item.tax_rate}%</td><td className="p-3 text-right font-medium">{money(item.line_total, currency)}</td></tr>)}</tbody></table></div>
            </section>

            <section className="ml-auto max-w-sm space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(result.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{money(result.tax_amount, currency)}</span></div>
              <div className="flex justify-between border-t pt-3 text-lg font-extrabold"><span>Total</span><span>{money(result.total_amount, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{money(result.amount_paid, currency)}</span></div>
              <div className="flex justify-between font-bold"><span>Balance</span><span>{money(result.balance_due, currency)}</span></div>
            </section>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
              Verification confirms that this invoice record was generated by {siteConfig.name}. It does not by itself confirm that payment has cleared. Always match bank details and invoice status before transferring funds.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
