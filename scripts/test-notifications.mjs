/* eslint-disable react-hooks/rules-of-hooks -- This unit harness invokes the hook with mocked React subscriptions, without rendering React. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(compiled.outputText, { exports, URL, ...globals });
  return exports;
}
const { notificationHref } = load('lib/notifications.ts');
for (const href of ['https://evil.example/admin/invoices', '//evil.example/portal/support', 'javascript:alert(1)', '/admin/../../portal/support', '/admin\\evil.example', '/portal2/support', '/portal/../admin/invoices', '/portal/\n/support']) {
  assert.equal(notificationHref(href, href.startsWith('/admin') ? 'admin' : 'portal'), null, href);
}
assert.equal(notificationHref('/portal/payments?status=matched', 'portal'), '/portal/payments?status=matched');
assert.equal(notificationHref('/admin/invoices/123', 'admin'), '/admin/invoices/123');
assert.equal(notificationHref('/admin/invoices/123', 'portal'), null);
assert.equal(notificationHref('/portal/support', 'admin'), null);

const subscriptions = [];
const queries = [];
const channels = [];
const authListeners = new Set();
const timers = new Map();
const events = new Map();
let nextTimer = 0;
let delayLoads;
const supabase = {
  from(table) {
    const query = { table, filters: [], updating: false, head: false };
    const builder = {
      select(_columns, options) { query.head = Boolean(options?.head); return builder; },
      eq(column, value) { query.filters.push([column, value]); return builder; },
      is(column, value) { query.filters.push([column, value]); return builder; },
      order() { return builder; }, limit() { return builder; },
      update(values) { query.updating = true; query.values = values; return builder; },
      then(resolve, reject) {
        queries.push(query);
        const result = { error: null, count: 1, data: query.head || query.updating ? null : [{ id: 'notification-1', title: query.filters.find(([column]) => column === 'recipient_id')?.[1] }] };
        return (delayLoads ? delayLoads.then(() => result) : Promise.resolve(result)).then(resolve, reject);
      },
    };
    return builder;
  },
  channel(name) {
    const channel = { name, handlers: [], on(_kind, filter, handler) { channel.handlers.push({ filter, handler }); return channel; }, subscribe() { return channel; } };
    channels.push(channel);
    return channel;
  },
  removeChannel() { return Promise.resolve(); },
  auth: { onAuthStateChange(listener) { authListeners.add(listener); return { data: { subscription: { unsubscribe() { authListeners.delete(listener); } } } }; } },
};
const fakeWindow = {
  setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
  setInterval() { return ++nextTimer; }, clearInterval() {},
  addEventListener(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
  removeEventListener(name, callback) { events.get(name)?.delete(callback); },
};
const { useRecipientNotifications } = load('hooks/use-recipient-notifications.ts', {
  window: fakeWindow, document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  require(name) {
    if (name === '@/lib/supabase/client') return { supabase };
    if (name === 'react') return {
      useCallback(callback) { return callback; },
      useSyncExternalStore(subscribe, getSnapshot) { const record = { getSnapshot }; subscriptions.push(record); record.unsubscribe = subscribe(() => {}); return getSnapshot(); },
    };
    throw new Error(`Unexpected import ${name}`);
  },
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
const desktop = useRecipientNotifications('admin', 'admin-a');
useRecipientNotifications('admin', 'admin-a');
await flush();
assert.equal(channels.length, 1, 'desktop and mobile bells share one channel');
assert.equal(queries.length, 2, 'duplicate bells share one list/count load');
assert.equal(channels[0].handlers[0].filter.filter, 'recipient_id=eq.admin-a');
assert.equal(subscriptions[0].getSnapshot().items[0].title, 'admin-a');
assert.equal(subscriptions[1].getSnapshot().unread, 1);
await desktop.markRead('notification-1');
const ack = queries.find((query) => query.updating);
assert.deepEqual(ack.filters, [['recipient_id', 'admin-a'], ['read_at', null], ['id', 'notification-1']]);
assert.deepEqual(Object.keys(ack.values), ['read_at']);
const before = queries.length;
events.get('ansha:notification').forEach((callback) => callback());
timers.forEach((callback) => callback());
timers.clear();
await flush();
assert.equal(queries.length, before + 2, 'foreground push refreshes list and count');

let release;
delayLoads = new Promise((resolve) => { release = resolve; });
useRecipientNotifications('portal', 'customer-b');
await flush();
const portal = subscriptions.at(-1);
assert.equal(portal.getSnapshot().items.length, 0, 'a new user never sees the previous user snapshot');
assert.equal(channels.at(-1).handlers[0].filter.filter, 'recipient_id=eq.customer-b');
authListeners.forEach((listener) => listener('SIGNED_OUT', null));
release();
await flush();
assert.equal(portal.getSnapshot().items.length, 0, 'an in-flight load cannot repopulate notifications after logout');
assert.equal(subscriptions[0].getSnapshot().unread, 0, 'logout clears existing unread counts');
subscriptions.forEach(({ unsubscribe }) => unsubscribe());
assert.equal(events.get('ansha:notification').size, 0, 'foreground push listeners are removed');
console.log('Notification links, shared realtime stores, recipient-scoped acknowledgements, and logout races passed.');
