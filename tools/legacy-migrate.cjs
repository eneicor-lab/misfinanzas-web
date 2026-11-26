/* Offline, non-destructive legacy migration planner. No network or automatic deployment. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const stable=x=>JSON.stringify(x,function(k,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v});
const sha=x=>crypto.createHash('sha256').update(stable(x)).digest('hex');
const TABLES=['mf_accounts','mf_allocations','mf_audit','mf_beneficiaries','mf_categories','mf_due','mf_events','mf_notifications','mf_obligations','mf_tariffs'];
function plan(snapshot,{engine,owner}){
 if(!snapshot||snapshot.version!==1||snapshot.owner_id!==owner||typeof owner!=='string'||!owner)throw Error('Expected owner-scoped versioned snapshot');
 const blockers=[],warnings=[],tables=snapshot.tables;if(!tables||TABLES.some(k=>!Array.isArray(tables[k])))throw Error('All ten legacy tables are required');
 for(const name of TABLES){const ids=new Set();for(const r of tables[name]){if(!r||r.owner_id!==owner||r.id==null||ids.has(String(r.id)))throw Error('Cross-owner or duplicated source row in '+name);ids.add(String(r.id));}}
 const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999999,accountMap=new Map(tables.mf_accounts.map(a=>[a.id,a])),categoryMap=new Map(tables.mf_categories.map(c=>[c.id,c])),personMap=new Map(tables.mf_beneficiaries.map(p=>[p.id,p]));
 const bank={accounts:{},events:[],keys:[],obligations:[],notifications:[]};
 for(const a of tables.mf_accounts){if(a.kind!=='asset'){blockers.push('Debt product requires a reviewed opening principal/card contract: '+a.id);continue;}if(!money(a.opening)||a.currency!=='COP'||typeof a.name!=='string'||!a.name.trim())throw Error('Invalid legacy account');if(['__proto__','prototype','constructor'].includes(a.id))throw Error('Unsafe account identity');bank.accounts[a.id]={id:a.id,name:a.name,kind:'asset',opening:a.opening,active:a.active,currency:a.currency};}
 const dueIds=new Set(tables.mf_due.map(x=>x.id)),obligationIds=new Set(tables.mf_obligations.map(x=>x.id)),eventIds=new Set(tables.mf_events.map(x=>x.id));
 for(const d of tables.mf_due)if(!obligationIds.has(d.obligation_id)||!money(d.amount)||d.amount===0)throw Error('Invalid due relationship');
 for(const o of tables.mf_obligations)if(o.account_id&&!accountMap.has(o.account_id))throw Error('Invalid obligation account');
 for(const t of tables.mf_tariffs)if(!obligationIds.has(t.obligation_id)||!money(t.amount)||t.amount===0)throw Error('Invalid tariff relationship');
 for(const a of tables.mf_allocations)if(!eventIds.has(a.event_id)||(a.category_id&&!categoryMap.has(a.category_id))||(a.beneficiary_id&&!personMap.has(a.beneficiary_id))||!money(a.amount)||!a.amount)throw Error('Invalid allocation relationship');
 const auditOrder=new Map();for(const a of tables.mf_audit)if(a.entity==='mf_events'&&a.entity_id&&Number.isSafeInteger(Number(a.id)))auditOrder.set(a.entity_id,Number(a.id));
 const events=tables.mf_events.slice().sort((a,b)=>{const x=auditOrder.get(a.id),y=auditOrder.get(b.id);if(x!==undefined&&y!==undefined)return x-y;return String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id));});
 let book=engine.fresh(bank);const keys=new Set();
 for(const e of events){if(typeof e.idempotency_key!=='string'||e.idempotency_key.length<1||e.idempotency_key.length>180||keys.has(e.idempotency_key))throw Error('Invalid or reused idempotency key');keys.add(e.idempotency_key);
  if(!['income','expense','transfer'].includes(e.event_type)||e.source==='scheduled_estimate'){blockers.push('Financial event requires explicit debt/estimate reconciliation: '+e.id);continue;}
  if(e.due_id&&!dueIds.has(e.due_id))throw Error('Invalid event due relationship');
  if(e.from_account&&!accountMap.has(e.from_account)||e.to_account&&!accountMap.has(e.to_account))throw Error('Missing event account');
  if(e.from_account&&!bank.accounts[e.from_account]||e.to_account&&!bank.accounts[e.to_account]){blockers.push('Event references unresolved debt account: '+e.id);continue;}
  const p={id:e.id,key:e.idempotency_key,type:e.event_type,from:e.from_account||undefined,to:e.to_account||undefined,amount:e.amount,date:e.event_date,concept:e.concept};
  const allocations=tables.mf_allocations.filter(a=>a.event_id===e.id);
  if(allocations.length){if(e.event_type==='transfer')throw Error('Transfer allocations require reconciliation');p.allocations=allocations.map(a=>({category:categoryMap.get(a.category_id)?.name||'Sin categoría',amount:a.amount,legacyAllocationId:a.id,legacyCategoryId:a.category_id,legacyBeneficiaryId:a.beneficiary_id}));if(allocations.length===1&&allocations[0].beneficiary_id)p.thirdParty=personMap.get(allocations[0].beneficiary_id).name;}
  book=engine.postBank(book,p).state;
 }
 // Exact row preservation is separate from normalized functionality; no source row is deleted.
 const counts=Object.fromEntries(TABLES.map(t=>[t,tables[t].length])),balances={};
 for(const a of tables.mf_accounts.filter(a=>a.kind==='asset')){const source=a.opening+tables.mf_events.reduce((sum,e)=>sum+(e.to_account===a.id?e.amount:0)-(e.from_account===a.id?e.amount:0),0),target=book.debt.accounts.find(x=>x.id===a.id)?.balance;balances[a.id]={source,target};if(source!==target)blockers.push('Cash balance requires reconciliation: '+a.id);}
 const frequency={once:'once',weekly:'weekly',monthly:'monthly',yearly:'yearly'};
 const reminders=tables.mf_obligations.map(o=>{if(!frequency[o.frequency])blockers.push('Unsupported legacy frequency: '+o.id);if(o.auto_enabled)warnings.push('Automatic posting disabled for imported obligation: '+o.id);return {id:o.id,name:o.name,type:frequency[o.frequency],date:o.first_due,endDate:o.end_date||null,amount:o.amount,paused:!!o.paused,cancelled:false,leads:[0],legacyAccountId:o.account_id,autoPost:false};});
 const catalogs={categories:tables.mf_categories.map(c=>({id:c.id,name:c.name,type:c.kind==='income'?'Ingreso':'Gasto',parent:c.parent_id,active:c.active})),people:tables.mf_beneficiaries.map(p=>({id:p.id,name:p.name,kind:p.kind,active:p.active})),bills:[]};
 warnings.push('Legacy account subtype, card/loan contracts and local-only planning/preferences require separate reconciliation; source rows are preserved.');
 const result={version:1,owner_id:owner,source_sha256:sha(snapshot),source_counts:counts,blockers:[...new Set(blockers)],warnings,balances,book,modules:{catalogs,reminders},source_snapshot:snapshot};result.ready=result.blockers.length===0;result.plan_sha256=sha(result);return result;
}
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/legacy-migrate.cjs PRIVATE_SNAPSHOT.json PRIVATE_PLAN.json');if(path.resolve(input)===path.resolve(output))throw Error('Never overwrite the source snapshot');const snapshot=JSON.parse(fs.readFileSync(input,'utf8'));const {E}=require('../tests/make-book-fixture.cjs');const result=plan(snapshot,{engine:E,owner:snapshot.owner_id});fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({ready:result.ready,blocker_count:result.blockers.length,source_sha256:result.source_sha256,plan_sha256:result.plan_sha256}));}
module.exports={plan,sha,TABLES};
