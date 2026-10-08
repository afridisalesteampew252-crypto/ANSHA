import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  cache.set(path, exports);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(compiled.outputText, { exports, Intl, Date, require(name) {
    assert.ok(name.startsWith('@/'), `Unexpected dependency ${name}`);
    return load(`${name.slice(2)}.ts`);
  } }, { filename: path });
  return exports;
}
const { readAllRows } = load('lib/read-all-rows.ts');
const { fetchDashboardData } = load('lib/dashboard-data.ts');
const { fetchAdminInventory } = load('lib/admin-inventory-data.ts');
const actor = '92000000-0000-4000-8000-000000000001';
const signal = () => new AbortController().signal;
const parts = Array.from({ length: 1253 }, (_, i) => ({ id: `part-${String(i).padStart(5, '0')}`, created_at: '2026-10-01', stock_status: 'available', stock_origin: 'japan', reserved_by: null }));
const invoices = Array.from({ length: 1113 }, (_, i) => ({ id: `invoice-${String(i).padStart(5, '0')}`, issue_date: i === 0 ? '2020-01-01' : '2026-10-01', currency: 'AED', status: 'posted', total_amount: 1, balance_due: 1 }));
const itemRows = Array.from({ length: 1401 }, (_, i) => ({ id: `item-${String(i).padStart(5, '0')}`, part_id: parts[0].id, invoices: { id: `linked-${i}`, invoice_number: `INV-${i}`, status: 'posted', created_at: '2026-10-01' } }));
function fixture({ fail, role = 'admin', cap = 37 } = {}) {
  const calls = [];
  const tables = {
    admin_profiles: [{ id: actor, role, is_active: true, full_name: 'Test', email: 'test@example.invalid' }],
    parts, vehicles: [], customers: [{ id: 'customer-1' }], chat_participants: [], inquiries: [],
    invoices, remittances: [], customer_profiles: [], push_subscriptions: [],
    system_finance_settings: [{ id: 1, default_currency: 'AED', enabled_currencies: ['AED', 'USD'] }],
    export_shipment_parts: [], invoice_items: itemRows,
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    rpc(name) { return { abortSignal() { return Promise.resolve({ data: null, error: { message: `${name} unavailable` } }); } }; },
    from(table) {
      assert.ok(table in tables, `Unexpected table ${table}`);
      const call = { table, filters: [], orders: [] };
      const builder = {
        select(columns, options = {}) { call.columns = columns; call.options = options; return builder; },
        eq(key, value) { call.filters.push(['eq', key, value]); return builder; },
        neq(key, value) { call.filters.push(['neq', key, value]); return builder; },
        gte(key, value) { call.filters.push(['gte', key, value]); return builder; },
        lte(key, value) { call.filters.push(['lte', key, value]); return builder; },
        in(key, value) { call.filters.push(['in', key, value]); return builder; },
        order(key, options = {}) { call.orders.push([key, options]); return builder; },
        limit(value) { call.limit = value; return builder; },
        range(from, to) { call.range = [from, to]; return builder; },
        abortSignal(value) { call.signal = value; return builder; },
        returns() { return builder; },
        maybeSingle() { call.single = true; return builder; },
        then(resolve, reject) {
          calls.push(call);
          return Promise.resolve().then(() => {
            if (call.signal?.aborted || fail?.(call)) return { data: null, count: null, error: { message: 'Fixture failure' } };
            let selected = [...tables[table]];
            for (const [op, key, value] of call.filters) selected = selected.filter(row => op === 'eq' ? row[key] === value : op === 'neq' ? row[key] !== value : op === 'in' ? value.includes(row[key]) : op === 'gte' ? row[key] >= value : row[key] <= value);
            selected.sort((a,b) => String(a.id).localeCompare(String(b.id)));
            const count = selected.length;
            const from = call.range?.[0] ?? 0;
            const data = selected.slice(from, Math.min(call.range ? call.range[1] + 1 : from + (call.limit ?? cap), from + cap));
            return { data: call.single ? data[0] ?? null : call.options.head ? null : data, count: call.options.count ? count : null, error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

const normal = fixture();
const snapshot = await fetchDashboardData(normal.client, '2026-05-01', '2026-10-08', signal());
assert.equal(snapshot.counts.parts, 1253);
assert.equal(snapshot.inventory.length, 1253);
assert.equal(snapshot.invoices.length, 1113);
assert.equal(snapshot.invoices[0].issue_date, '2020-01-01', 'Older outstanding balances are retained');
assert.match(snapshot.warning, /analytics are unavailable/i);
assert.equal(snapshot.analytics, null);
for (const table of ['parts', 'invoices', 'remittances', 'system_finance_settings', 'inquiries', 'admin_profiles']) {
  await assert.rejects(fetchDashboardData(fixture({ fail: call => call.table === table }).client, '2026-05-01', '2026-10-08', signal()), /could not|retry/i, `${table} failure cannot turn into zero totals`);
}
await assert.rejects(fetchDashboardData(fixture({ fail: call => call.table === 'invoices' && call.range?.[0] > 1000 }).client, '2026-05-01', '2026-10-08', signal()), /Invoices/, 'Late pages fail atomically');
const sales = fixture({ role: 'sales' });
await fetchDashboardData(sales.client, '2026-05-01', '2026-10-08', signal());
assert.ok(!sales.calls.some(call => ['remittances', 'push_subscriptions', 'system_finance_settings'].includes(call.table)), 'Field agents do not load privileged financial detail');

const inventory = await fetchAdminInventory(fixture().client, 'parts', signal());
assert.equal(inventory.list.length, 1253, 'Inventory no longer stops at 800 or 1,000');
assert.equal(inventory.invoices[parts[0].id].length, 1401, 'Related invoice reads are complete even within one ID batch');
await assert.rejects(fetchAdminInventory(fixture({ fail: call => call.table === 'invoice_items' && call.range?.[0] > 1000 }).client, 'parts', signal()), /Inventory details/);
for (const result of [
  { data: [], count: 1, error: null },
  { data: [], count: null, error: null },
  { data: [{ id: 'same' }, { id: 'same' }], count: 2, error: null },
]) await assert.rejects(readAllRows(async()=>result, 'Records'));
let index = 0;
await assert.rejects(readAllRows(async()=> index++ ? { data: [{id:'b'}], count: 3, error: null } : { data: [{id:'a'}], count: 2, error: null }, 'Records'), /completely/);
console.log('Dashboard/inventory checks passed: 1,000+ records and related invoices, lower provider caps, older balances, role scope, and atomic visible failures.');
