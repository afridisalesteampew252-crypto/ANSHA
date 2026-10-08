import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync('lib/chat-unread.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(compiled.outputText, { exports, Date });
const { fetchChatUnreadCounts } = exports;
const id = (number) => `92000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const actor = id(9000);
const otherActor = id(9001);
const readAt = '2026-10-07T12:00:00Z';
const memberships = Array.from({ length: 1005 }, (_, index) => ({ conversation_id: id(index + 1), user_id: actor, last_read_at: index === 1 ? readAt : null }));
memberships.push({ conversation_id: id(4000), user_id: otherActor, last_read_at: null });
const incoming = (created_at = '2026-10-07T13:00:00Z') => ({ sender_id: otherActor, created_at });
const messagesFor = (conversationId) => conversationId === id(1)
  ? [...Array.from({ length: 1205 }, () => incoming()), { sender_id: actor, created_at: readAt }]
  : conversationId === id(2)
    ? [incoming('2026-10-07T11:59:59Z'), incoming(readAt), incoming('2026-10-07T12:00:01Z'), incoming('2026-10-07T12:00:02Z'), { sender_id: actor, created_at: '2026-10-07T13:00:00Z' }]
    : [incoming()];
function fixture({ cap = 137, rows = memberships, change = () => {} } = {}) {
  const calls = [];
  let active = 0;
  let maximum = 0;
  return { calls, get maximum() { return maximum; }, client: { from(table) {
    const call = { table, filters: [] };
    const query = {
      select(columns, options) { call.columns = columns; call.options = options; return query; },
      eq(column, value) { call.filters.push(['eq', column, value]); return query; },
      neq(column, value) { call.filters.push(['neq', column, value]); return query; },
      gt(column, value) { call.filters.push(['gt', column, value]); return query; },
      order(column, options) { call.order = [column, options]; return query; },
      range(from, to) { call.range = [from, to]; return query; },
      abortSignal(signal) { call.signal = signal; return query; },
      then(resolve, reject) {
        calls.push(call);
        if (table === 'chat_messages') { active += 1; maximum = Math.max(maximum, active); }
        return new Promise((done) => setImmediate(done)).then(() => {
          if (call.signal?.aborted) return { data: null, count: null, error: { message: 'Aborted' } };
          let selected = table === 'chat_participants' ? [...rows] : messagesFor(call.filters.find(([, column]) => column === 'conversation_id')[2]);
          for (const [operator, column, value] of call.filters) {
            if (column === 'conversation_id' && table === 'chat_messages') continue;
            selected = selected.filter((row) => operator === 'eq' ? row[column] === value : operator === 'neq' ? row[column] !== value : Date.parse(row[column]) > Date.parse(value));
          }
          selected.sort((a, b) => String(a.conversation_id).localeCompare(String(b.conversation_id)));
          const from = call.range?.[0] ?? 0;
          const result = { data: call.options.head ? null : selected.slice(from, Math.min((call.range?.[1] ?? 999) + 1, from + cap)), count: selected.length, error: null };
          change(call, result);
          return result;
        }).finally(() => { if (table === 'chat_messages') active -= 1; }).then(resolve, reject);
      },
    };
    return query;
  } } };
}

const complete = fixture();
const counts = await fetchChatUnreadCounts(complete.client, actor);
assert.equal(counts.memberships.length, 1005, 'Memberships beyond the provider row limit remain counted');
assert.equal(counts.total, 2210, 'Unread totals exceed both the former 200 and 1,000 message caps');
assert.equal(counts.byConversation[id(1)], 1205);
assert.equal(counts.byConversation[id(2)], 2, 'Only messages strictly newer than read_at and sent by somebody else are unread');
assert.equal(id(4000) in counts.byConversation, false, 'Another recipient membership never enters the queries or totals');
assert.equal(complete.maximum, 3, 'Counts use only three concurrent server requests');
for (const call of complete.calls) {
  assert.equal(call.options.count, 'exact');
  if (call.table === 'chat_participants') {
    assert.deepEqual(call.filters, [['eq', 'user_id', actor]]);
    assert.equal(call.order[0], 'conversation_id');
    assert.equal(call.order[1].ascending, true);
  } else {
    assert.equal(call.options.head, true, 'Message histories and bodies are never downloaded to calculate unread totals');
    assert.equal(call.columns, 'id');
    assert.ok(call.filters.some(([operator, column, value]) => operator === 'neq' && column === 'sender_id' && value === actor));
    assert.ok(call.filters.some(([operator, column]) => operator === 'eq' && column === 'conversation_id'));
    assert.equal(call.range, undefined, 'Server counts have no pagination cap');
  }
}
const none = fixture({ rows: [] });
assert.equal((await fetchChatUnreadCounts(none.client, actor)).total, 0);
assert.equal(none.calls.length, 1, 'Empty membership lists need no message queries');
for (const invalid of ['', '../actor', 'not-a-uuid']) {
  const invalidActor = fixture();
  await assert.rejects(fetchChatUnreadCounts(invalidActor.client, invalid));
  assert.equal(invalidActor.calls.length, 0);
}
for (const table of ['chat_participants', 'chat_messages']) {
  for (const change of [
    (call, result) => { if (call.table === table) result.count = null; },
    (call, result) => { if (call.table === table) result.error = { message: 'Permission or connection failure' }; },
  ]) await assert.rejects(fetchChatUnreadCounts(fixture({ change }).client, actor), /retry/i, 'Failures are visible, never interpreted as zero unread');
}
for (const change of [
  (call, result) => { if (call.table === 'chat_participants' && call.range[0]) result.count += 1; },
  (call, result) => { if (call.table === 'chat_participants' && call.range[0]) result.data = []; },
  (call, result) => { if (call.table === 'chat_messages' && call.filters.some(([, column, value]) => column === 'conversation_id' && value === id(1005))) result.error = { message: 'Late final membership failure' }; },
]) await assert.rejects(fetchChatUnreadCounts(fixture({ change }).client, actor), /retry/i, 'An incomplete later page/count cannot return partial success');
const duplicate = fixture({ rows: [memberships[0], memberships[0]] });
await assert.rejects(fetchChatUnreadCounts(duplicate.client, actor), /invalid/i);
const invalidRead = fixture({ rows: [{ ...memberships[0], last_read_at: 'not-a-date' }] });
await assert.rejects(fetchChatUnreadCounts(invalidRead.client, actor), /invalid/i);
const cancelled = fixture();
const controller = new AbortController();
controller.abort();
await assert.rejects(fetchChatUnreadCounts(cancelled.client, actor, controller.signal));
assert.equal(cancelled.calls.length, 0, 'An obsolete recipient load schedules no requests');
console.log('Unread chat checks passed: complete membership pagination, exact server counts beyond 1,000 messages, recipient/read timestamp scope, concurrency, cancellation and atomic error handling.');
