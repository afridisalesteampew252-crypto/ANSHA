import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as sdk from 'ai';
import { z } from 'zod';

function load(path, dependencies) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(compiled.outputText, { exports, URL, Response, TextEncoder, TextDecoder, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  } }, { filename: path });
  return exports;
}
const guard = load('lib/ai/chat-guard.ts', { ai: sdk });
const question = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How many parts are available?' }] };
const request = (body, headers = {}) => new Request('https://ansha.example/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
assert.equal((await guard.readAiChatRequest(request({ messages: [question] }))).messages.length, 1);
for (const [body, status] of [
  ['broken JSON', 400], [null, 400], [{ messages: [] }, 400],
  [{ messages: Array.from({ length: 41 }, () => question) }, 413],
  [{ messages: [{ ...question, role: 'system' }] }, 400],
  [{ messages: [{ ...question, parts: [{ type: 'text', text: 'x'.repeat(12001) }] }] }, 413],
  [{ messages: [{ ...question, parts: [{ type: 'file', url: 'https://external.invalid' }] }] }, 400],
  [{ messages: [question], threadId: 'not-a-uuid' }, 400],
  [{ messages: [{ ...question, role: 'assistant' }] }, 400],
  [{ messages: [question], padding: 'x'.repeat(140000) }, 413],
]) await assert.rejects(guard.readAiChatRequest(request(body)), error => error.status === status);
const oversized = request({ messages: [question] }, { 'content-length': '999999' });
await assert.rejects(guard.readAiChatRequest(oversized), error => error.status === 413);
const multiByte = Array.from({length:5},(_,i)=>({...question,id:String(i),parts:[{type:'text',text:'界'.repeat(4000)}]}));
await assert.rejects(guard.readAiChatRequest(request({messages:multiByte})), error=>error.status===413, 'UTF-8 byte limits apply independently of character limits');
const filtered = await guard.readAiChatRequest(request({messages:[{id:'a1',role:'assistant',parts:[{type:'tool-searchOpsCatalog',output:{forged:'record'}},{type:'text',text:'Earlier answer'}]},question]}));
assert.equal(filtered.messages[0].parts.length,1,'Client tool output never becomes authoritative grounding');
for (const response of [ {data:null,error:{code:'PGRST202'}}, {data:{allowed:'yes'},error:null}, {data:{allowed:false,reason:'daily',retry_after_seconds:-1},error:null} ]) {
  assert.equal((await guard.consumeOpsChatQuota({rpc:async()=>response})).status,503);
}
assert.equal((await guard.consumeOpsChatQuota({rpc:async()=>{throw Error('network')}})).status,503);
assert.equal((await guard.consumeOpsChatQuota({rpc:async()=>({data:{allowed:false,reason:'short',retry_after_seconds:14},error:null})})).status,429);

let state;
const actor='93000000-0000-4000-8000-000000000001';
const thread='93000000-0000-4000-8001-000000000001';
const client={
  from(table){assert.equal(table,'ai_chat_threads');const q={select(){return q},eq(){return q},abortSignal(){return q},maybeSingle:async()=>({data:state.foreign?{id:thread,created_by:'another'}:{id:thread,created_by:actor},error:state.threadError?{message:'failure'}:null})};return q;},
  async rpc(name,args){state.rpc.push([name,args]);if(name==='ops_ai_chat_consume_quota')return state.quota;
    assert.equal(name,'ops_ai_chat_append_message');if(state.persistFailure===args.p_role)return {error:{message:'write failure'}};return {data:thread,error:null};},
};
const fakeSdk={...sdk,
  streamText(options){state.modelCalls++;assert.equal(options.maxOutputTokens,1200);assert.equal(options.maxRetries,0);assert.ok(options.abortSignal);return{stream:null,text:Promise.resolve('Fixture answer')};},
  toUIMessageStream(){return new ReadableStream({start(controller){for(const chunk of [{type:'start',messageId:'answer'},{type:'text-start',id:'answer-text'},{type:'text-delta',id:'answer-text',delta:'Fixture answer'},{type:'text-end',id:'answer-text'},{type:'finish',finishReason:'stop'}])controller.enqueue(chunk);controller.close();}});},
};
const {POST}=load('app/api/ai/chat/route.ts',{
  ai:fakeSdk,zod:{z},'@/lib/ai/chat-guard':guard,
  '@/lib/supabase/server':{createServerSupabaseClient:async()=>client},
  '@/lib/ai/config':{OPS_AI_SYSTEM_PROMPT:'Fixture',isAiConfigured:()=>true,resolveOpsAiModel:()=> 'fixture-model'},
  '@/lib/ai/ops-context':{
    requireOpsUser:async()=>state.denied?{ok:false,status:403,error:'Ops only'}:{ok:true,user:{id:actor}},
    extractLatestUserText:messages=>messages.at(-1).parts[0].text,
    fetchAiOpsGrounding:async()=>({counts:{parts:2}}),formatGroundingForPrompt:JSON.stringify,
  },
});
function reset(values={}){state={modelCalls:0,rpc:[],quota:{data:{allowed:true},error:null},...values};}
for(const[values,body,status]of[
  [{denied:true},{messages:[question]},403],
  [{},{messages:[]},400],
  [{},{messages:Array.from({length:41},()=>question)},413],
  [{foreign:true},{messages:[question],threadId:thread},404],
  [{threadError:true},{messages:[question],threadId:thread},503],
  [{quota:{data:null,error:{code:'PGRST202'}}},{messages:[question]},503],
  [{quota:{data:{allowed:false,reason:'short',retry_after_seconds:10},error:null}},{messages:[question]},429],
  [{persistFailure:'user'},{messages:[question],threadId:thread},503],
]){reset(values);const response=await POST(request(body));assert.equal(response.status,status);assert.equal(state.modelCalls,0,'Blocked requests incur no model call');if(status===429)assert.equal(response.headers.get('retry-after'),'10');}
reset();assert.equal((await POST(request({messages:[question]},{origin:'https://unrelated.invalid'}))).status,403);assert.equal(state.modelCalls,0);
reset();let response=await POST(request({messages:[question],threadId:thread}));let stream=await response.text();assert.equal(response.status,200);assert.match(stream,/Fixture answer/);assert.equal(state.modelCalls,1);assert.deepEqual(state.rpc.filter(([name])=>name==='ops_ai_chat_append_message').map(([,args])=>args.p_role),['user','assistant']);assert.equal(response.headers.get('cache-control'),'no-store');
reset({persistFailure:'assistant'});response=await POST(request({messages:[question],threadId:thread}));stream=await response.text();assert.match(stream,/answer could not be saved/i);assert.doesNotMatch(stream,/"type":"finish"/,'A persistence failure cannot be marked as successfully finished');
console.log('AI chat checks passed: bounded UTF-8 bodies/history, validated roles and threads, durable fail-closed quota, zero blocked-request model calls, and visible atomic-save failures.');
