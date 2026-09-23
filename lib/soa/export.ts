/**
 * Customer Statement of Account (SOA) export helpers.
 * Excel uses ExcelJS with proper typed cells so columns stay readable.
 * PDF uses a clean print layout (browser Save as PDF) — no table overflow.
 */

import { format } from 'date-fns';
import { formatMoney, normalizeCurrency } from '@/lib/money';

export type SoaInvoiceRow = {
  id: string;
  invoice_number: string;
  document_type: string;
  issue_date: string;
  currency: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
};

export type SoaRemittanceRow = {
  id: string;
  remittance_number: string;
  received_date: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  bank_reference: string | null;
};

export type SoaAllocationRow = {
  id: string;
  remittance_id: string;
  invoice_id: string;
  amount: number;
  currency?: string;
  invoice_number?: string;
};

export type SoaLedgerLine = {
  date: string;
  reference: string;
  stock: string;
  type: string;
  currency: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  sortKey: string;
};

export type SoaParty = {
  code?: string | null;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
};

export type SoaDateRange = {
  from: string; // yyyy-MM-dd or ''
  to: string; // yyyy-MM-dd or ''
};

export function todayYmd(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

/** Inclusive date filter on yyyy-MM-dd strings. Empty bound = no limit. */
export function inDateRange(dateValue: string | null | undefined, range: SoaDateRange): boolean {
  const d = dateOnly(dateValue);
  if (!d) return false;
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

export function receivableDocument(documentType: string): boolean {
  return documentType === 'tax_invoice' || documentType === 'commercial_invoice';
}

export function buildSoaLedgerLines(opts: {
  invoices: SoaInvoiceRow[];
  remittances: SoaRemittanceRow[];
  allocations?: SoaAllocationRow[];
  stockRefsByInvoice?: Record<string, string[]>;
  range: SoaDateRange;
}): SoaLedgerLine[] {
  const lines: SoaLedgerLine[] = [];

  for (const inv of opts.invoices) {
    if (!inDateRange(inv.issue_date, opts.range)) continue;
    if (inv.status === 'cancelled') continue;
    const isReceivable = receivableDocument(inv.document_type);
    lines.push({
      date: dateOnly(inv.issue_date),
      reference: inv.invoice_number,
      stock: (opts.stockRefsByInvoice?.[inv.id] || []).join(', ') || '—',
      type: inv.document_type.replaceAll('_', ' '),
      currency: normalizeCurrency(inv.currency),
      debit: isReceivable ? Number(inv.total_amount || 0) : null,
      credit: isReceivable ? Number(inv.amount_paid || 0) : null,
      balance: isReceivable ? Number(inv.balance_due || 0) : null,
      sortKey: `${dateOnly(inv.issue_date)}|I|${inv.invoice_number}`,
    });
  }

  for (const rem of opts.remittances) {
    if (!inDateRange(rem.received_date, opts.range)) continue;
    if (rem.status !== 'confirmed') continue;
    lines.push({
      date: dateOnly(rem.received_date),
      reference: rem.remittance_number,
      stock: rem.bank_reference?.trim() || '—',
      type: `Remittance (${rem.method.replaceAll('_', ' ')})`,
      currency: normalizeCurrency(rem.currency),
      debit: null,
      credit: Number(rem.amount || 0),
      balance: null,
      sortKey: `${dateOnly(rem.received_date)}|R|${rem.remittance_number}`,
    });
  }

  return lines.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function sanitizeFilename(raw: string): string {
  return (
    raw
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'soa'
  );
}

function moneyCell(value: number | null, currency: string): string {
  if (value === null || value === undefined) return '';
  return formatMoney(value, currency);
}

/** Download SOA as properly formatted .xlsx (typed numbers, frozen header, auto-filter). */
export async function downloadSoaExcel(opts: {
  party: SoaParty;
  range: SoaDateRange;
  lines: SoaLedgerLine[];
  filenameBase?: string;
}) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ANSHA Trading Co';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Statement of Account', {
    views: [{ state: 'frozen', ySplit: 8 }],
  });

  const fromLabel = opts.range.from || 'Beginning';
  const toLabel = opts.range.to || todayYmd();
  const partyName = opts.party.company?.trim() || opts.party.name;

  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'ANSHA Trading Co — Statement of Account';
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = `Customer: ${partyName}${opts.party.code ? ` (${opts.party.code})` : ''}`;

  sheet.mergeCells('A3:H3');
  sheet.getCell('A3').value = [
    opts.party.email ? `Email: ${opts.party.email}` : null,
    opts.party.phone ? `Phone: ${opts.party.phone}` : null,
    opts.party.country ? `Country: ${opts.party.country}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  sheet.mergeCells('A4:H4');
  sheet.getCell('A4').value = `Period: ${fromLabel} → ${toLabel}`;

  sheet.mergeCells('A5:H5');
  sheet.getCell('A5').value = `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`;

  // Blank row 6
  const headerRow = 8;
  const headers = ['Date', 'Reference', 'Stock / Ref', 'Type', 'Currency', 'Debit', 'Credit', 'Balance'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF5' },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  sheet.columns = [
    { key: 'date', width: 12 },
    { key: 'reference', width: 18 },
    { key: 'stock', width: 28 },
    { key: 'type', width: 22 },
    { key: 'currency', width: 10 },
    { key: 'debit', width: 14 },
    { key: 'credit', width: 14 },
    { key: 'balance', width: 14 },
  ];

  let rowIdx = headerRow + 1;
  for (const line of opts.lines) {
    sheet.getCell(rowIdx, 1).value = line.date;
    sheet.getCell(rowIdx, 2).value = line.reference;
    sheet.getCell(rowIdx, 3).value = line.stock === '—' ? '' : line.stock;
    sheet.getCell(rowIdx, 4).value = line.type;
    sheet.getCell(rowIdx, 5).value = line.currency;

    const debitCell = sheet.getCell(rowIdx, 6);
    const creditCell = sheet.getCell(rowIdx, 7);
    const balanceCell = sheet.getCell(rowIdx, 8);

    if (line.debit !== null) {
      debitCell.value = Number(line.debit);
      debitCell.numFmt = '#,##0.00';
    }
    if (line.credit !== null) {
      creditCell.value = Number(line.credit);
      creditCell.numFmt = '#,##0.00';
    }
    if (line.balance !== null) {
      balanceCell.value = Number(line.balance);
      balanceCell.numFmt = '#,##0.00';
      balanceCell.font = { bold: true };
    }

    rowIdx += 1;
  }

  if (opts.lines.length === 0) {
    sheet.mergeCells(`A${rowIdx}:H${rowIdx}`);
    sheet.getCell(rowIdx, 1).value = 'No ledger lines in the selected period.';
  }

  // Auto-filter on header
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(headerRow, rowIdx - 1), column: 8 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const base = sanitizeFilename(
    opts.filenameBase ||
      `SOA-${opts.party.code || partyName}-${fromLabel}-to-${toLabel}`
  );
  anchor.href = url;
  anchor.download = `${base}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Open a clean printable SOA window for browser "Save as PDF".
 * Tables use fixed layout and page-break rules so columns stay readable.
 */
export function printSoaPdf(opts: {
  party: SoaParty;
  range: SoaDateRange;
  lines: SoaLedgerLine[];
  title?: string;
}) {
  if (typeof window === 'undefined') return;

  const fromLabel = opts.range.from || 'Beginning';
  const toLabel = opts.range.to || todayYmd();
  const partyName = opts.party.company?.trim() || opts.party.name;
  const title = opts.title || `SOA-${opts.party.code || partyName}-${fromLabel}-${toLabel}`;

  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const rowsHtml =
    opts.lines.length === 0
      ? `<tr><td colspan="8" style="text-align:center;padding:16px;color:#64748b">No ledger lines in the selected period.</td></tr>`
      : opts.lines
          .map(
            (line) => `
      <tr>
        <td>${escape(line.date)}</td>
        <td>${escape(line.reference)}</td>
        <td>${escape(line.stock === '—' ? '' : line.stock)}</td>
        <td>${escape(line.type)}</td>
        <td>${escape(line.currency)}</td>
        <td class="num">${line.debit !== null ? escape(moneyCell(line.debit, line.currency)) : ''}</td>
        <td class="num">${line.credit !== null ? escape(moneyCell(line.credit, line.currency)) : ''}</td>
        <td class="num bal">${line.balance !== null ? escape(moneyCell(line.balance, line.currency)) : ''}</td>
      </tr>`
          )
          .join('');

  const contactBits = [
    opts.party.email ? `Email: ${opts.party.email}` : null,
    opts.party.phone ? `Phone: ${opts.party.phone}` : null,
    opts.party.country ? `Country: ${opts.party.country}` : null,
  ]
    .filter(Boolean)
    .map((s) => escape(s as string))
    .join(' · ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escape(sanitizeFilename(title))}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      color: #0f172a;
      margin: 0;
      padding: 8px;
    }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .meta { color: #475569; margin: 2px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 12px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    th {
      background: #e8eef5;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    td.num, th.num { text-align: right; white-space: nowrap; }
    td.bal { font-weight: 600; }
    col.date { width: 9%; }
    col.ref { width: 14%; }
    col.stock { width: 20%; }
    col.type { width: 16%; }
    col.cur { width: 7%; }
    col.amt { width: 11%; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>ANSHA Trading Co — Statement of Account</h1>
  <p class="meta"><strong>Customer:</strong> ${escape(partyName)}${opts.party.code ? ` (${escape(opts.party.code)})` : ''}</p>
  ${contactBits ? `<p class="meta">${contactBits}</p>` : ''}
  <p class="meta"><strong>Period:</strong> ${escape(fromLabel)} → ${escape(toLabel)}</p>
  <p class="meta"><strong>Generated:</strong> ${escape(format(new Date(), 'yyyy-MM-dd HH:mm'))}</p>
  <table>
    <colgroup>
      <col class="date" /><col class="ref" /><col class="stock" /><col class="type" />
      <col class="cur" /><col class="amt" /><col class="amt" /><col class="amt" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Reference</th>
        <th>Stock / Ref</th>
        <th>Type</th>
        <th>Currency</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
        <th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
  if (!win) {
    // Popup blocked — fall back to same-window print via temporary iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 300);
    }
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
