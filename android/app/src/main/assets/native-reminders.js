(function(root){'use strict';
 async function plan(records,engine,now=Date.now()){
  const from=new Date(now).toISOString().slice(0,10),end=new Date(now+179*86400000).toISOString().slice(0,10),result=[];
  for(const record of records){for(const due of engine.dueDates(engine.fromReminder(record),from,end,500)){
   const at=Date.parse(due+'T09:00:00-05:00');if(at<=now)continue;
   const hash=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(record.id+'|'+due));
   result.push({id:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),at});
  }}
  const unique=Array.from(new Map(result.map(x=>[x.id,x])).values()).sort((a,b)=>a.at-b.at);if(unique.length>500)throw Error('Demasiados recordatorios; reduce el horizonte antes de activarlos');return unique;
 }
 root.MF_NATIVE_REMINDERS={plan};if(typeof module==='object'&&module.exports)module.exports=root.MF_NATIVE_REMINDERS;
})(typeof window!=='undefined'?window:globalThis);
