import Image from 'next/image';
import { InvoiceBankingDetails } from '@/components/invoices/invoice-banking-details';
import { InvoiceQrCode } from '@/components/invoices/invoice-qr-code';
import { siteConfig } from '@/lib/site-config';

export type InvoicePrintItem = {
  id: string;
  description: string;
  inventory_reference: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
  line_total: number;
};

export type InvoicePrintData = {
  invoice_number: string;
  document_type: string;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_tax_registration_number: string | null;
  seller_name: string;
  seller_tax_registration_number: string;
  seller_address: string;
  issue_date: string;
  due_date: string;
  currency: string;
  reference: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  terms: string | null;
  verification_code: string;
  verification_enabled: boolean;
};

const DOCUMENT_TITLES: Record<string, string> = {
  delivery_note: 'Delivery Note',
  tax_invoice: 'Tax Invoice',
  proforma_invoice: 'Proforma Invoice',
  quotation: 'Quotation',
  purchase_invoice: 'Purchase Invoice',
  commercial_invoice: 'Commercial Invoice',
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(value || 0);
}

function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function InvoicePrintDocument({
  invoice,
  items,
}: {
  invoice: InvoicePrintData;
  items: InvoicePrintItem[];
}) {
  const documentTitle = DOCUMENT_TITLES[invoice.document_type] || 'Invoice';
  const sellerName = invoice.seller_name?.trim() || siteConfig.name;
  const sellerAddress = invoice.seller_address?.trim() || siteConfig.address;
  const sellerTrn = invoice.seller_tax_registration_number?.trim() || siteConfig.taxRegistrationNumber;
  const verificationUrl = `${siteConfig.url}/verify/invoice/${invoice.verification_code}`;

  return (
    <article className="invoice-print invoice-a4 bg-white text-[#111827]">
      <header className="invoice-a4-header flex items-start justify-between gap-6 border-b border-[#111827]/15 pb-5">
        <div className="min-w-0 flex-1">
          <Image
            src="/images/ansha-logo-transparent.webp"
            alt={siteConfig.name}
            width={1000}
            height={497}
            priority
            className="h-14 w-auto max-w-[11rem] object-contain sm:h-16"
          />
          <div className="mt-3 text-[11px] leading-relaxed text-[#374151]">
            <p className="text-sm font-semibold text-[#111827]">{sellerName}</p>
            <p className="max-w-[16rem]">{sellerAddress}</p>
            <p>TRN {sellerTrn}</p>
            <p>{siteConfig.phone} · {siteConfig.email}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6b7280]">{documentTitle}</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#111827] sm:text-2xl">{invoice.invoice_number}</h1>
          <dl className="mt-3 space-y-1 text-[11px] text-[#374151]">
            <div className="flex justify-end gap-2"><dt className="text-[#6b7280]">Issue</dt><dd className="font-medium text-[#111827]">{formatDate(invoice.issue_date)}</dd></div>
            <div className="flex justify-end gap-2"><dt className="text-[#6b7280]">Due</dt><dd className="font-medium text-[#111827]">{formatDate(invoice.due_date)}</dd></div>
            {invoice.reference && (
              <div className="flex justify-end gap-2"><dt className="text-[#6b7280]">Ref</dt><dd className="font-medium text-[#111827]">{invoice.reference}</dd></div>
            )}
            <div className="flex justify-end gap-2"><dt className="text-[#6b7280]">Currency</dt><dd className="font-medium text-[#111827]">{invoice.currency}</dd></div>
          </dl>
        </div>
      </header>

      <section className="mt-5 grid gap-4 border-b border-[#111827]/10 pb-5 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">Bill to</p>
          <div className="mt-2 text-[12px] leading-relaxed">
            <p className="font-semibold text-[#111827]">{invoice.customer_company || invoice.customer_name}</p>
            {invoice.customer_company && <p>{invoice.customer_name}</p>}
            {invoice.customer_address && <p className="mt-1 whitespace-pre-line text-[#4b5563]">{invoice.customer_address}</p>}
            <div className="mt-1 space-y-0.5 text-[#4b5563]">
              {invoice.customer_email && <p>{invoice.customer_email}</p>}
              {invoice.customer_phone && <p>{invoice.customer_phone}</p>}
              {invoice.customer_tax_registration_number && <p>TRN {invoice.customer_tax_registration_number}</p>}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-[#111827]/10 bg-[#f9fafb] px-4 py-3 sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">Amount due</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#111827]">{money(invoice.balance_due, invoice.currency)}</p>
          <p className="mt-1 text-[11px] text-[#6b7280]">Total {money(invoice.total_amount, invoice.currency)}</p>
        </div>
      </section>

      <div className="mt-5 overflow-hidden rounded-md border border-[#111827]/12">
        <table className="invoice-a4-table w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#111827] text-left text-[10px] uppercase tracking-wider text-white">
              <th className="px-3 py-2.5 font-semibold">Description</th>
              <th className="w-12 px-2 py-2.5 text-right font-semibold">Qty</th>
              <th className="w-20 px-2 py-2.5 text-right font-semibold">Unit</th>
              <th className="w-14 px-2 py-2.5 text-right font-semibold">Disc</th>
              <th className="w-12 px-2 py-2.5 text-right font-semibold">VAT</th>
              <th className="w-24 px-3 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]'}>
                <td className="border-t border-[#e5e7eb] px-3 py-2.5 align-top">
                  <p className="whitespace-pre-line font-medium text-[#111827]">{item.description}</p>
                  {item.inventory_reference && (
                    <p className="mt-0.5 font-mono text-[9px] text-[#6b7280]">Ref {item.inventory_reference}</p>
                  )}
                </td>
                <td className="border-t border-[#e5e7eb] px-2 py-2.5 text-right tabular-nums">{item.quantity}</td>
                <td className="border-t border-[#e5e7eb] px-2 py-2.5 text-right tabular-nums">{money(item.unit_price, invoice.currency)}</td>
                <td className="border-t border-[#e5e7eb] px-2 py-2.5 text-right tabular-nums">{item.discount_percent}%</td>
                <td className="border-t border-[#e5e7eb] px-2 py-2.5 text-right tabular-nums">{item.tax_rate}%</td>
                <td className="border-t border-[#e5e7eb] px-3 py-2.5 text-right font-semibold tabular-nums">{money(item.line_total, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          {(invoice.notes || invoice.terms) && (
            <div className="grid gap-3 text-[11px] sm:grid-cols-2">
              {invoice.notes && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">Notes</p>
                  <p className="mt-1 whitespace-pre-line leading-relaxed text-[#4b5563]">{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">Payment terms</p>
                  <p className="mt-1 whitespace-pre-line leading-relaxed text-[#4b5563]">{invoice.terms}</p>
                </div>
              )}
            </div>
          )}
          <InvoiceBankingDetails compact />
        </div>

        <div className="w-full shrink-0 sm:w-56">
          <dl className="space-y-1.5 rounded-md border border-[#111827]/12 bg-[#f9fafb] px-3 py-3 text-[11px]">
            <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">Subtotal</dt><dd className="tabular-nums">{money(invoice.subtotal, invoice.currency)}</dd></div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">Discount</dt><dd className="tabular-nums">−{money(invoice.discount_amount, invoice.currency)}</dd></div>
            )}
            <div className="flex justify-between gap-3"><dt className="text-[#6b7280]">VAT</dt><dd className="tabular-nums">{money(invoice.tax_amount, invoice.currency)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-[#111827]/10 pt-2 text-sm font-bold"><dt>Total</dt><dd className="tabular-nums">{money(invoice.total_amount, invoice.currency)}</dd></div>
            <div className="flex justify-between gap-3 text-emerald-800"><dt>Paid</dt><dd className="tabular-nums">{money(invoice.amount_paid, invoice.currency)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-[#111827]/10 pt-2 text-sm font-bold"><dt>Balance due</dt><dd className="tabular-nums">{money(invoice.balance_due, invoice.currency)}</dd></div>
          </dl>
        </div>
      </section>

      {invoice.verification_enabled && (
        <div className="mt-5 border-t border-[#111827]/10 pt-4">
          <InvoiceQrCode
            verificationUrl={verificationUrl}
            verificationCode={invoice.verification_code}
          />
        </div>
      )}

      <footer className="mt-5 border-t border-[#111827]/10 pt-3 text-center text-[9px] leading-relaxed text-[#6b7280]">
        Authenticate this {documentTitle.toLowerCase()} by scanning the QR code or entering the verification code on the official ANSHA verify page.
        UAE e-invoicing may require transmission through an accredited service provider when applicable.
      </footer>
    </article>
  );
}
