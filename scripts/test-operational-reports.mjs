import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const filters = { from: '2026-10-01', to: '2026-10-08', officeId: '', customerQ: '', stockOrigin: '', status: '', documentType: '' };
const invoices = Array.from({length:1253},(_,i)=>({id:`inv-${i}`,customer_id:'customer',customer_name:'Customer',customer_company:'Company',currency:i%2?'USD':'AED',issue_date:'2026-10-02',document_type:'tax_invoice',status:'posted',total_amount:10,amount_paid:3,balance_due:7}));
const customers = invoices.map((row,i)=>({id:`customer-${i}`,customer_code:`C-${i}`,full_name:`Customer ${i}`,owner_id:`owner-${i}`,created_at:'2026-10-02T00:00:00.000Z',is_active:true}));
const tables={invoices,customers,admin_profiles:customers.map((row,i)=>({id:row.owner_id,full_name:`Owner ${i}`})),remittances:invoices.map((row,i)=>({id:`rem-${i}`,amount:10,currency:row.currency,received_date:row.issue_date,customer_name:row.customer_name,status:'received'})),remittance_allocations:[],remittance_offices:[],parts:[],vehicles:[],purchase_orders:[],suppliers:[],invoice_items:[]};
let fail;
let largestIdBatch=0;
const client={from(table){assert.ok(table in tables,table);const state={from:0,to:499,predicates:[]};const builder={
 select(_columns,options){assert.equal(options?.count,'exact');return builder},
 or(value){assert.equal(value,'vehicle_id.not.is.null,part_id.not.is.null');state.predicates.push(row=>row.vehicle_id!=null||row.part_id!=null);return builder},
 order(){return builder},range(from,to){state.from=from;state.to=to;return builder},
 eq(key,value){state.predicates.push(row=>row[key]===value);return builder},
 gte(key,value){state.predicates.push(row=>row[key]>=value);return builder},
 lte(key,value){state.predicates.push(row=>row[key]<=value);return builder},
 is(key,value){state.predicates.push(row=>row[key]===value);return builder},
 in(key,values){if(key==='id')largestIdBatch=Math.max(largestIdBatch,values.length);state.predicates.push(row=>values.includes(row[key]));return builder},
 not(key,op,value){state.predicates.push(row=>op==='is'?row[key]!==value:!value.slice(1,-1).split(',').includes(row[key]));return builder},
 then(resolve,reject){return Promise.resolve().then(()=>{if(fail?.(table,state))return {data:null,count:null,error:{message:'Fixture failure'}};const rows=tables[table].filter(row=>state.predicates.every(test=>test(row))).sort((a,b)=>a.id.localeCompare(b.id));return {data:rows.slice(state.from,Math.min(state.to+1,state.from+37)),count:rows.length,error:null}}).then(resolve,reject)}
};return builder}};
const cache=new Map();
function load(path){if(cache.has(path))return cache.get(path);const exports={};cache.set(path,exports);vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Intl,Date,require(name){if(name==='@/lib/supabase/client')return {supabase:client};return name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name)}},{filename:path});return exports}
const {loadReportRows}=load('lib/reports/operational-data.ts');
const sales=await loadReportRows('customer-sales-value-stats',filters);
assert.equal(sales.rows.length,2,'Currencies stay separate');
assert.equal(sales.rows.reduce((sum,row)=>sum+row.invoice_count,0),1253);
assert.equal(sales.rows.reduce((sum,row)=>sum+row.total_amount,0),12530);
const registrations=await loadReportRows('customer-registrations',filters);
assert.equal(registrations.rows.length,1253);assert.ok(registrations.rows.every(row=>row.owner.startsWith('Owner ')));assert.equal(largestIdBatch,100,'Related owner URL batches remain bounded');
const remittances=await loadReportRows('customer-balance-payments',filters);assert.equal(remittances.rows.length,1253);
const office=await loadReportRows('office-sales-stats',filters);assert.equal(office.rows.reduce((sum,row)=>sum+row.received,0),12530);
for(const slug of ['purchase-statistics','resource-sales-stats','resource-sales-value-stats'])assert.equal((await loadReportRows(slug,filters)).rows.length,0);
fail=(table,state)=>table==='invoices'&&state.from>1000;
await assert.rejects(loadReportRows('customer-sales-value-stats',filters),/Report data/);
fail=table=>table==='admin_profiles';
await assert.rejects(loadReportRows('customer-registrations',filters),/Report data/,'Missing related labels cannot produce a misleading export');
fail=table=>table==='remittance_offices';
await assert.rejects(loadReportRows('customer-balance-payments',filters),/Report data/);
console.log('Operational report checks passed: all seven loaders, complete 1,253-row reports with lower provider caps, bounded owner lookups, isolated currencies and visible late-page/join failures.');
