import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx } from 'react/jsx-runtime';

const require = createRequire(import.meta.url);
const chartElementChecker = require(require.resolve('react-is', { paths: [require.resolve('recharts/package.json')] }));
assert.equal(chartElementChecker.isElement(jsx('div', {})), true,
  'The chart library must recognize elements from the installed React JSX runtime');

const compiled = ts.transpileModule(readFileSync('lib/financial-dashboard.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(compiled.outputText, { exports, require(name) { throw new Error(`Unexpected runtime dependency ${name}`); } });
const { fetchFinancialDashboard, discoverFinancialCurrencies } = exports;
const plain = (value) => JSON.parse(JSON.stringify(value));
const id = (number) => `91000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const row = (number, type, amount, name = 'Account') => ({
  account_id: id(number), account_code: String(number), account_name: name, account_type: type, amount,
});
const period = ['2026-10-01', '2026-10-07'];
const journals = Array.from({ length: 1203 }, (_, index) => ({
  id: id(index + 1), currency: index < 1001 ? 'AED' : index < 1201 ? 'USD' : index === 1201 ? 'JPY' : 'NOK',
  status: 'posted', entry_date: '2020-01-01',
}));
journals.push({ id: id(1300), currency: 'CAD', status: 'draft', entry_date: '2026-10-05' });
journals.push({ id: id(1400), currency: 'ZAR', status: 'reversed', entry_date: '2020-01-01' });
const accounts = {
  AED: [...Array.from({ length: 1201 }, (_, index) => row(index + 1, 'revenue', 1)),
    row(2001, 'expense', 100, 'Freight'), row(2002, 'expense', -25, 'Freight credit'), row(2003, 'expense', 0, 'No movement')],
  USD: [row(1, 'revenue', -40, 'Sales returns'), row(2, 'expense', 10, 'Freight'), row(3, 'expense', -15, 'Rebate')],
  JPY: [row(1, 'revenue', 10000, 'Sales'), row(2, 'expense', -250, 'Credit only')],
  NOK: [row(1, 'revenue', 20, 'Historical sales')],
  EUR: [], GBP: [row(1, 'revenue', 0), row(2, 'expense', 0)],
};
const configured = [' aed ', 'USD', ' eur ', 'GBP', 'USD', '', 'X', 'FOUR', '123'];

// This fixture enforces the provider response cap and applies the requested query;
// completeness is verified against independently known datasets and expected totals.
function provider({ journalRows = journals, pnlRows = accounts, alter = () => {}, latency = 1, cap = 1000 } = {}) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const query = (kind, name, args, options) => {
    const call = { kind, name, args: plain(args), options: plain(options), filters: [], orders: [], range: null };
    const builder = {
      select(columns, selection) { call.columns = columns; call.options = plain(selection); return builder; },
      eq(column, value) { call.filters.push([column, value]); return builder; },
      in(column, value) { call.filters.push([column, 'in', plain(value)]); return builder; },
      gte(column, value) { call.filters.push([column, 'gte', value]); return builder; },
      lte(column, value) { call.filters.push([column, 'lte', value]); return builder; },
      order(column, ordering) { call.orders.push([column, plain(ordering)]); return builder; },
      range(from, to) { call.range = [from, to]; return builder; },
      returns() { return builder; },
      then(resolve, reject) {
        calls.push(call);
        if (kind === 'rpc') { active += 1; maxActive = Math.max(maxActive, active); }
        return new Promise((done) => setTimeout(done, latency)).then(() => {
          let data = kind === 'table' ? journalRows : (pnlRows[args.p_currency] ?? []);
          for (const [column, operator, value] of call.filters) {
            data = data.filter((record) => value === undefined ? record[column] === operator : operator === 'in' ? value.includes(record[column]) : operator === 'gte' ? record[column] >= value : record[column] <= value);
          }
          for (const [column, ordering] of [...call.orders].reverse()) {
            data = [...data].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ordering?.ascending === false ? -1 : 1));
          }
          const [from, to] = call.range ?? [0, 999];
          const result = { data: structuredClone(data.slice(from, Math.min(to + 1, from + cap))), count: data.length, error: null };
          alter(call, result);
          return result;
        }).finally(() => { if (kind === 'rpc') active -= 1; }).then(resolve, reject);
      },
    };
    return builder;
  };
  return {
    calls, get maxActive() { return maxActive; },
    client: { from: (table) => query('table', table, null, null), rpc: (name, args, options) => query('rpc', name, args, options) },
  };
}

const complete = provider();
const summaries = plain(await fetchFinancialDashboard(complete.client, configured, ...period));
assert.deepEqual(summaries.map((summary) => summary.currency), ['AED', 'EUR', 'GBP', 'JPY', 'NOK', 'USD', 'ZAR'],
  'Historical posted and reversed currencies beyond 1,000 rows remain visible even when absent from active configuration');
const byCurrency = Object.fromEntries(summaries.map((summary) => [summary.currency, summary]));
assert.deepEqual(byCurrency.AED, { currency: 'AED', revenue: 1201, expenses: 75, profit: 1126,
  expenseBreakdown: [{ name: '2001 — Freight', value: 100 }], expenseCredits: 25 }, 'Every paginated account contributes exactly once');
assert.deepEqual(byCurrency.USD, { currency: 'USD', revenue: -40, expenses: -5, profit: -35,
  expenseBreakdown: [{ name: '2 — Freight', value: 10 }], expenseCredits: 15 }, 'Returns and expense credits preserve their accounting signs');
assert.deepEqual(byCurrency.JPY, { currency: 'JPY', revenue: 10000, expenses: -250, profit: 10250,
  expenseBreakdown: [], expenseCredits: 250 }, 'Credit-only expenses have no positive pie slice but do affect profit');
assert.deepEqual(byCurrency.NOK, { currency: 'NOK', revenue: 20, expenses: 0, profit: 20, expenseBreakdown: [], expenseCredits: 0 });
assert.deepEqual(byCurrency.EUR, { currency: 'EUR', revenue: 0, expenses: 0, profit: 0, expenseBreakdown: [], expenseCredits: 0 });
assert.deepEqual(byCurrency.GBP, { currency: 'GBP', revenue: 0, expenses: 0, profit: 0, expenseBreakdown: [], expenseCredits: 0 });
assert.deepEqual(byCurrency.ZAR, { currency: 'ZAR', revenue: 0, expenses: 0, profit: 0, expenseBreakdown: [], expenseCredits: 0 });
assert.equal(complete.maxActive, 3, 'Six currencies load through at most three simultaneous RPC requests');
const journalCalls = complete.calls.filter((call) => call.kind === 'table');
assert.equal(journalCalls.length, 3);
for (const call of journalCalls) {
  assert.equal(call.name, 'gl_journals');
  assert.deepEqual(call.filters, [['status', 'in', ['posted', 'reversed']]], 'Historical posted/reversed currency discovery is independent of the selected period');
  assert.equal(call.options.count, 'exact');
  assert.ok(call.orders.some(([column, order]) => column === 'id' && order.ascending !== false));
}
for (const call of complete.calls.filter((call) => call.kind === 'rpc')) {
  assert.equal(call.name, 'gl_profit_and_loss_currency');
  assert.deepEqual(Object.keys(call.args).sort(), ['p_currency', 'p_from', 'p_to']);
  assert.deepEqual([call.args.p_from, call.args.p_to], period);
  assert.ok(summaries.some((summary) => summary.currency === call.args.p_currency));
  assert.equal(call.options.count, 'exact');
}
assert.equal(complete.calls.filter((call) => call.kind === 'rpc' && call.args.p_currency === 'AED').length, 3);
assert.ok(summaries.every((summary) => summary.expenseBreakdown.every((slice) => slice.value > 0)));
assert.ok(summaries.every((summary) => Object.keys(summary).sort().join(',') === 'currency,expenseBreakdown,expenseCredits,expenses,profit,revenue'),
  'Each result remains in one source currency with no invented FX or combined grand total');
const restricted = provider({ cap: 137 });
assert.deepEqual(plain(await fetchFinancialDashboard(restricted.client, configured, ...period)), summaries,
  'A lower project response cap still yields the complete dashboard without skipping rows');
const discovery = provider({ cap: 137 });
assert.deepEqual(plain(await discoverFinancialCurrencies(discovery.client)), ['AED', 'JPY', 'NOK', 'USD', 'ZAR']);
assert.ok(discovery.calls.every((call) => call.kind === 'table'), 'Standalone currency discovery never runs financial aggregates');
const decimal = provider({ journalRows: [], pnlRows: { AED: [row(1, 'revenue', '0.10'), row(2, 'revenue', '0.20'), row(3, 'expense', '0.01')] } });
const decimalSummary = plain(await fetchFinancialDashboard(decimal.client, ['AED'], ...period))[0];
assert.deepEqual([decimalSummary.revenue, decimalSummary.expenses, decimalSummary.profit], [0.3, 0.01, 0.29],
  'PostgREST numeric strings preserve the ledger cent precision');

for (const dates of [['', period[1]], ['2026-02-30', period[1]], ['2026-10-8', period[1]], ['0000-01-01', period[1]], ['2026-10-08', '2026-10-07'], ['2026-01-01', 'not-a-date']]) {
  const invalid = provider();
  await assert.rejects(fetchFinancialDashboard(invalid.client, ['AED'], ...dates), /date|period|range|from|to/i);
  assert.equal(invalid.calls.length, 0, 'Invalid periods fail before database requests');
}

async function rejectsDataset(label, options, currencies = ['AED']) {
  const fixture = provider(options);
  await assert.rejects(fetchFinancialDashboard(fixture.client, currencies, ...period), undefined, label);
  return fixture;
}
await rejectsDataset('A late currency error rejects the whole dashboard instead of publishing partial totals', {
  alter(call, result) { if (call.kind === 'rpc' && call.args.p_currency === 'USD') { result.data = null; result.error = { message: 'Late provider failure' }; } },
});
await rejectsDataset('A failed second P&L page cannot produce partial totals', {
  alter(call, result) { if (call.kind === 'rpc' && call.args.p_currency === 'AED' && call.range[0] > 0) { result.data = null; result.error = { message: 'Second page failure' }; } },
});
await rejectsDataset('A failed later historical page cannot silently omit legacy currencies', {
  alter(call, result) { if (call.kind === 'table' && call.range[0] >= 1000) { result.data = null; result.error = { message: 'Historical page denied' }; } },
});
const workerFailure = await rejectsDataset('Workers stop new currencies and extra pages once a peer fails', {
  journalRows: [],
  pnlRows: Object.fromEntries(['AED', 'EUR', 'GBP', 'USD'].map((currency) => [currency, Array.from({ length: 600 }, (_, index) => row(index + 1, 'revenue', 1))])),
  alter(call, result) { if (call.kind === 'rpc' && call.args.p_currency === 'AED') { result.data = null; result.error = { message: 'First worker failed' }; } },
}, ['AED', 'EUR', 'GBP', 'USD']);
assert.ok(workerFailure.calls.filter((call) => call.kind === 'rpc').every((call) => call.range[0] === 0), 'An in-flight successful worker cannot schedule a second page after the shared failure');
assert.equal(workerFailure.calls.filter((call) => call.kind === 'rpc').length, 3, 'The failure is observed with three real in-flight workers');
assert.equal(workerFailure.calls.some((call) => call.kind === 'rpc' && call.args.p_currency === 'USD'), false, 'A fourth currency is never scheduled after a worker failure');
for (const kind of ['table', 'rpc']) {
  await rejectsDataset(`${kind}: a missing exact count is not treated as complete`, { alter(call, result) { if (call.kind === kind) result.count = null; } });
  await rejectsDataset(`${kind}: a missing later page before the exact end is rejected`, { alter(call, result) { if (call.kind === kind && call.range[0] > 0) result.data = []; } });
  await rejectsDataset(`${kind}: changed counts during pagination are rejected`, { alter(call, result) { if (call.kind === kind && call.range[0] > 0) result.count += 1; } });
}
await rejectsDataset('Repeated journal IDs cannot masquerade as complete discovery', {
  journalRows: journals.map((record, index) => index === 1202 ? { ...record, id: journals[0].id } : record),
});
await rejectsDataset('Repeated P&L account IDs cannot double revenue', {
  pnlRows: { ...accounts, AED: [...accounts.AED, { ...accounts.AED[0] }] },
});
for (const currency of ['usd', ' AED ', '', null, 'AAAA', '123']) {
  await rejectsDataset('Unrepresentable posted currency codes fail visibly', { journalRows: [{ id: id(1), currency, status: 'posted' }] });
}
for (const invalidRow of [row(1, 'asset', 1), row(1, 'expense', Number.NaN), row(1, 'revenue', Number.POSITIVE_INFINITY), row(1, 'expense', null), { ...row(1, 'revenue', 5), account_id: null }]) {
  await rejectsDataset('Malformed financial account data cannot become a chart value', { journalRows: [], pnlRows: { AED: [invalidRow] } });
}
console.log('Financial dashboard checks passed: complete historical/account pagination, isolated signed currencies, positive pie slices and credits, concurrency, atomic failures, and pre-query date validation.');
