import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const exports = {};
const compiled = ts.transpileModule(readFileSync('supabase/functions/_shared/password-login.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(compiled.outputText, { exports, crypto: webcrypto, TextEncoder });
const { parsePasswordLogin, passwordLoginIdentifier, wrongPassword, passwordLoginFailure } = exports;

const valid = parsePasswordLogin({ email: '  STAFF@Example.com ', password: ' keep spaces ', scope: 'admin' });
assert.equal(valid.email, 'staff@example.com');
assert.equal(valid.password, ' keep spaces ');
assert.equal(valid.scope, 'admin');
assert.equal(parsePasswordLogin({ email: 'customer@example.com', password: 'correct', scope: 'customer' }).scope, 'customer');
for (const input of [null, {}, { email: 5, password: 'abc', scope: 'admin' },
  { email: 'not-an-email', password: 'x', scope: 'admin' },
  { email: 'a@b.co', password: '', scope: 'admin' },
  { email: 'a@b.co', password: 'x'.repeat(1025), scope: 'admin' },
  { email: 'a@b.co', password: 'x', scope: 'staff' }]) {
  assert.equal(parsePasswordLogin(input), null);
}
assert.equal(await passwordLoginIdentifier(' STAFF@example.com '), await passwordLoginIdentifier('staff@example.com'));
assert.equal(await passwordLoginIdentifier('staff@example.com'), '793c70b36612c39d122ada0306b6be2713279e904571977372e4c769e784b72a');
assert.equal(wrongPassword({ code: 'invalid_credentials' }), true);
for (const error of [null, { code: 'email_not_confirmed' }, { code: 'over_request_rate_limit' }, { code: 'network_error' }]) assert.equal(wrongPassword(error), false);
assert.match(passwordLoginFailure({ attempts: 2, retry_after: 0, locked_until: null }).error, /1 attempts remain/);
assert.match(passwordLoginFailure({ attempts: 3, retry_after: 300, locked_until: '2026-10-07T12:05:00Z' }).error, /locked for 5 minutes/);
assert.match(passwordLoginFailure({ attempts: 0, retry_after: 30, locked_until: null, busy: true }).error, /already in progress/);
console.log('Password login validation, shared identity, and provider failure checks passed.');

let sessionWrites = 0;
let response;
const browserSupabase = {
  functions: { invoke: async (name, options) => {
    assert.equal(name, 'password-login');
    assert.equal(options.body.email, 'staff@example.com');
    return response;
  } },
  auth: { setSession: async (session) => {
    sessionWrites += 1;
    assert.equal(session.access_token, 'test-access');
    return { data: { user: { id: 'user-fixture' } }, error: null };
  } },
};
const browserExports = {};
const browserCompiled = ts.transpileModule(readFileSync('lib/password-login.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(browserCompiled.outputText, { exports: browserExports, Response, require: () => ({ supabase: browserSupabase }) });
const protectedSignIn = browserExports.signInWithProtectedPassword;
response = { data: null, error: { context: Response.json({ error: 'Locked', attempts: 3, locked_until: '2026-10-07T12:05:00Z' }, { status: 429 }) } };
const locked = await protectedSignIn('admin', ' STAFF@example.com ', 'fixture-password');
assert.equal(locked.error, 'Locked');
assert.equal(locked.attempts, 3);
assert.equal(locked.lockedUntil, Date.parse('2026-10-07T12:05:00Z'));
assert.equal(sessionWrites, 0, 'a locked response must never establish an auth session');
response = { data: { session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null };
const successful = await protectedSignIn('customer', 'staff@example.com', 'fixture-password');
assert.equal(successful.data.user.id, 'user-fixture');
assert.equal(successful.error, null);
assert.equal(sessionWrites, 1);
response = { data: null, error: { context: Response.json({ error: 'Provider unavailable' }, { status: 503 }) } };
const providerError = await protectedSignIn('admin', 'staff@example.com', 'fixture-password');
assert.equal(providerError.attempts, undefined, 'transport outages must not invent wrong-password failures');
assert.equal(sessionWrites, 1);
console.log('Browser login preserves server cooldown and creates sessions only after gateway success.');
