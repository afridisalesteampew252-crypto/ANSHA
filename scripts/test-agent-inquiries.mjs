import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals = {}, dependencies = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, { exports, URL, URLSearchParams, require(name) {
    assert.ok(name in dependencies, `Unexpected pure-helper dependency ${name}`);
    return dependencies[name];
  }, ...globals });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const referral = load('lib/inquiry-referral.ts');
const workflow = load('lib/sales-inquiries.ts', {}, { '@/lib/inquiry-referral': referral });
const now = Date.parse('2026-10-07T12:00:00Z');
const firstCode = 'verified_agent_a';
const secondCode = 'verified_agent_b';
const stored = new Map();
const writes = [];
const storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem(key, value) { stored.set(key, value); writes.push([key, value]); },
  removeItem: (key) => stored.delete(key),
};
assert.equal(referral.REFERRAL_WINDOW_MS, 30 * 24 * 60 * 60 * 1000);
assert.equal(referral.normalizeInquiryReferralCode('  VERIFIED_Agent_A  '), firstCode);
for (const invalid of [null, {}, [], 123, '', 'short', 'a'.repeat(81), '../someone', 'https://example.com', '<script>alert(1)</script>', 'agent code']) {
  assert.equal(referral.normalizeInquiryReferralCode(invalid), null);
}
assert.equal(referral.captureInquiryReferral(firstCode, storage, now), firstCode);
const original = stored.get(referral.REFERRAL_STORAGE_KEY);
assert.equal(referral.captureInquiryReferral(secondCode, storage, now + 1000), firstCode, 'Later referral links cannot replace the first active introducer');
assert.equal(referral.captureInquiryReferral('malformed', storage, now + 2000), firstCode, 'Invalid links cannot erase valid first attribution');
assert.equal(writes.length, 1, 'Return visits do not extend the original referral window');
assert.equal(stored.get(referral.REFERRAL_STORAGE_KEY), original);
assert.equal(referral.getInquiryReferral(storage, now + referral.REFERRAL_WINDOW_MS - 1), firstCode);
assert.equal(referral.getInquiryReferral(storage, now + referral.REFERRAL_WINDOW_MS), null, 'Thirty-day expiry is exact');
assert.equal(stored.has(referral.REFERRAL_STORAGE_KEY), false, 'Expired attribution is removed');
assert.equal(referral.captureInquiryReferral(secondCode, storage, now + referral.REFERRAL_WINDOW_MS), secondCode, 'A new referral starts only after the original expires');
for (const invalid of ['bad json', 'null', '[]', '{}', JSON.stringify({ code: firstCode, capturedAt: now + 1 }), JSON.stringify({ code: firstCode, capturedAt: -1 }), JSON.stringify({ code: firstCode, capturedAt: String(now) })]) {
  stored.set(referral.REFERRAL_STORAGE_KEY, invalid);
  assert.equal(referral.getInquiryReferral(storage, now), null);
  assert.equal(stored.has(referral.REFERRAL_STORAGE_KEY), false);
}
assert.equal(referral.readInquiryReferralRecord(original, Number.NaN), null);
const unavailableStorage = { getItem() { throw new Error('Storage disabled'); }, setItem() { throw new Error('Storage disabled'); }, removeItem() { throw new Error('Storage disabled'); } };
assert.equal(referral.getInquiryReferral(unavailableStorage, now), null);
assert.equal(referral.captureInquiryReferral(firstCode, unavailableStorage, now), firstCode, 'A valid current-link referral can still be submitted when persistence is blocked');
const browserRecords = new Map();
const browserWindow = { location: { search: '?ref=VERIFIED_Agent_A' }, localStorage: {
  getItem: (key) => browserRecords.get(key) ?? null,
  setItem: (key, value) => browserRecords.set(key, value),
  removeItem: (key) => browserRecords.delete(key),
} };
const browserReferral = load('lib/inquiry-referral.ts', { window: browserWindow });
assert.equal(browserReferral.getBrowserInquiryReferral(), firstCode, 'Actual URL capture normalizes the ref parameter');
browserWindow.location.search = '?ref=verified_agent_b';
assert.equal(browserReferral.getBrowserInquiryReferral(), firstCode, 'Changing the URL still keeps the original attribution');

for (const contact of [['customer@example.com', ''], ['', '+92 300 1234567'], ['customer@example.com', '+971 50 123 4567']]) {
  assert.equal(referral.validateInquiryContact(...contact), null, 'Email or phone individually is sufficient');
}
for (const contact of [['', ''], ['not-an-email', ''], ['', 'abc'], ['', '123'], ['', '1'.repeat(21)], ['customer@example.com', '<script>']]) {
  assert.ok(referral.validateInquiryContact(...contact), 'Invalid contact details must stop a submission');
}
const input = { name: '  Customer  ', email: ' customer@example.com ', phone: '', message: '  Please quote this stock.  ', source: 'portal',
  introduced_by: 'forged-agent', customer_profile_id: 'another-customer', commission_amount: 999, status: 'won' };
const args = referral.buildSalesInquiryParams(input, firstCode);
assert.deepEqual(plain(args), {
  p_customer_name: 'Customer', p_customer_email: 'customer@example.com', p_customer_phone: null,
  p_message: 'Please quote this stock.', p_part_id: null, p_vehicle_id: null, p_referral_code: firstCode, p_source: 'portal',
}, 'Public intake sends only the narrow RPC arguments; attribution and customer identity are resolved server-side');
assert.equal(referral.buildSalesInquiryParams({ name: 'Customer', phone: '+92 300 1234567', message: 'Phone-only request' }, 'bad').p_referral_code, null);
assert.throws(() => referral.buildSalesInquiryParams({ ...input, email: '', phone: '' }), /phone number or email/i);
assert.throws(() => referral.buildSalesInquiryParams({ ...input, partId: 'part', vehicleId: 'vehicle' }), /one vehicle or part/i);
assert.throws(() => referral.buildSalesInquiryParams({ ...input, source: 'manual' }), /source/i);
const receipt = { id: '82000000-0000-4000-8000-000000000001', inquiry_number: 'INQ-2026-0001' };
assert.deepEqual(plain(referral.parseSalesInquiryReceipt(receipt)), receipt);
for (const badReceipt of [null, [], {}, { ...receipt, id: 'not-a-uuid' }, { ...receipt, inquiry_number: '<unsafe>' }]) {
  assert.throws(() => referral.parseSalesInquiryReceipt(badReceipt), /confirmation/i);
}
let rpcCount = 0;
const client = { async rpc(name, payload) {
  rpcCount += 1;
  assert.equal(name, 'submit_sales_inquiry');
  assert.deepEqual(plain(payload), plain(args));
  return { data: receipt, error: null };
} };
assert.equal(rpcCount, 0, 'Capturing a referral is not an inquiry or a commission event');
assert.deepEqual(plain(await referral.submitSalesInquiry(client, input, firstCode)), receipt);
assert.equal(rpcCount, 1);
const rpcError = { message: 'Too many inquiries' };
await assert.rejects(referral.submitSalesInquiry({ rpc: async () => ({ data: null, error: rpcError }) }, input, firstCode), (error) => error === rpcError, 'Server validation/rate-limit failures must reach the caller');

const inquiry = {
  id: receipt.id, inquiry_number: receipt.inquiry_number, inquiry_source: 'website', lead_stage: 'quoted',
  introduced_by: 'original-referrer', assigned_to: 'agent-a', created_by: 'creator-a',
  customer_id: 'customer-a', due_at: '2026-10-07T11:00:00Z', part_id: null, vehicle_id: null, stock_slug: null,
};
const actor = { role: 'sales', userId: 'agent-a', verificationStatus: 'verified' };
assert.equal(workflow.canEditSalesInquiry('sales', 'agent-a', 'verified', inquiry), true);
assert.equal(workflow.canEditSalesInquiry('freelancer', 'agent-a', 'verified', inquiry), true);
for (const [role, userId, status] of [['sales', 'agent-b', 'verified'], ['sales', 'agent-a', 'pending'], ['sales', 'agent-a', 'rejected'], ['sales', 'agent-a', 'suspended'], ['manager', 'agent-a', 'verified'], ['accounts', 'agent-a', 'verified']]) {
  assert.equal(workflow.canEditSalesInquiry(role, userId, status, inquiry), false, 'Only verified assigned field agents can edit their leads');
}
const ownUnassigned = { ...inquiry, assigned_to: null, created_by: 'agent-a', can_edit: false };
assert.equal(workflow.canEditSalesInquiry('sales', 'agent-a', 'verified', ownUnassigned), false, 'Creating a lead does not assign it or grant editing');
assert.equal(workflow.canEditSalesInquiry('admin', 'admin-a', null, { ...inquiry, can_edit: false }), false, 'Server read-only flags are respected');
for (const role of ['admin', 'staff', 'sales', 'freelancer']) {
  assert.equal(workflow.canEditSalesInquiry(role, '', 'verified', inquiry), false, 'A role without a current signed-in actor cannot enable edits');
}
assert.equal(workflow.canEditSalesInquiry('sales', 'agent-a', 'verified', { ...inquiry, assigned_to: 'agent-b' }), false, 'Transfer removes the previous assignee edit access');
assert.deepEqual(plain(workflow.verifiedAssignees([
  { agent_id: 'yes', role: 'sales', is_active: true, verification_status: 'verified' },
  { agent_id: 'freelancer', role: 'freelancer', is_active: true, verification_status: 'verified' },
  { agent_id: 'pending', role: 'sales', is_active: true, verification_status: 'pending' },
  { agent_id: 'suspended', role: 'sales', is_active: true, verification_status: 'suspended' },
  { agent_id: 'inactive', role: 'sales', is_active: false, verification_status: 'verified' },
  { agent_id: 'admin', role: 'admin', is_active: true, verification_status: 'verified' },
])).map((agent) => agent.agent_id), ['yes', 'freelancer']);
const draft = { stage: 'won', assigneeId: 'agent-b', customerId: 'customer-b', dueLocal: workflow.dateToLocalInput(inquiry.due_at), note: '  Quote accepted  ',
  introduced_by: 'agent-b', payment_status: 'paid', commission_amount: 999 };
const inquirySnapshot = JSON.stringify(inquiry);
const agentUpdate = workflow.inquiryUpdatePayload(inquiry, draft, actor);
assert.deepEqual(Object.keys(agentUpdate).sort(), ['p_inquiry_id', 'p_stage', 'p_assigned_to', 'p_set_assignee', 'p_due_at', 'p_set_due', 'p_note', 'p_customer_id', 'p_set_customer'].sort());
assert.equal(agentUpdate.p_stage, 'won');
assert.equal(agentUpdate.p_note, 'Quote accepted');
assert.equal(agentUpdate.p_set_assignee, false);
assert.equal(agentUpdate.p_assigned_to, null);
assert.equal(agentUpdate.p_set_customer, false);
assert.equal(agentUpdate.p_customer_id, null);
assert.equal(agentUpdate.p_set_due, false);
assert.equal('introduced_by' in agentUpdate || 'payment_status' in agentUpdate || 'commission_amount' in agentUpdate, false, 'Won updates never request payment, payout or referral rewrites');
const adminUpdate = workflow.inquiryUpdatePayload(inquiry, draft, { role: 'admin', userId: 'admin-a' });
assert.equal(adminUpdate.p_set_assignee, true);
assert.equal(adminUpdate.p_assigned_to, 'agent-b');
assert.equal(adminUpdate.p_set_customer, true);
assert.equal(adminUpdate.p_customer_id, 'customer-b');
assert.equal(JSON.stringify(inquiry), inquirySnapshot, 'Assignment payload construction preserves the original introducer and source record');
assert.throws(() => workflow.inquiryUpdatePayload(inquiry, { ...draft, stage: 'paid' }, actor), /stage/i);
assert.throws(() => workflow.inquiryUpdatePayload(inquiry, { ...draft, dueLocal: 'not-a-date' }, actor), /date/i);
assert.throws(() => workflow.inquiryUpdatePayload(ownUnassigned, draft, actor), /read-only/i);
const clearDue = workflow.inquiryUpdatePayload(inquiry, { ...draft, dueLocal: '' }, actor);
assert.equal(clearDue.p_set_due, true);
assert.equal(clearDue.p_due_at, null);
assert.equal(workflow.isInquiryOverdue(inquiry, now), true);
assert.equal(workflow.isInquiryOverdue({ ...inquiry, due_at: new Date(now).toISOString() }, now), false);
assert.equal(workflow.isInquiryOverdue({ ...inquiry, due_at: 'bad-date' }, now), false);
for (const lead_stage of ['won', 'lost', 'archived']) assert.equal(workflow.isInquiryOverdue({ ...inquiry, lead_stage }, now), false, 'Closed and archived leads do not remain overdue tasks');
assert.equal(workflow.matchesInquiryFilters(inquiry, { source: 'website', assignee: 'agent-a', overdue: true }, now), true);
assert.equal(workflow.matchesInquiryFilters(inquiry, { source: 'phone' }, now), false);
assert.equal(workflow.matchesInquiryFilters(inquiry, { assignee: 'unassigned' }, now), false);
assert.equal(workflow.matchesInquiryFilters(ownUnassigned, { assignee: 'unassigned' }, now), true);
assert.equal(workflow.validateManualInquiry({ name: 'Customer', email: '', phone: '+92 300 1234567', message: 'Phone inquiry' }), null);
assert.equal(workflow.validateManualInquiry({ name: 'Customer', email: 'customer@example.com', phone: '', message: 'Email inquiry' }), null);
assert.ok(workflow.validateManualInquiry({ name: 'Customer', email: '', phone: '', message: 'No contact' }));
const maximumIntake = { name: 'a'.repeat(120), email: 'customer@example.com', phone: '', message: 'm'.repeat(5000) };
assert.equal(workflow.validateManualInquiry(maximumIntake), null, 'Full permitted customer submissions fit both manual and public intake');
assert.ok(workflow.validateManualInquiry({ ...maximumIntake, name: 'a'.repeat(121) }));
assert.ok(workflow.validateManualInquiry({ ...maximumIntake, message: 'm'.repeat(5001) }));
assert.doesNotThrow(() => referral.buildSalesInquiryParams(maximumIntake));
assert.throws(() => referral.buildSalesInquiryParams({ ...maximumIntake, name: 'a'.repeat(121) }), /name/i);
assert.throws(() => referral.buildSalesInquiryParams({ ...maximumIntake, message: 'm'.repeat(5001) }), /message/i);
console.log('Agent inquiry checks passed: first referral expiry, narrow intake, verified assignment scope, transfer, won-stage isolation and follow-up filters.');
