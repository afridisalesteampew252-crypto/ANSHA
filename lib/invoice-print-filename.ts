/**
 * Default Save as PDF / print filename from invoice identity.
 * Prefers invoice_number; falls back to reference.
 */
export function invoicePrintFilename(opts: {
  invoice_number?: string | null;
  reference?: string | null;
}): string {
  const raw = (opts.invoice_number?.trim() || opts.reference?.trim() || 'invoice');
  const sanitized = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return sanitized || 'invoice';
}

/** Temporarily set document.title so the browser print/PDF dialog uses the invoice number. */
export function printWithInvoiceFilename(opts: {
  invoice_number?: string | null;
  reference?: string | null;
}): void {
  if (typeof window === 'undefined') return;
  const filename = invoicePrintFilename(opts);
  const previousTitle = document.title;
  document.title = filename;

  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);

  window.print();
}
