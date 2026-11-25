/* Personal local planning. Reservations assign existing money; they never post payments. */
(function(root){'use strict';
 const MAX=999999999999,KEY='misfinanzas_planning_v1',LEDGER='misfinanzas_motor_integrado_v028';
 const fail=m=>{throw Error(m)},money=n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX;
 const label=s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=100;
 const norm=s=>String(s).trim().normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g,' ');
 const copy=x=>JSON.parse(JSON.stringify(x));
 function sum(xs){let n=0n;for(const x of xs){if(!Number.isSafeInteger(x))fail('Importe no entero');n+=BigInt(x)}if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))fail('Total fuera de rango');return Number(n)}
 const fresh=()=>({version:1,budgets:[],goals:[],reservations:[]});
 function validMonth(m){return typeof m==='string'&&/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(m)}
 function validate(s){
  if(!s||s.version!==1||!['budgets','goals','reservations'].every(k=>Array.isArray(s[k])))fail('Planificación inválida; recuperar respaldo');
  const all=[...s.budgets,...s.goals,...s.reservations];if(all.some(x=>!x||!label(x.id))||new Set(all.map(x=>x.id)).size!==all.length)fail('Identificadores de planificación inválidos');
  for(const b of s.budgets)if(!label(b.category)||!validMonth(b.month)||!money(b.limit)||b.limit===0)fail('Presupuesto inválido');
  if(new Set(s.budgets.map(b=>b.month+'|'+norm(b.category))).size!==s.budgets.length)fail('Presupuesto duplicado');
  for(const g of s.goals)if(!label(g.name)||!label(g.accountId)||!money(g.target)||g.target===0)fail('Meta inválida');
  for(const r of s.reservations)if(!label(r.name)||!label(r.accountId)||!money(r.amount)||r.amount===0||r.goalId&&!s.goals.some(g=>g.id===r.goalId&&g.accountId===r.accountId))fail('Reserva inválida');
  return s;
 }
 function addBudget(s,b){validate(s);const n=copy(s);n.budgets.push(copy(b));return validate(n)}
 function addGoal(s,g){validate(s);const n=copy(s);n.goals.push(copy(g));return validate(n)}
 function reserved(s,accountId){validate(s);return sum(s.reservations.filter(r=>r.accountId===accountId).map(r=>r.amount))}
 function reserve(s,r,balances){validate(s);if(!Object.hasOwnProperty.call(balances,r.accountId)||!money(balances[r.accountId]))fail('Cuenta o saldo no disponible');const n=copy(s);n.reservations.push(copy(r));validate(n);if(reserved(n,r.accountId)>balances[r.accountId])fail('La reserva supera el dinero disponible');return n}
 function release(s,id){validate(s);if(!s.reservations.some(r=>r.id===id))fail('Reserva no encontrada');const n=copy(s);n.reservations=n.reservations.filter(r=>r.id!==id);return validate(n)}
 function spent(events,month,category){if(!validMonth(month)||!Array.isArray(events))fail('Consulta de presupuesto inválida');const values=[];for(const e of events){if(e.type!=='expense'||!String(e.date).startsWith(month+'-'))continue;if(!money(e.amount))fail('Movimiento inválido');if(Array.isArray(e.allocations)&&e.allocations.length){if(sum(e.allocations.map(a=>a.amount))!==e.amount)fail('Discriminación inconsistente');for(const a of e.allocations)if(norm(a.category||a.categoryId||'Sin categoría')===norm(category))values.push(a.amount)}else if(norm(e.category||'Sin categoría')===norm(category))values.push(e.amount)}return sum(values)}
 const api={fresh,validate,addBudget,addGoal,reserve,release,reserved,spent,sum};root.MF_PLANNING=api;if(typeof module==='object'&&module.exports)module.exports=api;
 if(!root.document)return;
 const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n),uid=()=>crypto.randomUUID();
 function node(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e}
 function status(text){$('mfPlanStatus').textContent=text}
 function read(){const raw=localStorage.getItem(KEY);return raw===null?fresh():validate(JSON.parse(raw))}
 function ledger(){const s=JSON.parse(localStorage.getItem(LEDGER)||'{"accounts":{},"events":[]}');if(!s.accounts||!Array.isArray(s.events))fail('Libro local inválido');const balances={};for(const a of Object.values(s.accounts)){if(a.kind!=='asset')continue;const b=root.balanceOf(s,a.id);if(!money(b))fail('Saldo de cuenta inválido');balances[a.id]=b}return {state:s,balances}}
 function commit(fn){try{const next=fn(read(),ledger());localStorage.setItem(KEY,JSON.stringify(next));render();status('Planificación guardada en este dispositivo. No se registró ningún movimiento.')}catch(e){status(e.message)}}
 function install(){
  const savings=$('ahorros'),budget=document.querySelector('#planificacion .two .card');if(!savings||!budget)return;
  savings.innerHTML='<div class="card"><h3>Metas y reservas de dinero existente</h3><p class="notice">Planificación local. Una reserva virtual forma parte del saldo de su cuenta: no crea ni duplica dinero. Sin sincronización remota.</p><form id="mfGoalForm" class="mf24-form"><label>Nombre de la meta<input id="mfGoalName" maxlength="100" required></label><label>Cuenta<select id="mfGoalAccount" required></select></label><label>Objetivo COP<input id="mfGoalTarget" type="number" min="1" max="999999999999" step="1" required></label><button class="btn" type="submit">Crear meta</button></form><div id="mfGoals"></div></div><div class="card"><h3>Reservar dinero</h3><form id="mfReserveForm" class="mf24-form"><label>Nombre<input id="mfReserveName" maxlength="100" required></label><label>Cuenta<select id="mfReserveAccount" required></select></label><label>Meta opcional<select id="mfReserveGoal"><option value="">Sin meta</option></select></label><label>Importe COP<input id="mfReserveAmount" type="number" min="1" max="999999999999" step="1" required></label><button class="btn" type="submit">Reservar</button></form><div id="mfReservations"></div><div id="mfAvailable"></div><button class="btn ghost" id="mfPlanRefresh" type="button">Actualizar saldos</button><p id="mfPlanStatus" role="status" aria-live="polite"></p></div>';
  budget.innerHTML='<h3>Presupuestos por categoría</h3><p class="muted">Consumo calculado desde gastos del motor local. Las transferencias y reservas no son gastos.</p><form id="mfBudgetForm" class="mf24-form"><label>Mes<input id="mfBudgetMonth" type="month" required></label><label>Categoría<input id="mfBudgetCategory" maxlength="100" value="Sin categoría" required></label><label>Límite COP<input id="mfBudgetLimit" type="number" min="1" max="999999999999" step="1" required></label><button class="btn" type="submit">Crear presupuesto</button></form><div id="mfBudgets"></div>';
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit'}).formatToParts(new Date());$('mfBudgetMonth').value=month.find(p=>p.type==='year').value+'-'+month.find(p=>p.type==='month').value;
  const input=document.createElement('label');input.textContent='Categoría ';const category=node('input');category.id='mfPlanCategory';category.maxLength=100;category.value='Sin categoría';input.append(category);$('mf28Transaction').insertBefore(input,$('mf28Transaction').querySelector('button'));
  $('mfBudgetForm').onsubmit=e=>{e.preventDefault();commit(s=>addBudget(s,{id:uid(),month:$('mfBudgetMonth').value,category:$('mfBudgetCategory').value.trim(),limit:Number($('mfBudgetLimit').value)}))};
  $('mfGoalForm').onsubmit=e=>{e.preventDefault();commit((s,l)=>{if(!Object.hasOwnProperty.call(l.balances,$('mfGoalAccount').value))fail('Selecciona una cuenta');return addGoal(s,{id:uid(),name:$('mfGoalName').value.trim(),accountId:$('mfGoalAccount').value,target:Number($('mfGoalTarget').value)})})};
  $('mfReserveForm').onsubmit=e=>{e.preventDefault();commit((s,l)=>reserve(s,{id:uid(),name:$('mfReserveName').value.trim(),accountId:$('mfReserveAccount').value,goalId:$('mfReserveGoal').value||null,amount:Number($('mfReserveAmount').value)},l.balances))};
  $('mfPlanRefresh').onclick=render;const observer=new MutationObserver(()=>{if(savings.classList.contains('active')||$('planificacion').classList.contains('active'))render()});observer.observe(savings,{attributes:true,attributeFilter:['class']});observer.observe($('planificacion'),{attributes:true,attributeFilter:['class']});render();
 }
 function options(id,items,blank){const select=$(id),prev=select.value;select.replaceChildren();if(blank){const o=node('option',blank);o.value='';select.append(o)}for(const item of items){const o=node('option',item.name);o.value=item.id;select.append(o)}if([...select.options].some(o=>o.value===prev))select.value=prev}
 function render(){try{const s=read(),l=ledger(),accounts=Object.values(l.state.accounts).filter(a=>Object.hasOwnProperty.call(l.balances,a.id));for(const id of ['mfGoalAccount','mfReserveAccount'])options(id,accounts,'Selecciona cuenta');options('mfReserveGoal',s.goals,'Sin meta');
  $('mfGoals').replaceChildren();for(const g of s.goals){const total=sum(s.reservations.filter(r=>r.goalId===g.id).map(r=>r.amount)),row=node('div');row.className='item';row.append(node('span',g.name+' · '+fmt(total)+' / '+fmt(g.target)));const progress=document.createElement('progress');progress.max=g.target;progress.value=Math.min(total,g.target);progress.setAttribute('aria-label',g.name);row.append(progress);$('mfGoals').append(row)}
  $('mfReservations').replaceChildren();for(const r of s.reservations){const row=node('div');row.className='item';row.append(node('span',r.name+' · '+fmt(r.amount)));const button=node('button','Liberar reserva');button.className='btn ghost';button.type='button';button.onclick=()=>commit(s=>release(s,r.id));row.append(button);$('mfReservations').append(row)}
  $('mfAvailable').replaceChildren();for(const a of accounts){const amount=reserved(s,a.id),available=l.balances[a.id]-amount;const row=node('p',a.name+': saldo '+fmt(l.balances[a.id])+' · reservado '+fmt(amount)+' · sin asignar '+fmt(available));if(available<0){row.className='notice';row.append(node('strong',' Revisa reservas: los movimientos posteriores redujeron el saldo.'))}$('mfAvailable').append(row)}
  $('mfBudgets').replaceChildren();for(const b of s.budgets){const used=spent(l.state.events,b.month,b.category),row=node('div');row.className='item';row.append(node('span',b.month+' · '+b.category+': '+fmt(used)+' / '+fmt(b.limit)+(used>b.limit?' · Límite superado':'')));$('mfBudgets').append(row)}
 }catch(e){status('Bloqueo de integridad: '+e.message+'. Los datos originales se conservan.')}}
 install();
})(typeof window!=='undefined'?window:globalThis);
