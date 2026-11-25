/* MisFinanzas shared invariants. No network, storage or financial side effects. */
(function(root){'use strict';
 const MAX=999999999999;
 const fail=m=>{throw Error(m)};
 function integer(n,min=0,max=MAX){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;}
 function dateOK(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
 function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>p.find(x=>x.type===t).value;return part('year')+'-'+part('month')+'-'+part('day');}
 function allocated(amount,paid,terms){if(!integer(amount,1)||!integer(terms,1)||!integer(paid,0,terms))fail('Plan de cuotas inválido');return Number(BigInt(amount)*BigInt(paid)/BigInt(terms));}
 function outstanding(p){return p.amount-allocated(p.amount,p.paid,p.terms);}
 function sum(values){let n=0n;for(const v of values){if(!Number.isSafeInteger(v))fail('Importe no entero');n+=BigInt(v);}if(n>BigInt(MAX)||n<BigInt(-MAX))fail('Total fuera del rango monetario');return Number(n);}
 const periods={monthly:1,quarterly:3,semiannual:6,yearly:12};
 function occurrences(o,from,through){
  if(!o||!dateOK(o.firstDue)||!dateOK(from)||!dateOK(through)||from>through||!['once','weekly',...Object.keys(periods)].includes(o.frequency)||o.endDate&&(!dateOK(o.endDate)||o.endDate<o.firstDue))fail('Calendario inválido');
  const limit=o.endDate&&o.endDate<through?o.endDate:through,dates=[];
  const [y,m,day]=o.firstDue.split('-').map(Number);
  for(let i=0;i<2400;i++){
   let d;if(o.frequency==='once')d=new Date(o.firstDue+'T12:00:00Z');else if(o.frequency==='weekly'){d=new Date(o.firstDue+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*i);}else{const first=new Date(Date.UTC(y,m-1+periods[o.frequency]*i,1,12));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();d=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last),12));}
   if(!Number.isFinite(+d))fail('Horizonte fuera de rango');const date=d.toISOString().slice(0,10);if(date>limit)return dates;if(date>=from)dates.push(date);if(o.frequency==='once')return dates;
  }
  fail('Horizonte demasiado amplio');
 }
 function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
 function sameRequest(a,b,ignore=[]){const clean=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!ignore.includes(k)));return stable(clean(a))===stable(clean(b));}
 const keys=new Set(['presupuesto_demo_obligaciones_v12','minorte_v17_catalogo','minorte_v18_periodos']);
 function backupKey(k){return typeof k==='string'&&!/token|password|credential|secret|session|auth/i.test(k)&&(['misfinanzas_','mf_','MF_'].some(p=>k.startsWith(p))||keys.has(k));}
 function notificationVisible(a,days=3,now=Date.now()){
  if(![1,3,5].includes(days)||!a||!Number.isFinite(now))fail('Preferencia de notificaciones inválida');
  if(a.kind==='critical'&&a.active===true)return true;
  const read=a.readAt?Date.parse(a.readAt):NaN,created=Date.parse(a.createdAt||'');
  if(a.read===true&&Number.isFinite(read))return now-read<days*86400000;
  if(a.attentionPending===true)return true;
  return !Number.isFinite(created)||now-created<30*86400000;
 }
 function publicKey(k){if(typeof k!=='string'||!k.trim()||/sb_secret_|service_role|PRIVATE KEY/i.test(k))return false;if(k.startsWith('sb_publishable_'))return true;if(k.split('.').length!==3)return false;try{const raw=k.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(raw)).role==='anon';}catch{return false;}}
 function strongPassword(p){return typeof p==='string'&&Array.from(p).length>=12&&Array.from(p).length<=256&&/\p{Lu}/u.test(p)&&/\p{Ll}/u.test(p)&&/\p{N}/u.test(p)&&/[^\p{L}\p{N}\s]/u.test(p)&&!/[\p{Cc}]/u.test(p);}
 const api={MAX,integer,dateOK,today,allocated,outstanding,sum,occurrences,stable,sameRequest,backupKey,notificationVisible,publicKey,strongPassword};
 root.MF_SAFETY=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
