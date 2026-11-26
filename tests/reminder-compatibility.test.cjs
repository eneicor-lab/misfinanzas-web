const assert=require('assert'),S=require('../web/schedule-engine.js');
const record={id:'qa',date:'2026-01-31',type:'monthly'};
for(const[type,expected]of [['once',['2026-01-31']],['daily',['2026-01-31','2026-02-01','2026-02-02']],['weekly',['2026-01-31']],['monthly',['2026-01-31','2026-02-28','2026-03-31']],['bimonthly',['2026-01-31','2026-03-31','2026-05-31']],['quarterly',['2026-01-31','2026-04-30','2026-07-31']],['semiannual',['2026-01-31','2026-07-31']],['yearly',['2026-01-31']]]){
 const x=S.fromReminder({...record,type});const until=type==='daily'?'2026-02-02':type==='weekly'?'2026-02-01':type==='monthly'?'2026-04-01':type==='bimonthly'?'2026-06-01':type==='quarterly'?'2026-08-01':'2026-12-31';
 assert.deepStrictEqual(S.dueDates(x,'2026-01-01',until),expected);console.log('PASS persisted UI compatibility '+type);
}
const custom=S.fromReminder({...record,type:'custom',unit:'month',every:5,endDate:'2026-12-31'});
assert.deepStrictEqual(S.dueDates(custom,'2026-01-01','2027-12-31'),['2026-01-31','2026-06-30','2026-11-30']);
for(const change of [{paused:true},{cancelled:true}])assert.deepStrictEqual(S.dueDates(S.fromReminder({...record,...change}),'2026-01-01','2026-12-31'),[]);
for(const change of [{type:'custom',unit:'month',every:0},{endDate:'2025-12-31'},{type:'unknown'}])assert.throws(()=>S.fromReminder({...record,...change}));
assert.deepStrictEqual(record,{id:'qa',date:'2026-01-31',type:'monthly'});console.log('PASS custom, end date, pause, cancel, validation and immutable input');
