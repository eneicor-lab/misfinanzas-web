const assert=require('assert'),P=require('../web/preferences.js'),{Sync,Conflict}=require('../web/module-sync.js');
const memory=()=>{const map=new Map();return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v))}};
(async()=>{
 const a=memory(),b=memory();a.setItem('misfinanzas_v25_notification_days','5');a.setItem('minorte_v18_periodos','[]');
 const period={id:'synthetic|2026-11-26',billId:'synthetic',estimated:1000,billed:null,paid:0,status:'pendiente'};
 P.patch(a,{periods:[period]});assert.equal(P.load(a).notificationDays,5);P.patch(a,{notificationDays:1});assert.deepEqual(P.load(a).periods,[period]);
 let row=null;const transport={put:async(m,r,p)=>{if(row&&row.revision!==r)throw {status:409};row={revision:r+1,payload:p};return row.revision},get:async()=>row};
 const x=new Sync({storage:a,sessionId:()=> 'synthetic-owner',allowWrites:true,transport,validators:{preferences:P.validate}}),y=new Sync({storage:b,sessionId:()=> 'synthetic-owner',transport,validators:{preferences:P.validate}});
 await x.push('preferences');await y.pull('preferences');assert.deepEqual(P.load(b),P.load(a));
 const notice={id:'uuid-synthetic-notification',title:'Synthetic reminder',read:true,readAt:'2026-11-26T12:00:00Z',createdAt:'2026-11-26T11:00:00Z',kind:'critical',active:true};
 a.setItem('misfinanzas_v25_alerts_demo',JSON.stringify([notice]));row=null;await x.push('notifications');await y.pull('notifications');assert.deepEqual(P.alerts(JSON.parse(b.getItem('misfinanzas_v25_alerts_demo'))),[notice]);
 assert.throws(()=>P.patch(a,{notificationDays:2}));assert.equal(P.load(a).notificationDays,1);assert.throws(()=>P.alerts([notice,notice]));assert.throws(()=>P.validate({...P.load(a),periods:[{...period,paid:-1}]}));
 row={revision:2,payload:{version:1,notificationDays:2,periods:[]}};await assert.rejects(y.pull('preferences',{replaceLocal:true}));assert.equal(P.load(b).notificationDays,1);
 console.log('PASS preferences: legacy preservation, atomic agenda/settings, two-device revision sync, read/critical notification state, invalid recovery rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
