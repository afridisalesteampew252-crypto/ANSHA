import { ShieldCheck } from 'lucide-react';

export function InvoiceQrCode({ verificationUrl }: { verificationUrl: string }) {
  const qrSource = `https://quickchart.io/qr?text=${encodeURIComponent(verificationUrl)}&size=220&margin=1&ecLevel=M`;

  return (
    <div className="flex max-w-xs items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
      {/* The QR provider receives only the opaque verification URL, never invoice/customer data. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrSource} alt="Scan to verify this invoice" width={112} height={112} className="h-28 w-28 shrink-0 rounded-md bg-white p-1" />
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-4 w-4" />Authenticity check</p>
        <p className="mt-1 text-xs leading-relaxed">Scan to confirm this document on the official ANSHA website.</p>
        <p className="mt-2 break-all text-[9px] leading-tight text-emerald-800">{verificationUrl}</p>
      </div>
    </div>
  );
}
