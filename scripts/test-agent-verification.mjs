import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const compiled = ts.transpileModule(readFileSync('lib/agent-verification.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(compiled.outputText, { exports, URL });
const { validateSalesAgentContact, normalizeSalesAgentContact, canShareAgentReferral, salesAgentReferralUrl } = exports;
const contact = { full_name: '  Agent Example  ', email: ' AGENT@example.com ', phone: '+971 (50) 123-4567' };
assert.deepEqual(JSON.parse(JSON.stringify(normalizeSalesAgentContact(contact))), {
  full_name: 'Agent Example', email: 'agent@example.com', phone: '+971501234567',
});
assert.equal(validateSalesAgentContact(contact), null);
for (const change of [
  { full_name: ' ' }, { full_name: 'a' }, { full_name: 'a'.repeat(161) },
  { email: '' }, { email: 'no-domain' }, { email: 'two@@example.com' }, { email: 'bad contact@example.com' },
  { phone: '' }, { phone: '123' }, { phone: '+1234567890123456' }, { phone: '+971+501234567' },
  { phone: '+971letters501234567' }, { phone: '+971501234567<unsafe>' },
]) assert.ok(validateSalesAgentContact({ ...contact, ...change }), `Invalid contact must fail: ${JSON.stringify(change)}`);
for (const phone of ['1234567', '+123456789012345', '+92 300 1234567', '+971.50.123.4567']) {
  assert.equal(validateSalesAgentContact({ ...contact, phone }), null);
}

const agent = {
  agent_id: 'agent-fixture', full_name: 'Agent Example', email: 'agent@example.com', phone: '+971501234567',
  role: 'freelancer', is_active: true, verification_status: 'verified',
  referral_code: '4c42e63d46df4f0ea07cfe2157823a86', reviewed_at: '2026-10-07T12:00:00Z', review_note: 'Manual review complete',
};
assert.equal(canShareAgentReferral(agent), true);
assert.equal(salesAgentReferralUrl(agent, 'https://ansha.example/admin/agents?other=value#secret'),
  'https://ansha.example/?ref=4c42e63d46df4f0ea07cfe2157823a86', 'Share links use only the public home route and permanent referral code');
for (const verification_status of ['pending', 'rejected', 'suspended']) {
  assert.equal(canShareAgentReferral({ ...agent, verification_status }), false);
  assert.equal(salesAgentReferralUrl({ ...agent, verification_status }, 'https://ansha.example'), null);
}
assert.equal(canShareAgentReferral({ ...agent, is_active: false }), false);
assert.equal(canShareAgentReferral({ ...agent, role: 'admin' }), false);
assert.equal(salesAgentReferralUrl({ ...agent, is_active: false }, 'https://ansha.example'), null);
for (const referral_code of [null, '', 'invalid', 'A'.repeat(32), '../unsafe', 'a'.repeat(33)]) {
  assert.equal(canShareAgentReferral({ ...agent, referral_code }), false);
}
for (const origin of ['', 'broken-origin', 'javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/test']) {
  assert.equal(salesAgentReferralUrl(agent, origin), null);
}
console.log('Agent verification contact validation, accurate share eligibility and public URL checks passed.');
