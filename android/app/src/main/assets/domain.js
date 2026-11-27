(function(){

// MisFinanzas — motor de negocio experimental v0.1. No conecta bancos ni envía push.
const TYPES = new Set(['income','expense','transfer','card_purchase','card_payment','loan_disbursement','loan_principal','loan_interest','savings_transfer']);
function amount(n){if(!Number.isSafeInteger(n)||n<=0)throw Error('Importe COP inválido');return n}
function createState(accounts){
 const map={};for(const a of accounts){if(!a.id||map[a.id]||!['asset','credit','loan'].includes(a.kind)||!Number.isSafeInteger(a.opening)||a.opening<0||a.opening>999999999999)throw Error('Cuenta inválida');map[a.id]={...a}}
 return {accounts:map,events:[],keys:[],obligations:[],notifications:[]};
}
function balanceOf(s,id){const a=s.accounts[id];if(!a)throw Error('Cuenta inexistente');let b=a.opening;for(const e of s.events){if(e.from===id)b+=(a.kind==='asset'?-e.amount:e.amount);if(e.to===id)b+=(a.kind==='asset'||e.type==='card_purchase'?e.amount:-e.amount);}for(const a0 of (s.openingAdjustments||[])){if(a0.accountId===id)b+=a0.delta}return b}
function balance(s,id){return balanceOf(s,id)}
function post(s,event){
 const e={...event};if(!TYPES.has(e.type)||!e.id||!e.key||!validDate(e.date))throw Error('Evento inválido');amount(e.amount);
 if(s.keys.includes(e.key)){const old=s.events.find(x=>x.key===e.key);if(!old||!MF_SAFETY.sameRequest(old,e))throw Error('Conflicto de idempotencia');return {posted:false,reason:'duplicate'};}
 if(e.date>MF_SAFETY.today())throw Error('No se registran movimientos futuros');
 if(e.source==='scheduled_estimate')throw Error('Un recordatorio no es un movimiento financiero');
 if(s.events.some(x=>x.id===e.id))throw Error('Identificador de movimiento duplicado');
 const from=e.from?s.accounts[e.from]:null,to=e.to?s.accounts[e.to]:null;
 const requireKind=(a,k)=>{if(!a||a.kind!==k)throw Error('Tipo de cuenta incompatible')};
 switch(e.type){
  case 'income':requireKind(to,'asset');if(from)throw Error('Origen externo');break;
  case 'expense':requireKind(from,'asset');if(to)throw Error('Destino externo');break;
  case 'transfer':case 'savings_transfer':requireKind(from,'asset');requireKind(to,'asset');if(e.from===e.to)throw Error('Misma cuenta');break;
  case 'card_purchase':requireKind(to,'credit');if(from)throw Error('Compra a crédito');break;
  case 'card_payment':requireKind(from,'asset');requireKind(to,'credit');break;
  case 'loan_disbursement':requireKind(from,'loan');requireKind(to,'asset');break;
  case 'loan_principal':requireKind(from,'asset');requireKind(to,'loan');break;
  case 'loan_interest':requireKind(from,'asset');if(to)throw Error('Interés es gasto');break;
 }
 if(from?.kind==='asset'&&balanceOf(s,e.from)<e.amount)throw Error('Saldo insuficiente: operación no registrada');
 if(to?.kind==='credit'&&['card_payment'].includes(e.type)&&balanceOf(s,e.to)<e.amount)throw Error('Pago supera deuda');
 if(to?.kind==='loan'&&e.type==='loan_principal'&&balanceOf(s,e.to)<e.amount)throw Error('Capital supera deuda');
 if(e.type==='card_purchase'&&Array.isArray(e.allocations))checkAllocations(e.amount,e.allocations);
 if(e.type==='expense'&&Array.isArray(e.allocations))checkAllocations(e.amount,e.allocations);
 const next={...s,events:[...s.events,Object.freeze(e)],keys:[...s.keys,e.key]};
 for(const id of [e.from,e.to].filter(Boolean)){const v=balanceOf(next,id);if(!Number.isSafeInteger(v)||v<0||v>999999999999)throw Error('Saldo resultante fuera de rango');}
 return {posted:true,state:next};
}
function checkAllocations(total,lines){amount(total);if(!Array.isArray(lines)||!lines.length||lines.some(x=>!x.category||!Number.isSafeInteger(x.amount)||x.amount<=0)||lines.reduce((s,x)=>s+x.amount,0)!==total)throw Error('Distribución no cuadra');return true}
function totals(s,yearMonth){let income=0,expense=0;for(const e of s.events){if(yearMonth&&!e.date.startsWith(yearMonth))continue;if(e.type==='income')income+=e.amount;if(['expense','card_purchase','loan_interest'].includes(e.type))expense+=e.amount;}return {income,expense,net:income-expense}}
function schedule(s,obligation){
 if(!obligation.id||!s.accounts[obligation.account]||s.accounts[obligation.account].kind!=='asset'||!['monthly','quarterly','semiannual','weekly','yearly','once'].includes(obligation.frequency)||!/^\d{4}-\d\d-\d\d$/.test(obligation.firstDue)||obligation.endDate&&obligation.endDate<obligation.firstDue)throw Error('Obligación inválida');
 amount(obligation.amount);if(s.obligations.some(o=>o.id===obligation.id))throw Error('Obligación duplicada');
 if(obligation.allocations)checkAllocations(obligation.amount,obligation.allocations);
 return {...s,obligations:[...s.obligations,{...obligation}]};
}
function assess(s,obligationId,dueDate){
 const o=s.obligations.find(x=>x.id===obligationId);if(!o)throw Error('Obligación inexistente');if(o.endDate&&dueDate>o.endDate)throw Error('Obligación finalizada');
 const same=s.obligations.filter(x=>x.account===o.account&&x.autoEnabled&&x.firstDue<=dueDate&&(!x.endDate||x.endDate>=dueDate));
 const projected=balance(s,o.account)-same.filter(x=>x.id!==o.id).reduce((n,x)=>n+x.amount,0);
 return {account:o.account,required:o.amount,projected,shortfall:Math.max(0,o.amount-projected),critical:projected<o.amount,estimate:true};
}
function registerPlannedDiscount(s,obligationId,dueDate){
 const o=s.obligations.find(x=>x.id===obligationId);if(!o)throw Error('Obligación inexistente');
 if(!dueDates(o,dueDate,dueDate).length)throw Error('Fecha no corresponde a vencimiento');
 return {posted:false,reason:'requires_explicit_confirmation',assessment:projectedCoverage(s,o,dueDate)};
}


const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const parse=s=>new Date(s+'T00:00:00Z');
const fmt=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return fmt(d)};
const monthly=(s,n)=>{const [y,m,day]=s.split('-').map(Number);const first=new Date(Date.UTC(y,m-1+n,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return fmt(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last))))};
function dueDates(o,from,through){return MF_SAFETY.occurrences(o,from,through);}
function validateObligation(o,s){
 if(!o?.id||!o.name||!s.accounts[o.account]||s.accounts[o.account].kind!=='asset'||!validDate(o.firstDue)||!['once','weekly','monthly','quarterly','semiannual','yearly'].includes(o.frequency)||o.endDate&&(!validDate(o.endDate)||o.endDate<o.firstDue)||!Number.isSafeInteger(o.amount)||o.amount<=0)throw Error('Obligación inválida');
 if(o.allocations)checkAllocations(o.amount,o.allocations);
 return true;
}
function addObligation(s,o){validateObligation(o,s);if(s.obligations.some(x=>x.id===o.id))throw Error('Duplicada');return {...s,obligations:[...s.obligations,structuredClone(o)]}}
const key=(id,date)=>`obligation:${id}:${date}`;
function projectedCoverage(s,o,date){
 validateObligation(o,s);
 if(!dueDates(o,date,date).includes(date))throw Error('Fecha no corresponde a vencimiento');
 const due=[];
 for(const x of s.obligations){if(x.account!==o.account||!x.autoEnabled||x.paused)continue;for(const d of dueDates(x,x.firstDue,date))if(!s.keys.includes(key(x.id,d)))due.push({date:d,id:x.id,amount:x.amount});}
 due.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const prior=due.filter(x=>x.date<date||x.date===date&&x.id<o.id).reduce((v,x)=>v+x.amount,0);
 const projected=balance(s,o.account)-prior;
 return {account:o.account,date,required:o.amount,projected,shortfall:Math.max(0,o.amount-projected),critical:projected<o.amount,estimate:true,otherPending:due.length-1};
}
function processDue(s,{today,from=today}={}){
 if(!validDate(today)||!validDate(from)||from>today)throw Error('Fecha de proceso inválida');
 const results=[],notifications=[...s.notifications];
 for(const o of s.obligations){validateObligation(o,s);if(o.paused)continue;for(const date of dueDates(o,from,today)){
  const k=key(o.id,date);if(s.keys.includes(k)){results.push({id:o.id,date,status:'duplicate'});continue;}
  const assessment=projectedCoverage(s,o,date);results.push({id:o.id,date,status:assessment.critical?'insufficient':'pending_confirmation',assessment});
  const id='reminder:'+k,notice={id,type:assessment.critical?'critical_insufficient_balance':'payment_reminder',reference:k,createdAt:today+'T12:00:00-05:00',readAt:null,active:true,attentionPending:true,account:o.account,required:o.amount,shortfall:assessment.shortfall};
  const i=notifications.findIndex(n=>n.id===id);if(i<0)notifications.push(notice);else notifications[i]={...notifications[i],type:notice.type,shortfall:notice.shortfall,required:notice.required};
 }}return {state:{...s,notifications},results};
}



globalThis.MF_BANK={createState,post,balance};
})();
(function(root){'use strict';
const MAX=999999999999;const valid=(n,min=0)=>Number.isSafeInteger(n)&&n>=min&&n<=MAX;
const dateOK=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T12:00:00').toISOString().slice(0,10)===d;
function fresh(){return {accounts:[],loans:[],cards:[],entries:[],keys:[]}}
function clone(s){return JSON.parse(JSON.stringify(s))}
function unique(s,id){if(!id||[...s.accounts,...s.loans,...s.cards].some(x=>x.id===id))throw Error('Identificador repetido')}
function addAccount(s,p){const n=clone(s);unique(n,p.id);if(!p.name||!valid(p.balance))throw Error('Cuenta inválida');n.accounts.push({id:p.id,name:p.name,balance:p.balance});return n}
function addLoan(s,p){const n=clone(s);unique(n,p.id);if(!p.name||!valid(p.original,1)||!valid(p.principal)||p.principal>p.original||!valid(p.terms,1)||!valid(p.paidTerms)||p.paidTerms>p.terms)throw Error('Préstamo inválido');n.loans.push({...p,closed:p.principal===0});return n}
function addCard(s,p){const n=clone(s);unique(n,p.id);if(!p.name||p.limit!==null&&!valid(p.limit))throw Error('Tarjeta inválida');n.cards.push({id:p.id,name:p.name,limit:p.limit,purchases:[]});return n}
function outstanding(p){if(!valid(p.amount,1)||!valid(p.terms,1)||!valid(p.paid)||p.paid>p.terms)throw Error('Plan inválido');return MF_SAFETY.outstanding(p)}
function cardBalance(c){return c.purchases.filter(p=>p.active).reduce((sum,p)=>{const v=sum+outstanding(p);if(!valid(v))throw Error('Saldo fuera de rango');return v},0)}
function apply(s,p){if(!p||!p.id||!p.key||!dateOK(p.date)||p.date>MF_SAFETY.today())throw Error('Operación inválida');const n=clone(s);if(n.entries.some(e=>e.id===p.id)||n.keys.includes(p.key))return {state:n,duplicate:true};
const account=n.accounts.find(a=>a.id===p.accountId);let item;
if(p.kind==='card_purchase'){const c=n.cards.find(x=>x.id===p.cardId);if(!c||!p.name||!valid(p.amount,1)||!valid(p.terms,1)||!valid(p.paid)||p.paid>p.terms)throw Error('Compra inválida');if(c.purchases.some(x=>x.id===p.purchaseId)||!p.purchaseId)throw Error('Compra duplicada');if(c.limit!==null&&cardBalance(c)+MF_SAFETY.outstanding(p)>c.limit)throw Error('Cupo insuficiente');c.purchases.push({id:p.purchaseId,name:p.name,amount:p.amount,terms:p.terms,paid:p.paid,active:true});item={...p,status:'posted'};
}else if(p.kind==='card_unify'){const c=n.cards.find(x=>x.id===p.cardId);if(!c||!Array.isArray(p.originIds)||!p.originIds.length||new Set(p.originIds).size!==p.originIds.length||!valid(p.amount,1)||!valid(p.terms,1)||!p.confirmed||!p.reason||p.reason.trim().length<15)throw Error('Acuerdo inválido');const origins=p.originIds.map(id=>c.purchases.find(x=>x.id===id&&x.active));if(origins.some(x=>!x)||c.purchases.some(x=>x.id===p.purchaseId)||!p.purchaseId)throw Error('Compras inválidas');const before=origins.reduce((sum,x)=>sum+outstanding(x),0);if(before===0)throw Error('Sin saldo pendiente');if(c.limit!==null&&cardBalance(c)-before+p.amount>c.limit)throw Error('Cupo excedido');origins.forEach(x=>x.active=false);c.purchases.push({id:p.purchaseId,name:'Plan unificado',amount:p.amount,terms:p.terms,paid:0,active:true,originIds:p.originIds});item={...p,before,status:'posted',difference:p.amount-before};
}else if(p.kind==='loan_payment'||p.kind==='card_payment'){
if(!account)throw Error('Cuenta pagadora inexistente');if(!valid(p.amount,1)||!valid(p.capital)||!valid(p.interest)||!valid(p.fees)||p.amount!==p.capital+p.interest+p.fees)throw Error('Distribución inválida');if(!p.confirmed)throw Error('Confirmación requerida');if(account.balance<p.amount)throw Error('Fondos insuficientes');
if(p.kind==='loan_payment'){const l=n.loans.find(x=>x.id===p.loanId);if(!l||l.closed||p.capital>l.principal)throw Error('Préstamo inválido');if(p.settlement&&(!p.reason||p.reason.trim().length<15||p.capital!==l.principal))throw Error('Liquidación inválida');l.principal-=p.capital;l.closed=l.principal===0;if(valid(p.paidTerms)&&p.paidTerms>=l.paidTerms&&p.paidTerms<=l.terms)l.paidTerms=p.paidTerms;item={...p,status:'posted'};
}else{const c=n.cards.find(x=>x.id===p.cardId);if(!c||!Array.isArray(p.allocations)||!p.allocations.length||new Set(p.allocations.map(x=>x.purchaseId)).size!==p.allocations.length)throw Error('Distribución de tarjeta inválida');let sum=0;for(const a of p.allocations){const purchase=c.purchases.find(x=>x.id===a.purchaseId&&x.active);if(!purchase||!valid(a.capital)||!valid(a.paidTerms)||a.paidTerms<purchase.paid||a.paidTerms>purchase.terms)throw Error('Compra/cuotas inválidas');const old=outstanding(purchase),next=purchase.amount-MF_SAFETY.allocated(purchase.amount,a.paidTerms,purchase.terms);if(old-next!==a.capital)throw Error('Capital no coincide con cuotas');purchase.paid=a.paidTerms;sum+=a.capital}if(sum!==p.capital)throw Error('Distribución de capital no cuadra');item={...p,status:'posted'};
}account.balance-=p.amount;
}else if(p.kind==='schedule'){if(!valid(p.amount,1)||!p.targetId)throw Error('Programación inválida');item={...p,status:'pending'};
}else throw Error('Tipo desconocido');n.entries.push(item);n.keys.push(p.key);return {state:n,duplicate:false}}
const api={fresh,addAccount,addLoan,addCard,apply,outstanding,cardBalance,dateOK};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MF48_LEDGER=api;
})(typeof window!=='undefined'?window:globalThis);

(function(root){'use strict';
const core=root.MF48_LEDGER;
function money(x){return Number.isSafeInteger(x)&&x>=0&&x<=999999999999}
function assertState(s){if(!s||!Array.isArray(s.accounts)||!Array.isArray(s.loans)||!Array.isArray(s.cards)||!Array.isArray(s.entries)||!Array.isArray(s.keys))throw Error('Estructura inválida');const ids=new Set();for(const a of [...s.accounts,...s.loans,...s.cards]){if(!a.id||ids.has(a.id))throw Error('ID repetido');ids.add(a.id)}for(const a of s.accounts)if(!money(a.balance))throw Error('Saldo de cuenta inválido');for(const l of s.loans)if(!money(l.principal)||!money(l.original)||l.principal>l.original||!Number.isInteger(l.paidTerms)||l.paidTerms<0||l.paidTerms>l.terms||Boolean(l.closed)!==(l.principal===0))throw Error('Saldo de préstamo inválido');for(const c of s.cards){if(c.limit!==null&&!money(c.limit))throw Error('Cupo inválido');const pids=new Set();for(const p of c.purchases){if(!p.id||pids.has(p.id))throw Error('Plan repetido');pids.add(p.id);core.outstanding(p)}core.cardBalance(c)}if(new Set(s.keys).size!==s.keys.length)throw Error('Claves repetidas');if(new Set(s.entries.map(e=>e.id)).size!==s.entries.length)throw Error('Operaciones repetidas');for(const e of s.entries){if(!e||typeof e.id!=='string'||!e.id||typeof e.key!=='string'||!e.key)throw Error('Identificador de operación inválido');if(e.journal!==undefined){if(!Array.isArray(e.journal))throw Error('Asiento inválido');let cash=0,debt=0,expense=0;for(const j of e.journal){if(!j||!['asset_cash','liability_loan','liability_card','expense_purchase','expense_interest','expense_fees','adjustment_negotiation'].includes(j.type)||typeof j.id!=='string'||!j.id||!Number.isSafeInteger(j.delta))throw Error('Partida contable inválida');if(j.type==='asset_cash')cash+=j.delta;else if(j.type.startsWith('liability_'))debt+=j.delta;else expense+=j.delta}if(!Number.isSafeInteger(cash)||!Number.isSafeInteger(debt)||!Number.isSafeInteger(expense)||cash-debt+expense!==0)throw Error('Asiento histórico descuadrado')}}return true}
function post(s,p){assertState(s);const existing=s.entries.find(e=>e.id===p?.id||e.key===p?.key);if(existing){const ignore=new Set(['journal','status','difference','before']);const normalize=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!ignore.has(k)));if(existing.id!==p.id||existing.key!==p.key||!MF_SAFETY.sameRequest(normalize(existing),normalize(p)))throw Error('Conflicto de idempotencia: identificador reutilizado con datos distintos')}const before=JSON.stringify(s);const r=core.apply(s,p);if(JSON.stringify(s)!==before)throw Error('Mutación de origen');assertState(r.state);if(r.duplicate)return {...r,journal:[]};const a0=new Map(s.accounts.map(a=>[a.id,a.balance]));const a1=new Map(r.state.accounts.map(a=>[a.id,a.balance]));const l0=new Map(s.loans.map(l=>[l.id,l.principal]));const l1=new Map(r.state.loans.map(l=>[l.id,l.principal]));const c0=new Map(s.cards.map(c=>[c.id,core.cardBalance(c)]));const c1=new Map(r.state.cards.map(c=>[c.id,core.cardBalance(c)]));const journal=[];
for(const [id,v] of a0)if(a1.get(id)!==v)journal.push({type:'asset_cash',id,delta:a1.get(id)-v});
for(const [id,v] of l0)if(l1.get(id)!==v)journal.push({type:'liability_loan',id,delta:l1.get(id)-v});
for(const [id,v] of c0)if(c1.get(id)!==v)journal.push({type:'liability_card',id,delta:c1.get(id)-v});
if(p.kind==='card_purchase')journal.push({type:'expense_purchase',id:p.purchaseId,delta:MF_SAFETY.outstanding(p)});
if(p.kind==='card_unify'){const d=r.state.entries.at(-1).difference;if(d)journal.push({type:'adjustment_negotiation',id:p.purchaseId,delta:d})}
if(p.kind==='loan_payment'||p.kind==='card_payment'){if(p.interest)journal.push({type:'expense_interest',id:p.id,delta:p.interest});if(p.fees)journal.push({type:'expense_fees',id:p.id,delta:p.fees})}
const cash=journal.filter(x=>x.type==='asset_cash').reduce((a,x)=>a+x.delta,0);const debt=journal.filter(x=>x.type.startsWith('liability_')).reduce((a,x)=>a+x.delta,0);const expense=journal.filter(x=>x.type.startsWith('expense_')||x.type==='adjustment_negotiation').reduce((a,x)=>a+x.delta,0);
if(cash-debt+expense!==0)throw Error('Asiento no balanceado');const entry=r.state.entries.at(-1);if(!entry||entry.id!==p.id)throw Error('Asiento sin evento');entry.journal=journal.map(x=>({...x}));return {...r,journal}}
const api={...core,assertState,post};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MF49_LEDGER=api;
})(typeof window!=='undefined'?window:globalThis);