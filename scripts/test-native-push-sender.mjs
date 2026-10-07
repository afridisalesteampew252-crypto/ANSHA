import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const secret = 'unit-test-webhook-secret-with-32-characters';
let handler;
let active = true;
let eligible = true;
let href = '/admin/invoices';
let queries = [];
let sent = [];
const notificationId = '00000000-0000-4000-8000-000000000001';
const service = {
  async rpc(name, args) {
    assert.equal(name, 'native_notification_delivery_allowed');
    assert.equal(args.p_id, notificationId);
    assert.ok(['admin','customer'].includes(args.p_audience));
    return { data: eligible, error: null };
  },
  from(table) {
    const query = { table, filters: {} };
    queries.push(query);
    const result = () => ({ error: null, data: table.endsWith('_notifications')
      ? { id: notificationId, recipient_id: 'recipient-A', title: 'Alert', body: 'New event', href }
      : table.endsWith('_profiles') ? active ? { id: 'recipient-A' } : null
      : [{ id: 'device-A', device_token: 'recipient-A-device-token' }] });
    const builder = {
      select() { return this; }, eq(key, value) { query.filters[key] = value; return this; },
      not() { return this; }, delete() { return this; }, in() { return this; },
      maybeSingle: async () => result(), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  },
};
const compiled = ts.transpileModule(readFileSync('supabase/functions/send-admin-push/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, {
  exports: {}, require: () => ({ createClient: () => service }),
  Deno: { serve: (callback) => { handler = callback; }, env: { get: (key) => ({
    ADMIN_PUSH_WEBHOOK_SECRET: secret, SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'unit-test-only',
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'unit-test', client_email: 'unit-test@example.com', private_key: '-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----' }),
  })[key] } },
  TextEncoder, Response, URL, URLSearchParams, Uint8Array, btoa, atob,
  crypto: { subtle: { importKey: async () => ({}), sign: async () => new Uint8Array([1, 2, 3]).buffer } },
  fetch: async (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'unit-test-access-token' });
    sent.push(JSON.parse(init.body));
    return Response.json({ name: 'projects/unit-test/messages/test' });
  },
  console,
});

function request(body, authorized = true) {
  return new Request('https://sender.example', { method: 'POST', headers: {
    'content-type': 'application/json', ...(authorized ? { 'x-admin-push-secret': secret } : {}),
  }, body: JSON.stringify(body) });
}
assert.equal((await handler(request({ notification_id: notificationId }, false))).status, 401);
assert.equal((await handler(request({ notification_id: notificationId, audience: 'arbitrary_table' }))).status, 400);
for (const audience of ['admin', 'customer']) {
  queries = []; sent = []; active = true;
  href = audience === 'admin' ? '/admin/system-health' : '/portal/invoices?invoice=123';
  const response = await handler(request({ notification_id: notificationId, audience }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sent, 1);
  assert.equal(queries[0].table, audience === 'admin' ? 'admin_notifications' : 'customer_notifications');
  assert.equal(queries.find((q) => q.table === 'push_subscriptions').filters.user_id, 'recipient-A');
  assert.equal(sent[0].message.token, 'recipient-A-device-token');
  assert.equal(sent[0].message.data.url, href);
  assert.equal(sent[0].message.android.notification.channel_id, 'ansha_default');
}
sent = []; active = false;
assert.equal((await (await handler(request({ notification_id: notificationId, audience: 'customer' }))).json()).sent, 0);
assert.equal(sent.length, 0);
active = true; sent = []; href = 'https://evil.example/portal/invoices';
await handler(request({ notification_id: notificationId, audience: 'customer' }));
assert.equal(sent[0].message.data.url, '/portal/notifications');
eligible = false; sent = [];
assert.equal((await (await handler(request({ notification_id: notificationId, audience: 'admin' }))).json()).sent, 0);
assert.equal(sent.length, 0);
console.log('Native push sender authorization, audience isolation, recipient routing, and channel checks passed.');
