import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, {
    exports, Request, Response, TextDecoder,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

const rbac = load('lib/admin-rbac.ts');
const bodyReader = load('lib/request-json.ts');
const { isActiveAdminProfile } = rbac;
const { readJsonObject, RequestBodyError } = bodyReader;
const roles = ['admin', 'staff', 'sales', 'freelancer', 'manager', 'accounts'];
for (const role of roles) {
  assert.equal(isActiveAdminProfile({ role, is_active: true }), true);
  for (const is_active of [false, null, undefined, 1, 'true']) {
    assert.equal(isActiveAdminProfile({ role, is_active }), false);
  }
}
for (const profile of [null, undefined, {}, { is_active: true },
  ...['owner', 'ADMIN', '', null].map((role) => ({ role, is_active: true }))]) {
  assert.equal(isActiveAdminProfile(profile), false);
}

const request = (body, headers) => new Request('https://fixture.invalid/api/revalidate', {
  method: 'POST', body, headers,
});
const status = (expected) => (error) => error instanceof RequestBodyError && error.status === expected;
assert.equal((await readJsonObject(request('{"kind":"vehicle"}'), 64)).kind, 'vehicle');
for (const input of ['null', '[]', 'true', '42', '"text"', '{', '']) {
  await assert.rejects(readJsonObject(request(input), 64), status(400));
}
await assert.rejects(readJsonObject(request(null), 64), status(400));
await assert.rejects(readJsonObject(request('{}', { 'Content-Length': '65' }), 64), status(413));
const unicode = '{"value":"🚗"}';
const unicodeBytes = new TextEncoder().encode(unicode).byteLength;
assert.equal((await readJsonObject(request(unicode), unicodeBytes)).value, '🚗');
await assert.rejects(readJsonObject(request(unicode), unicodeBytes - 1), status(413));

// An absent or false Content-Length must not bypass the actual-byte limit.
for (const headers of [undefined, { 'Content-Length': '1' }]) {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new Uint8Array(128).fill(97));
    },
    cancel() { cancelled = true; },
  });
  const chunked = new Request('https://fixture.invalid', { method: 'POST', body: stream, duplex: 'half', headers });
  await assert.rejects(readJsonObject(chunked, 32), status(413));
  assert.equal(cancelled, true, 'over-limit streams are cancelled');
  assert.equal(chunked.body.locked, false, 'reader lock is released');
}
await assert.rejects(readJsonObject(request(new Uint8Array([0xff])), 32), status(400));

let profile = { role: 'staff', is_active: true };
let user = { id: 'fixture-staff' };
let revalidationCalls = 0;
const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: profile }; } };
const route = load('app/api/revalidate/route.ts', {
  '@/lib/admin-rbac': rbac,
  '@/lib/request-json': bodyReader,
  '@/lib/supabase/server': { createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) }, from: () => query,
  }) },
  '@/lib/revalidate-public-server': { revalidatePublicListing(kind) {
    revalidationCalls += 1;
    assert.equal(kind, 'vehicle');
    return ['/vehicles'];
  } },
});
for (const input of ['null', '[]', '{', '{"kind":"unknown"}']) {
  assert.equal((await route.POST(request(input))).status, 400);
}
assert.equal((await route.POST(request(' '.repeat(16385)))).status, 413);
assert.equal(revalidationCalls, 0);
for (const invalid of [null, { role: 'staff', is_active: null }, { role: 'unknown', is_active: true }]) {
  profile = invalid;
  assert.equal((await route.POST(request('{"kind":"vehicle"}'))).status, 403);
}
profile = { role: 'staff', is_active: true };
user = null;
assert.equal((await route.POST(request('{"kind":"vehicle"}'))).status, 401);
assert.equal(revalidationCalls, 0);
user = { id: 'fixture-staff' };
assert.equal((await route.POST(request('{"kind":"vehicle"}'))).status, 200);
assert.equal(revalidationCalls, 1);
console.log('Admin activation, role allowlist, byte limits, malformed JSON, and revalidation boundary checks passed.');
