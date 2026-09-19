import { ShieldCheck } from 'lucide-react';

/** QR encodes the full verify URL; the printed face shows only the opaque code — not the site URL. */
export function InvoiceQrCode({
  verificationUrl,
  verificationCode,
}: {
  verificationUrl: string;
  verificationCode: string;
}) {
  const qrSource = `https://quickchart.io/qr?text=${encodeURIComponent(verificationUrl)}&size=180&margin=1&ecLevel=M`;

  return (
    <div className="flex max-w-sm items-center gap-3 rounded-md border border-[#111827]/12 bg-[#f9fafb] p-3 text-[#111827]">
      {/* The QR provider receives only the opaque verification URL, never invoice/customer data. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrSource}
        alt="Scan to verify this invoice"
        width={96}
        height={96}
        className="h-24 w-24 shrink-0 rounded bg-white p-1"
      />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-bold">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
          Authenticity check
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#4b5563]">
          Scan the QR code to confirm this document. Use the verification code below if asked.
        </p>
        <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">Verification code</p>
        <p className="mt-0.5 break-all font-mono text-[11px] font-semibold tracking-wide text-[#111827]">
          {verificationCode}
        </p>
      </div>
    </div>
  );
}
