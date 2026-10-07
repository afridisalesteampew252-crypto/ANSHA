import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const compiled = ts.transpileModule(readFileSync('lib/expense-report.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(compiled.outputText, { exports });
const { DEFAULT_EXPENSE_REPORT_FILTERS: defaults, matchesExpenseReport, fetchExpenseReport, fetchAllExpenseAttachments, MAX_EXPENSE_REPORT_ROWS } = exports;
const plain = (value) => JSON.parse(JSON.stringify(value));
const activeCategory = '89000000-0000-4000-8001-000000000001';
const inactiveCategory = '89000000-0000-4000-8001-000000000002';
const inactiveBank = '89000000-0000-4000-8002-000000000001';
const expenses = Array.from({ length: 613 }, (_, index) => {
  const n = index + 1;
  return {
    id: `89000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    expense_number: `EXP-FIXTURE-${n}`, expense_date: n > 580 ? '2026-09-28' : '2026-10-07',
    amount: n + 0.125, currency: n % 2 ? 'USD' : 'AED',
    category_id: n % 4 ? activeCategory : inactiveCategory, payee: `Payee ${n}`,
    payment_method: 'bank_transfer', bank_account_id: inactiveBank, bank_reference: `BANK-${n}`,
    notes: `Expense ${n}`, status: ['draft', 'posted', 'cancelled'][n % 3],
    posted_at: n % 3 === 1 ? '2026-10-07T12:00:00Z' : null,
  };
});
const old = expenses[599];
Object.assign(old, { status: 'posted', amount: '600.125', currency: 'AED', posted_at: '2026-09-28T12:00:00Z' });
Object.assign(expenses[611], {
  payee: '=HYPERLINK("https://example.invalid","click")', bank_reference: '+SUM(1,2)',
  notes: '@SUM(A1:A2)',
});
const tables = {
  expenses,
  expense_categories: [
    { id: activeCategory, name: 'Operations', is_active: true },
    { id: inactiveCategory, name: 'Retired freight category', is_active: false },
  ],
  bank_accounts: [{ id: inactiveBank, name: 'Closed historical bank', bank_name: 'Historical bank', currency: 'USD', is_active: false }],
  expense_attachments: expenses.map((row, index) => ({
    id: `89000000-0000-4000-8003-${String(index + 1).padStart(12, '0')}`,
    expense_id: row.id, file_name: row === old ? 'needle-old-receipt.pdf' : `receipt-${index + 1}.pdf`,
    created_at: '2026-10-07T12:00:00Z',
  })),
};

function provider(options = {}) {
  const calls = [];
  const pages = new Map();
  const source = options.tables || tables;
  return {
    calls,
    from(table) {
      assert.ok(table in source, `Unexpected report table ${table}`);
      const query = { table, filters: [], orders: [], from: 0, to: Infinity };
      const builder = {
        select(columns, settings) { query.columns = columns; query.settings = settings; return builder; },
        eq(column, value) { query.filters.push({ op: 'eq', column, value }); return builder; },
        gte(column, value) { query.filters.push({ op: 'gte', column, value }); return builder; },
        lte(column, value) { query.filters.push({ op: 'lte', column, value }); return builder; },
        in(column, value) { query.filters.push({ op: 'in', column, value }); return builder; },
        order(column, settings) { query.orders.push({ column, ascending: settings?.ascending !== false }); return builder; },
        range(from, to) { query.from = from; query.to = to; return builder; },
        returns() { return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push(plain(query));
            const page = (pages.get(table) || 0) + 1;
            pages.set(table, page);
            if (options.errorTable === table && page === (options.errorPage || 1)) {
              return { data: null, count: null, error: { message: options.errorMessage || 'Later report page failed' } };
            }
            let rows = [...source[table]];
            for (const filter of query.filters) rows = rows.filter((row) => {
              if (filter.op === 'in') return filter.value.includes(row[filter.column]);
              if (filter.op === 'gte') return row[filter.column] >= filter.value;
              if (filter.op === 'lte') return row[filter.column] <= filter.value;
              return row[filter.column] === filter.value;
            });
            rows.sort((a, b) => {
              for (const order of query.orders) {
                const result = String(a[order.column]).localeCompare(String(b[order.column]));
                if (result) return order.ascending ? result : -result;
              }
              return 0;
            });
            let count = rows.length;
            let data = rows.slice(query.from, Math.min(query.to + 1, query.from + (options.pageCap || Infinity)));
            if (table === 'expenses') {
              if (options.countOverride !== undefined) count = options.countOverride;
              if (options.countDrift && page > 1) count += 1;
              if (options.missingPage && page === 2) data = [];
              if (options.duplicatePage && page === 2) data = [rows[0], ...data.slice(1)];
              if (options.nullData) data = null;
              if (options.noCount) count = null;
            }
            const columns = query.columns.split(',');
            return {
              data: data?.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))) ?? null,
              count: query.settings?.count === 'exact' ? count : null, error: null,
            };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const initialDefaults = plain(defaults);
const allProvider = provider();
const all = await fetchExpenseReport(allProvider, { ...defaults });
assert.equal(all.count, 613, 'All accessible expenses must be exported, beyond both the visible 150 and one 500-row page');
assert.equal(all.rows.length, 613);
assert.equal(new Set(all.rows.map((row) => row.expense_number)).size, 613);
assert.deepEqual([...new Set(all.rows.map((row) => row.status))].sort(), ['cancelled', 'draft', 'posted']);
assert.deepEqual([...new Set(all.rows.map((row) => row.currency))].sort(), ['AED', 'USD']);
const oldExport = all.rows.find((row) => row.expense_number === old.expense_number);
assert.equal(oldExport.category, 'Retired freight category', 'Inactive categories remain meaningful in historical exports');
assert.match(oldExport.bank_account, /Closed historical bank/);
assert.equal(oldExport.attachments, 'needle-old-receipt.pdf');
assert.equal(oldExport.amount, 600.125);
assert.ok(all.rows.every((row) => typeof row.amount === 'number'));
assert.ok(all.rows.every((row) => Object.values(row).every((value) => value === null || ['string', 'number'].includes(typeof value))), 'Export values must be primitive cells, never formula/hyperlink objects');
const hostile = all.rows.find((row) => row.expense_number === expenses[611].expense_number);
assert.equal(hostile.payee, expenses[611].payee);
assert.equal(hostile.bank_reference, '+SUM(1,2)');
assert.equal(hostile.notes, '@SUM(A1:A2)');
assert.ok(allProvider.calls.filter((call) => call.table === 'expense_attachments').every((call) => call.filters.find((filter) => filter.op === 'in').value.length <= 100), 'Attachment batches stay bounded while including old report rows');

const capped = provider({ pageCap: 37 });
const cappedReport = await fetchExpenseReport(capped, { ...defaults });
assert.equal(cappedReport.count, 613, 'A provider cap below the requested page size must not truncate the report');
assert.deepEqual(plain(cappedReport.rows), plain(all.rows));
assert.deepEqual(capped.calls.filter((call) => call.table === 'expenses').map((call) => call.from),
  Array.from({ length: Math.ceil(613 / 37) }, (_, index) => index * 37), 'Pagination advances by received rows');

const oldFilters = { ...defaults, query: '  NEEDLE-OLD-RECEIPT  ', from: '2026-09-01', to: '2026-09-30', currency: ' aed ', status: 'posted', categoryId: inactiveCategory };
const oldReport = await fetchExpenseReport(provider({ pageCap: 37 }), oldFilters);
assert.equal(oldReport.count, 1, 'Filename search must find a historical attachment absent from the first 150 expenses');
assert.equal(oldReport.rows[0].expense_number, old.expense_number);
assert.equal(matchesExpenseReport(old, oldFilters, 'Retired freight category', ['needle-old-receipt.pdf']), true);
assert.equal(matchesExpenseReport(old, { ...defaults, query: 'retired freight' }, 'Retired freight category', []), true);
assert.equal(matchesExpenseReport(old, { ...defaults, query: 'bank transfer' }, 'Retired freight category', []), true);
assert.equal(matchesExpenseReport(old, { ...defaults, from: '2026-09-28', to: '2026-09-28' }, '', []), true, 'Date endpoints are inclusive');
for (const mismatch of [{ status: 'draft' }, { status: 'cancelled' }, { currency: 'USD' }, { categoryId: activeCategory }, { from: '2026-09-29' }, { to: '2026-09-27' }, { query: 'no-match-ever' }]) {
  assert.equal(matchesExpenseReport(old, { ...defaults, ...mismatch }, 'Retired freight category', ['needle-old-receipt.pdf']), false);
}

for (const invalid of [{ from: '2026-02-30' }, { to: '2025-02-29' }, { from: '2026-9-01' }, { from: '0000-01-01' }, { from: '2026-10-08', to: '2026-10-07' }, { status: 'approved' }, { currency: 'US dollars' }]) {
  const client = provider();
  await assert.rejects(fetchExpenseReport(client, { ...defaults, ...invalid }), /date|currency|status/i);
  assert.equal(client.calls.length, 0, 'Invalid filters must fail before any database query');
}

const emptyClient = provider({ tables: { ...tables, expenses: [] } });
const empty = await fetchExpenseReport(emptyClient, { ...defaults, from: '2024-02-29', to: '2024-02-29' });
assert.equal(empty.count, 0);
assert.equal(empty.rows.length, 0);
assert.equal(empty.columns.length, all.columns.length);
assert.deepEqual(emptyClient.calls.map((call) => call.table), ['expenses'], 'Genuine empty exports require no historical metadata queries');
const noLocalMatch = await fetchExpenseReport(provider(), { ...defaults, query: 'no-match-ever' });
assert.equal(noLocalMatch.count, 0);

await assert.rejects(fetchExpenseReport(provider({ errorTable: 'expenses', errorPage: 2 }), { ...defaults }), /Later report page failed/, 'A later page failure must abort rather than return the first 500 rows');
await assert.rejects(fetchExpenseReport(provider({ errorTable: 'expense_attachments', errorPage: 2 }), { ...defaults }), /Later report page failed/, 'Incomplete attachment metadata must not silently omit filename matches');
await assert.rejects(fetchExpenseReport(provider({ errorTable: 'bank_accounts' }), { ...defaults }), /Later report page failed/);
for (const options of [{ countDrift: true }, { duplicatePage: true }, { missingPage: true }, { nullData: true }, { noCount: true }]) {
  await assert.rejects(fetchExpenseReport(provider(options), { ...defaults }), /changed|incomplete|verify/i, 'An unverified partial report must never be returned as complete');
}
await assert.rejects(fetchExpenseReport(provider({ countOverride: MAX_EXPENSE_REPORT_ROWS + 1 }), { ...defaults }), /row limit/i);
await assert.rejects(fetchExpenseReport(provider({ tables: { ...tables, expense_categories: tables.expense_categories.slice(0, 1) } }), { ...defaults }), /category or bank account/i);
await assert.rejects(fetchExpenseReport(provider({ tables: { ...tables, expenses: [{ ...old, amount: 'not-a-number' }] } }), { ...defaults }), /invalid amount/i);
assert.deepEqual(plain(defaults), initialDefaults, 'Report operations do not mutate the shared default filters');
console.log('Expense report checks passed: complete pagination, provider caps, historical metadata, old attachment filtering, typed safe cells, date validation, empty reports and partial-query failures.');

// The recent-list receipt loader shares exact pagination with exports: a large
// set of receipts must remain searchable instead of hitting the API row cap.
const receiptIds = expenses.slice(0, 150).map((row) => row.id);
const manyReceipts = receiptIds.flatMap((expense_id, index) => Array.from({ length: 25 }, (_, receipt) => ({
  id: `receipt-${String(index).padStart(4, '0')}-${String(receipt).padStart(3, '0')}`,
  expense_id, storage_path: `${expense_id}/receipt-${receipt}.pdf`,
  file_name: `receipt-${index}-${receipt}.pdf`, mime_type: 'application/pdf', size_bytes: 1024,
  uploaded_by: '89000000-0000-4000-8004-000000000001', created_at: '2026-10-07T12:00:00Z',
})));
const receiptProvider = provider({ pageCap: 37, tables: { ...tables, expense_attachments: manyReceipts } });
const loadedReceipts = await fetchAllExpenseAttachments(receiptProvider, [...receiptIds, receiptIds[0]]);
assert.equal(loadedReceipts.length, 3750, 'All recent receipts must be loaded beyond the usual 1000-row provider cap');
assert.equal(new Set(loadedReceipts.map((file) => file.id)).size, 3750, 'Repeated expense IDs do not duplicate receipts');
assert.ok(loadedReceipts.every((file) => file.mime_type === 'application/pdf' && file.size_bytes === 1024 && file.storage_path));
assert.ok(receiptProvider.calls.every((call) => call.filters.find((filter) => filter.op === 'in').value.length <= 100));
assert.ok(receiptProvider.calls.some((call) => call.from > 1000), 'Receipt pages continue beyond the provider default cap');
const emptyReceiptProvider = provider();
assert.equal((await fetchAllExpenseAttachments(emptyReceiptProvider, [])).length, 0);
assert.equal(emptyReceiptProvider.calls.length, 0, 'No expense IDs require no attachment query');
await assert.rejects(fetchAllExpenseAttachments(provider({ pageCap: 37, errorTable: 'expense_attachments', errorPage: 2 }), receiptIds), /Later report page failed/);

async function verifyExpenseXlsxRoundTrip(repoRoot = process.cwd()) {
  const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
  const ts = requireFromRepo('typescript');
  const ExcelJS = requireFromRepo('exceljs');
  const { unzipSync, strFromU8 } = requireFromRepo('fflate');
  const downloads = [];
  const lifecycle = [];
  const fixedTimestamp = '2026-10-07T12:34:56.000Z';
  class ExportDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fixedTimestamp]));
    }
    static now() { return Date.parse(fixedTimestamp); }
  }
  const document = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        href: '', download: '', attached: false,
        click() {
          assert.equal(this.attached, true, 'Download anchor must be attached before click');
          const download = downloads.find((item) => item.url === this.href);
          assert.ok(download, 'Anchor must target the actual workbook blob');
          assert.equal(download.revoked, false, 'Blob URL must remain valid while clicked');
          download.filename = this.download;
          download.clicks += 1;
          lifecycle.push('click');
        },
        remove() {
          assert.equal(this.attached, true);
          this.attached = false;
          lifecycle.push('remove');
        },
      };
    },
    body: {
      appendChild(anchor) {
        anchor.attached = true;
        lifecycle.push('append');
        return anchor;
      },
    },
  };
  const urlApi = {
    createObjectURL(blob) {
      assert.ok(blob instanceof Blob, 'Download must use the real native Blob');
      const url = `blob:expense-test/${downloads.length + 1}`;
      downloads.push({ blob, url, clicks: 0, revoked: false, filename: '' });
      lifecycle.push('create');
      return url;
    },
    revokeObjectURL(url) {
      const download = downloads.find((item) => item.url === url);
      assert.ok(download);
      assert.equal(download.revoked, false, 'Each object URL must be revoked once');
      download.revoked = true;
      lifecycle.push('revoke');
    },
  };
  const context = vm.createContext({ Blob, Date: ExportDate, document, URL: urlApi });
  const moduleCache = new Map();
  function loadTypeScript(relativePath) {
    const filename = path.join(repoRoot, relativePath);
    if (moduleCache.has(filename)) return moduleCache.get(filename).exports;
    const loadedModule = { exports: {} };
    moduleCache.set(filename, loadedModule);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    const execute = new vm.Script(
      `(function(module, exports, require, __filename, __dirname) {\n${compiled.outputText}\n})`,
      { filename },
    ).runInContext(context);
    const localRequire = (specifier) => {
      if (specifier.startsWith('@/')) return loadTypeScript(`${specifier.slice(2)}.ts`);
      return requireFromRepo(specifier);
    };
    execute(loadedModule, loadedModule.exports, localRequire, filename, path.dirname(filename));
    return loadedModule.exports;
  }

  const { downloadExcelWorkbook } = loadTypeScript('lib/export-excel.ts');
  const hostileText = [
    '=HYPERLINK("https://invalid.example/","open")', '+cmd', '-1', '@SUM(A1:A4)',
  ];
  const columns = [
    { key: 'vendor', header: 'Vendor' },
    { key: 'description', header: 'Description' },
    { key: 'amount', header: 'Amount', width: 18 },
    { key: 'currency', header: 'Currency' },
    { key: 'status', header: 'Status' },
    { key: 'confirmed', header: 'Confirmed' },
    { key: 'optional', header: 'Optional' },
  ];
  const rows = hostileText.map((text, index) => ({
    vendor: text,
    description: `Expense café ${index + 1}`,
    amount: [1234.56, 0, 42.75, 999999.99][index],
    currency: ['USD', 'JPY', 'AED', 'USD'][index],
    status: ['draft', 'posted', 'cancelled', 'draft'][index],
    confirmed: index % 2 === 0,
    optional: index % 2 === 0 ? undefined : null,
    unselectedSecret: 'Must never become an exported column',
  }));
  const exportCases = [
    { fileName: 'expense-report.xlsx', sheetName: 'Expenses', expectedName: 'expense-report.xlsx', expectedSheet: 'Expenses', freezeHeader: true, autoFilter: true, numberFormats: { amount: '#,##0.00' } },
    { fileName: 'expenses-uppercase.XLSX', sheetName: 'Expense report with a long sheet name', expectedName: 'expenses-uppercase.XLSX', expectedSheet: 'Expense report with a long shee' },
    { filename: 'expenses.XLSX', sheetName: '', expectedName: 'expenses-2026-10-07.xlsx', expectedSheet: 'Sheet1' },
    { fileName: 'expenses-no-extension', sheetName: 'Expenses', expectedName: 'expenses-no-extension.xlsx', expectedSheet: 'Expenses' },
  ];
  for (const testCase of exportCases) {
    const before = downloads.length;
    await downloadExcelWorkbook({ ...testCase, columns, rows });
    assert.equal(downloads.length, before + 1, 'Exactly one download must be produced');
    const download = downloads.at(-1);
    assert.equal(download.filename, testCase.expectedName);
    assert.equal(download.clicks, 1);
    assert.equal(download.revoked, true);
    assert.equal(download.blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.deepEqual(lifecycle.slice(-5), ['create', 'append', 'click', 'remove', 'revoke']);

    const bytes = Buffer.from(await download.blob.arrayBuffer());
    assert.ok(bytes.length > 1000, 'Download must contain a serialized XLSX, not placeholder content');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    assert.equal(workbook.creator, 'ANSHA');
    assert.equal(workbook.worksheets.length, 1);
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.name, testCase.expectedSheet);
    assert.equal(sheet.rowCount, rows.length + 1);
    assert.equal(sheet.columnCount, columns.length, 'Only selected fields may be exported');
    assert.equal(sheet.getColumn(3).width, 18);
    assert.equal(sheet.getRow(1).font.bold, true);
    assert.deepEqual(sheet.getRow(1).values.slice(1), columns.map((column) => column.header));
    if (testCase.freezeHeader) {
      assert.equal(sheet.views.length, 1);
      assert.equal(sheet.views[0].state, 'frozen');
      assert.equal(sheet.views[0].ySplit, 1, 'Only the header row must be frozen');
      assert.equal(sheet.autoFilter, 'A1:G1', 'Filters must cover exactly the exported header columns');
      assert.equal(sheet.getColumn(3).numFmt, '#,##0.00');
    } else {
      assert.equal((sheet.views || []).some((view) => view.state === 'frozen'), false, 'Existing callers must retain unfrozen sheets');
      assert.equal(sheet.autoFilter, undefined, 'Existing callers must retain no auto filter');
    }
    for (const [index, source] of rows.entries()) {
      const cells = sheet.getRow(index + 2);
      const textCell = cells.getCell(1);
      assert.equal(textCell.value, source.vendor, 'Formula-like text must survive unchanged');
      assert.equal(textCell.type, ExcelJS.ValueType.String, 'Formula-like text must remain an XLSX string');
      assert.notEqual(textCell.type, ExcelJS.ValueType.Formula);
      assert.equal(typeof textCell.value, 'string', 'No formula object may be introduced');
      assert.equal(cells.getCell(2).value, source.description);
      assert.equal(cells.getCell(3).value, source.amount);
      assert.equal(cells.getCell(3).type, ExcelJS.ValueType.Number, 'Amounts must be numeric cells');
      if (testCase.numberFormats) assert.equal(cells.getCell(3).numFmt, '#,##0.00', 'Amount formatting must survive serialization');
      assert.equal(cells.getCell(4).value, source.currency);
      assert.equal(cells.getCell(4).type, ExcelJS.ValueType.String);
      assert.equal(cells.getCell(5).value, source.status);
      assert.equal(cells.getCell(5).type, ExcelJS.ValueType.String);
      assert.equal(cells.getCell(6).value, source.confirmed);
      assert.equal(cells.getCell(6).type, ExcelJS.ValueType.Boolean);
      assert.equal(cells.getCell(7).value, null);
    }
    const zip = unzipSync(new Uint8Array(bytes));
    const worksheetXml = strFromU8(zip['xl/worksheets/sheet1.xml']);
    assert.doesNotMatch(worksheetXml, /<f(?:\s|>)/, 'Serialized worksheet must contain no formula elements');
    for (const entry of Object.values(zip)) {
      assert.ok(!strFromU8(entry).includes('Must never become an exported column'), 'Unselected fields must not enter the XLSX');
    }
  }
  return { downloads: downloads.length, rowsPerWorkbook: rows.length, hostileStrings: hostileText.length };
}

await verifyExpenseXlsxRoundTrip();
console.log('Real XLSX checks passed: frozen header, filters, numeric formats, unchanged formula-like strings and existing caller compatibility.');
