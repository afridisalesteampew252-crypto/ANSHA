/** QR encodes the full verify URL; the printed face shows only the opaque code — not the site URL. */
export function InvoiceQrCode({
  verificationUrl,
  verificationCode,
}: {
  verificationUrl: string;
  verificationCode: string;
}) {
  const qrSource = `https://quickchart.io/qr?text=${encodeURIComponent(verificationUrl)}&size=140&margin=1&ecLevel=M`;

  return (
    <div className="invoice-a4-qr flex max-w-md items-center gap-3 border border-[#111827]/15 bg-[#f8fafc] px-2.5 py-2 text-[#111827]">
      {/* The QR provider receives only the opaque verification URL, never invoice/customer data. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrSource}
        alt="Scan to verify this invoice"
        width={72}
        height={72}
        className="h-[4.5rem] w-[4.5rem] shrink-0 bg-white p-0.5"
      />
      <div className="min-w-0">
        <p className="invoice-a4-label">Authenticity check</p>
        <p className="mt-1 text-[9.5px] leading-snug text-[#4b5563]">
          Scan to confirm this document. If prompted, enter the verification code only.
        </p>
        <p className="mt-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
          Verification code
        </p>
        <p className="mt-0.5 break-all font-mono text-[11px] font-semibold tracking-wide text-[#111827]">
          {verificationCode}
        </p>
      </div>
    </div>
  );
}
