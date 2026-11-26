/* One local commit for cash, debt and their accounting relationship. No network calls. */
(function(root){'use strict';
 const KEY='misfinanzas_unified_ledger_v1',LEGACY='misfinanzas_motor_integrado_v028',MAX=999999999999;
 const clone=x=>JSON.parse(JSON.stringify(x)),fail=m=>{throw Error(m)},money=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX;
 function createEngine(B,E,S){
  const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
  function projection(bank){return Object.values(bank.accounts).map(a=>({id:a.id,name:a.name||a.id,balance:B.balance(bank,a.id)})).sort(byId)}
  function align(s){s.debt.accounts=projection(s.bank);return s}
  function fresh(bank=B.createState([])){return check(align({version:1,bank:clone(bank),debt:E.fresh()}))}
  function check(s){
   if(!s||s.version!==1||!s.bank?.accounts||Array.isArray(s.bank.accounts)||!['events','keys','obligations','notifications'].every(k=>Array.isArray(s.bank[k])))fail('Libro unificado inválido');
   const bank=s.bank,balances=Object.create(null);for(const [id,a]of Object.entries(bank.accounts)){if(!id||id!==a.id||a.kind!=='asset'||!money(a.opening))fail('Cuenta heredada requiere conciliación antes de integrarla');balances[id]=a.opening}
   for(const a of bank.openingAdjustments||[]){if(!(a.accountId in balances)||!Number.isSafeInteger(a.delta))fail('Ajuste inicial inválido');balances[a.accountId]+=a.delta;if(!money(balances[a.accountId]))fail('Ajuste fuera de rango')}
   const ids=new Set(),keys=new Set();for(const e of bank.events){if(!e||!e.id||!e.key||ids.has(e.id)||keys.has(e.key)||!money(e.amount)||e.amount===0||!S.dateOK(e.date)||e.date>S.today()||!['income','expense','transfer'].includes(e.type))fail('Historial de movimientos inválido');ids.add(e.id);keys.add(e.key);
    if(e.allocations!==undefined){if(!Array.isArray(e.allocations)||!e.allocations.length||e.type==='transfer'||e.allocations.some(a=>!a||typeof a.category!=='string'||!a.category.trim()||a.category.length>100||!money(a.amount)||a.amount===0)||S.sum(e.allocations.map(a=>a.amount))!==e.amount)fail('La discriminación no coincide con el importe del movimiento')}
    if(e.type!=='income'){if(!(e.from in balances)||balances[e.from]<e.amount)fail('Historial con saldo insuficiente');balances[e.from]-=e.amount}
    if(e.type!=='expense'){if(!(e.to in balances)||e.type==='transfer'&&e.to===e.from)fail('Destino inválido');balances[e.to]+=e.amount;if(!money(balances[e.to]))fail('Saldo fuera de rango')}
   }
   if(bank.keys.length!==keys.size||new Set(bank.keys).size!==keys.size||bank.keys.some(k=>!keys.has(k)))fail('Claves del libro inconsistentes');
   E.assertState(s.debt);if(S.stable(s.debt.accounts.slice().sort(byId))!==S.stable(projection(bank)))fail('Los saldos de deuda y cuentas no coinciden');
   const payments=s.debt.entries.filter(p=>p.kind==='loan_payment'||p.kind==='card_payment');
   for(const l of s.debt.loans){if(!money(l.openingPrincipal)||l.openingPrincipal>l.original)fail('Base inicial de préstamo inválida');const capital=S.sum(payments.filter(p=>p.kind==='loan_payment'&&p.loanId===l.id).map(p=>p.capital));if(l.principal!==l.openingPrincipal-capital)fail('Capital del préstamo no concilia con sus pagos')}
   for(const p of payments){const matches=bank.events.filter(e=>e.financialClass==='debt_payment'&&e.debtEntryId===p.id);if(matches.length!==1||matches[0].from!==p.accountId||matches[0].amount!==p.amount||matches[0].date!==p.date)fail('Pago sin débito único en cuenta')}
   for(const e of bank.events.filter(e=>e.financialClass==='debt_payment'))if(!payments.some(p=>p.id===e.debtEntryId))fail('Débito sin pago de deuda');
   return s;
  }
  function replaceBank(s,bank){check(s);if(s.bank.events.some((e,i)=>!bank.events[i]||!S.sameRequest(e,bank.events[i])))fail('No se puede reemplazar el historial del libro');return check(align({...clone(s),bank:clone(bank)}))}
  function postBank(s,p){check(s);const r=B.post(s.bank,p);return {state:check(align({...clone(s),bank:r.state})),duplicate:!r.posted}}
  function addLoan(s,p){check(s);return check({...clone(s),debt:E.addLoan(s.debt,{...p,openingPrincipal:p.principal,openingPaidTerms:p.paidTerms})})}
  function addCard(s,p){check(s);return check({...clone(s),debt:E.addCard(s.debt,p)})}
  function postDebt(s,p){check(s);const result=E.post(s.debt,p);if(result.duplicate)return {state:clone(s),duplicate:true};let bank=clone(s.bank);
   if(p.kind==='loan_payment'||p.kind==='card_payment'){
    const product=p.kind==='loan_payment'?s.debt.loans.find(x=>x.id===p.loanId):s.debt.cards.find(x=>x.id===p.cardId);
    bank=B.post(bank,{id:'debt:'+p.id,key:'debt:'+p.key,type:'expense',from:p.accountId,date:p.date,amount:p.amount,concept:('Pago de deuda: '+product.name).slice(0,100),thirdParty:product.name,financialClass:'debt_payment',debtEntryId:p.id}).state;
   }
   return {state:check({version:1,bank,debt:result.state}),duplicate:false};
  }
  function reportingEvents(s){check(s);const events=s.bank.events.filter(e=>e.financialClass!=='debt_payment').map(clone);for(const p of s.debt.entries)for(const j of p.journal||[])if(j.type.startsWith('expense_')&&j.delta>0)events.push({id:p.id+':'+j.type,type:'expense',date:p.date,amount:j.delta,concept:p.name||'Costo de deuda',category:p.category||(j.type==='expense_purchase'?'Compras con tarjeta':'Costos de deuda'),from:p.accountId||null});return events}
  function totals(s,month){const events=reportingEvents(s).filter(e=>!month||e.date.startsWith(month));const income=S.sum(events.filter(e=>e.type==='income').map(e=>e.amount)),expense=S.sum(events.filter(e=>e.type==='expense').map(e=>e.amount));return {income,expense,net:income-expense}}
  return {fresh,check,replaceBank,postBank,addLoan,addCard,postDebt,reportingEvents,totals};
 }
 class Store{
  constructor({storage,engine,locks,onChange=()=>{}}){this.storage=storage;this.engine=engine;this.locks=locks;this.onChange=onChange}
  read(){const raw=this.storage.getItem(KEY);if(raw===null){const old=this.storage.getItem(LEGACY);return {revision:0,state:this.engine.fresh(old===null?undefined:JSON.parse(old)),legacyBytes:old}}
   const value=JSON.parse(raw);if(!value||value.format!==1||!Number.isSafeInteger(value.revision)||value.revision<1)fail('Contenedor de libro inválido; conservar y recuperar respaldo');this.engine.check(value.state);return {revision:value.revision,state:value.state,legacyBytes:null};}
  async transact(expected,fn){if(!this.locks?.request)fail('El navegador no permite transacciones seguras; usa una versión actualizada');return this.locks.request(KEY,{mode:'exclusive'},async()=>{const current=this.read();if(current.revision!==expected.revision||current.revision===0&&current.legacyBytes!==expected.legacyBytes)fail('El libro cambió en otra operación. Actualiza antes de reintentar');const next=this.engine.check(await fn(clone(current.state)));if(!Number.isSafeInteger(current.revision+1))fail('Revisión agotada');const envelope={format:1,revision:current.revision+1,state:next};this.storage.setItem(KEY,JSON.stringify(envelope));let notificationError=false;try{this.onChange(envelope)}catch{notificationError=true}return {revision:envelope.revision,state:next,legacyBytes:null,notificationError}})}
 }
 const api={KEY,LEGACY,createEngine,Store};root.MF_UNIFIED_LEDGER=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
