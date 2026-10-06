import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Download, ShieldCheck, Smartphone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Download ANSHA Android Apps',
  description: 'Download the ANSHA customer and staff Android apps.',
};

const customerApkUrl = '/downloads/ansha-trading-mobile.apk?v=1.4';
const adminApkUrl = '/downloads/ansha-admin.apk?v=1.3';

export default function DownloadPage() {
  return (
    <main className="min-h-[70vh] bg-[#f4f6f8] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to ANSHA website</Link>
        <section className="relative mt-5 overflow-hidden rounded-[2rem] bg-[#17191d] p-6 text-white shadow-xl sm:p-10">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#d21e1e]/35 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.16em] text-red-200"><Smartphone className="h-4 w-4" />Official Android downloads</span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">Choose your ANSHA app.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/65">Customers can browse stock and manage their account. Authorized staff can open the protected ANSHA admin workspace.</p>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#d21e1e]">For customers</p>
            <h2 className="mt-2 text-2xl font-black">ANSHA Trading</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Mobile catalog, offers, inquiries, invoices, account access, and customer support.</p>
            <a href={customerApkUrl} download className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d21e1e] px-5 text-sm font-black text-white hover:bg-red-600"><Download className="h-5 w-5" />Download customer APK</a>
            <p className="mt-3 text-xs text-muted-foreground">com.anshatrading.app · Version 1.4 · Updated 6 October 2026</p>
          </article>
          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#d21e1e]">Authorized staff only</p>
            <h2 className="mt-2 text-2xl font-black">ANSHA Admin</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Protected staff dashboard for inventory, customers, finance, exports, and operations.</p>
            <a href={adminApkUrl} download className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#17191d] px-5 text-sm font-black text-white hover:bg-black"><Download className="h-5 w-5" />Download admin APK</a>
            <p className="mt-3 text-xs text-muted-foreground">com.anshatrading.admin · Version 1.3 · Updated 6 October 2026</p>
          </article>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          {['Live vehicles and parts', 'Same ANSHA customer account', 'Admin-controlled offers and support'].map((text) => <div key={text} className="flex items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold shadow-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#d21e1e]" />{text}</div>)}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-black">Latest customer app update</h2>
          <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>Branded ANSHA app icon and improved screen safe areas</li>
            <li>Customer portal home with account shortcuts</li>
            <li>Tracked inquiries for vehicles and parts</li>
            <li>Support reply alerts and direct inbox opening</li>
            <li>Invoices, account statement, and secure support</li>
          </ul>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#d21e1e]" /><div><h2 className="text-xl font-black">How to install on Android</h2><ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><li><strong className="text-foreground">1. Choose</strong> the customer or admin APK above.</li><li><strong className="text-foreground">2. Open</strong> the downloaded file from your browser or Downloads folder.</li><li><strong className="text-foreground">3. Allow installation</strong> from this browser when Android asks for permission.</li><li><strong className="text-foreground">4. Install and open.</strong> Staff must sign in with an authorized ANSHA account.</li></ol><p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">These are direct-install test builds. If Android says the app cannot be updated, uninstall the older ANSHA app first, then install this version and sign in again.</p></div></div>
        </section>
      </div>
    </main>
  );
}
