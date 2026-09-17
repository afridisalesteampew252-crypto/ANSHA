import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, CircleDollarSign, Landmark, MessageCircle, ShieldCheck } from 'lucide-react';
import { BankDetail } from './bank-detail';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Official Banking Information',
  description: 'Official AED and USD intermediary banking details for Ansha Trading Co. L.L.C-FZ.',
  alternates: { canonical: '/banking' },
  robots: { index: false, follow: true },
};

const primaryBank = [
  { label: 'Bank name', value: 'WIO BANK' },
  { label: 'Account holder', value: 'Ansha Trading Co. L.L.C-FZ' },
  { label: 'IBAN', value: 'AE23 0860 0000 0930 7584 798', copyValue: 'AE230860000009307584798' },
  { label: 'BIC / SWIFT', value: 'WIOBAEADXXX' },
  { label: 'Routing code', value: '808610001' },
  { label: 'Bank address', value: 'Etihad Airways Centre, 5th Floor, Abu Dhabi, U.A.E.' },
];

const intermediaryBank = [
  { label: 'Bank name', value: 'CITI BANK NA' },
  { label: 'Account number', value: '36447154' },
  { label: 'Branch name', value: 'CITIBANK, N.A.' },
  { label: 'ABA / routing', value: '021000089' },
  { label: 'SWIFT code', value: 'CITIUS33 or CITIUS33XXX (if required)', copyValue: 'CITIUS33' },
  { label: 'Address', value: '388 Greenwich Street, New York, NY 10013, U.S.A.' },
  { label: 'Branch code', value: '940' },
];

export default function BankingPage() {
  return (
    <div className="bg-background">
      <section className="border-b border-border bg-foreground text-background">
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-background/70">
              <Landmark className="h-3.5 w-3.5 text-accent" />
              Official payment details
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">Banking Information</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-background/65 sm:text-lg">
              Use the account details below for approved payments to Ansha Trading Co. L.L.C-FZ.
              Include your invoice number or order reference with every transfer.
            </p>
          </div>
        </div>
      </section>

      <main className="container-page py-10 sm:py-14 lg:py-16">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Verify before transferring funds</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/75">
                  Confirm the beneficiary name, IBAN, and invoice reference with our official team. Do not accept changed bank details from an unverified email or message.
                </p>
              </div>
            </div>
          </div>
          <Link
            href={`https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent('Hello ANSHA, I would like to verify the official bank details before making a payment.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" />
            Verify on WhatsApp
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary account</p>
                  <h2 className="text-xl font-bold">AED Bank Details</h2>
                </div>
              </div>
            </div>
            <dl className="px-5 sm:px-6">
              {primaryBank.map((detail) => <BankDetail key={detail.label} {...detail} />)}
            </dl>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <CircleDollarSign className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">International transfer</p>
                  <h2 className="text-xl font-bold">USD Intermediary Bank</h2>
                </div>
              </div>
            </div>
            <dl className="px-5 sm:px-6">
              {intermediaryBank.map((detail) => <BankDetail key={detail.label} {...detail} />)}
            </dl>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-secondary/25 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Payment reference</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Add the ANSHA invoice number, proforma invoice number, or sales order reference to the transfer. Send the payment confirmation to {siteConfig.email} or WhatsApp {siteConfig.whatsappDisplay} so the accounts team can reconcile it promptly.
          </p>
        </section>
      </main>
    </div>
  );
}
