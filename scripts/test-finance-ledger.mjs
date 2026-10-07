import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const money = load('lib/money.ts');
const { buildSoaLedgerLines, inDateRange } = load('lib/soa/ledger.ts', { '@/lib/money': money });
const { buildRemittanceExportRow } = load('lib/remittance-export.ts');
const invoice = (id, currency, amount, extra = {}) => ({
  id, invoice_number: `INV-${id}`, document_type: 'tax_invoice', issue_date: '2026-10-01',
  currency, status: 'issued', total_amount: amount, amount_paid: 400, balance_due: amount - 400, ...extra,
});
const tt = (id, date, amount, source_amount, exchange_rate, extra = {}) => ({
  id, remittance_number: `TT-${id}`, received_date: date, amount, currency: 'AED',
  status: 'confirmed', method: 'bank_transfer', bank_reference: `BANK-${id}`,
  source_currency: 'USD', source_amount, exchange_rate, ...extra,
});
const invoices = [invoice('a', 'AED', 1000), invoice('u', 'USD', 9000),
  invoice('p', 'AED', 200, { document_type: 'proforma_invoice' }),
  invoice('draft', 'AED', 500, { status: 'draft' }), invoice('cancelled', 'AED', 500, { status: 'cancelled' })];
const remittances = [tt('one', '2026-10-03', 300, 100, 3), tt('two', '2026-10-05', 200, 50, 4),
  tt('pending', '2026-10-02', 999, 999, 1, { status: 'pending' })];
const payments = [
  { id: 'allocated', invoice_id: 'a', invoice_number: 'INV-a', payment_date: '2026-10-03', amount: 300, currency: 'AED', method: 'bank_transfer', reference: null, remittance_id: 'one' },
  { id: 'cash', invoice_id: 'a', invoice_number: 'INV-a', payment_date: '2026-10-04', amount: 100, currency: 'AED', method: 'cash', reference: 'CASH', remittance_id: null },
];
const snapshot = JSON.stringify({ invoices, remittances, payments });
const opts = { invoices, remittances, payments, range: { from: '2026-10-04', to: '2026-10-05' } };
const rows = buildSoaLedgerLines(opts);
const aed = rows.filter((row) => row.currency === 'AED');
assert.equal(aed[0].kind, 'opening');
assert.equal(aed[0].balance, 700);
assert.equal(aed[1].reference, 'CASH');
assert.equal(aed[1].balance, 600);
assert.equal(aed[2].reference, 'TT-two');
assert.equal(aed[2].balance, 400);
assert.equal(aed.at(-1).kind, 'closing');
assert.equal(aed.at(-1).balance, 400);
assert.equal(rows.filter((row) => row.currency === 'USD').at(-1).balance, 9000);
assert.equal(JSON.stringify({ invoices, remittances, payments }), snapshot, 'Do not reprice previous receipts or mutate source records');

const all = buildSoaLedgerLines({ ...opts, range: { from: '', to: '2026-10-07' } });
assert.equal(all.filter((row) => row.currency === 'AED').reduce((sum, row) => sum + (row.credit || 0), 0), 600, 'Never credit invoice amount_paid plus its TT allocation again');
assert.equal(all.filter((row) => row.currency === 'AED').reduce((sum, row) => sum + (row.debit || 0), 0), 1000, 'Proformas/drafts/cancelled documents are non-posting');
assert.equal(all.filter((row) => row.type.startsWith('TT /')).length, 2, 'Pending receipts do not credit the account');
assert.equal(buildSoaLedgerLines({ ...opts, currency: 'USD' }).every((row) => row.currency === 'USD'), true);
assert.equal(buildSoaLedgerLines({ ...opts, range: { from: '2026-10-06', to: '2026-10-07' }, currency: 'AED' }).at(-1).balance, 400, 'Carry opening/closing even without transactions in the period');
assert.equal(buildSoaLedgerLines({ ...opts, range: { from: '', to: '2026-10-03' }, currency: 'AED' }).at(-1).balance, 700, 'Later payments must not alter past closing balances');
assert.equal(buildSoaLedgerLines({ ...opts, range: { from: '2026-10-05', to: '2026-10-04' } }).length, 0);
assert.equal(inDateRange('2026-10-04T23:59:00Z', opts.range), true);
assert.equal(inDateRange('2026-10-05', opts.range), true);
assert.equal(inDateRange('2026-10-06', opts.range), false);
const credit = buildSoaLedgerLines({ invoices: [], remittances: [tt('advance', '2026-10-01', 100, 50, 2)], range: { from: '', to: '2026-10-07' } });
assert.equal(credit.at(-1).balance, -100, 'Unallocated advance is account credit');

for (const receipt of remittances.slice(0, 2)) {
  const row = buildRemittanceExportRow({ ...receipt, customer_id: 'c', customer_name: 'Customer', allocated: 0 });
  assert.equal(row.exchange_rate, receipt.exchange_rate, 'Keep every individual TT rate');
  assert.equal(row.instructed_amount, receipt.source_amount);
  assert.equal(row.source_currency, 'USD');
  assert.equal(row.remit_amount, receipt.amount);
}
assert.match(money.formatMoney(1250, 'PKR'), /1,250/);
console.log('Finance ledger checks passed: date balances, isolated currencies, payment deduplication and individual TT rates.');
