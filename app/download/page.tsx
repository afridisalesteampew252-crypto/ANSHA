import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Download, ShieldCheck, Smartphone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Download the ANSHA Android App',
  description: 'Download the ANSHA Trading Android app for live vehicles, parts, offers, invoices, and export support.',
};

const apkUrl = '/downloads/ansha-trading-mobile.apk';

export default function DownloadPage() {
  return (
    <main className="min-h-[70vh] bg-[#f4f6f8] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to ANSHA website</Link>
        <section className="relative mt-5 overflow-hidden rounded-[2rem] bg-[#17191d] p-6 text-white shadow-xl sm:p-10">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#d21e1e]/35 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.16em] text-red-200"><Smartphone className="h-4 w-4" />Official Android app</span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">ANSHA Trading in your pocket.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/65">Browse live export vehicles and parts, view admin-published offers, send purchase requests, check customer invoices, and contact ANSHA support from one mobile-first app.</p>
            <a href={apkUrl} download className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-[#d21e1e] px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-red-950/25 transition hover:bg-red-600"><Download className="h-5 w-5" />Download APK</a>
            <p className="mt-3 text-xs text-white/45">Android package: com.anshatrading.app · Version 1.1 · Updated 26 September 2026</p>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          {['Live vehicles and parts', 'Same ANSHA customer account', 'Admin-controlled offers and support'].map((text) => <div key={text} className="flex items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold shadow-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#d21e1e]" />{text}</div>)}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#d21e1e]" /><div><h2 className="text-xl font-black">How to install on Android</h2><ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><li><strong className="text-foreground">1. Download</strong> the APK using the button above.</li><li><strong className="text-foreground">2. Open</strong> the downloaded file from your browser or Downloads folder.</li><li><strong className="text-foreground">3. Allow installation</strong> from this browser when Android asks for permission.</li><li><strong className="text-foreground">4. Install and open</strong> ANSHA Trading. The app uses the same live website data and customer account.</li></ol><p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">This is a direct APK installation. Google Play is not required, but Android may display a security confirmation for apps installed outside the Play Store.</p></div></div>
        </section>
      </div>
    </main>
  );
}
