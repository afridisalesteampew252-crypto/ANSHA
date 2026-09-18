/** Simple bank statement CSV parser for Phase 50 manual import. */

export type BankCsvImportRow = {
  txn_date: string;
  amount: number;
  direction: 'in' | 'out';
  description: string | null;
  reference: string | null;
};

export type BankCsvParseResult = {
  rows: BankCsvImportRow[];
  errors: string[];
};

const REQUIRED_HEADERS = ['date', 'amount'] as const;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[, ]/g, '').replace(/^\+/, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    return `${m[3]}-${month}-${day}`;
  }
  return null;
}

/** Parse CSV text with headers date, amount, description?, reference?. Signed amount → direction. */
export function parseBankTransactionsCsv(text: string): BankCsvParseResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const errors: string[] = [];
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV needs a header row and at least one data row.'] };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);

  for (const required of REQUIRED_HEADERS) {
    if (idx(required) < 0 && !(required === 'date' && idx('txn_date') >= 0)) {
      return {
        rows: [],
        errors: [`Missing required column "${required}". Expected: date,amount,description,reference`],
      };
    }
  }

  const dateIdx = idx('date') >= 0 ? idx('date') : idx('txn_date');
  const amountIdx = idx('amount');
  const descIdx = idx('description');
  const refIdx = idx('reference');
  const dirIdx = idx('direction');

  const rows: BankCsvImportRow[] = [];

  for (let lineNo = 1; lineNo < lines.length; lineNo += 1) {
    const cells = splitCsvLine(lines[lineNo]);
    const label = `Row ${lineNo + 1}`;

    const dateRaw = cells[dateIdx] ?? '';
    const amountRaw = cells[amountIdx] ?? '';
    const txnDate = parseDate(dateRaw);
    if (!txnDate) {
      errors.push(`${label}: invalid date "${dateRaw}" (use YYYY-MM-DD or DD/MM/YYYY).`);
      continue;
    }

    const amountNum = parseAmount(amountRaw);
    if (amountNum === null || amountNum === 0) {
      errors.push(`${label}: amount must be a non-zero number.`);
      continue;
    }

    let direction: 'in' | 'out';
    const dirRaw = dirIdx >= 0 ? (cells[dirIdx] || '').trim().toLowerCase() : '';
    if (dirRaw === 'in' || dirRaw === 'out') {
      direction = dirRaw;
    } else if (dirRaw) {
      errors.push(`${label}: direction must be in or out.`);
      continue;
    } else {
      direction = amountNum > 0 ? 'in' : 'out';
    }

    const description =
      descIdx >= 0 ? (cells[descIdx] || '').trim() || null : null;
    const reference =
      refIdx >= 0 ? (cells[refIdx] || '').trim() || null : null;

    rows.push({
      txn_date: txnDate,
      amount: Math.abs(amountNum),
      direction,
      description,
      reference,
    });
  }

  return { rows, errors };
}

export function bankCsvTemplate(): string {
  return [
    'date,amount,description,reference',
    '2026-09-01,1500.00,Customer remittance,REM-001',
    '2026-09-02,-250.50,Bank charges,CHG-9',
  ].join('\n');
}
