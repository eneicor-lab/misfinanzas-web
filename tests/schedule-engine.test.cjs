'use strict';

const assert = require('assert');
const {
  addMonthsAnchored, dueDates, nextDue, occurrenceAt,
  reminderFor, remindersForDay, validateSchedule
} = require('../web/schedule-engine.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
const s = (overrides = {}) => Object.assign({
  id: 'sub-1', firstDue: '2026-01-15', unit: 'month', every: 1, status: 'active'
}, overrides);

test('mensual: conserva día ancla tras mes corto', () => {
  const item=s({firstDue:'2027-01-31'});
  assert.strictEqual(occurrenceAt(item,1),'2027-02-28');
  assert.strictEqual(occurrenceAt(item,2),'2027-03-31');
  assert.strictEqual(nextDue(item,'2027-02-28'),'2027-02-28');
  assert.strictEqual(nextDue(item,'2027-03-01'),'2027-03-31');
});
test('semestral: cada seis meses desde fecha inicial', () => {
  assert.deepStrictEqual(dueDates(s({firstDue:'2026-08-31',every:6}),'2026-09-01','2027-09-01'),['2027-02-28','2027-08-31']);
});
test('anual: conserva aniversario y trata años bisiestos', () => {
  const item=s({firstDue:'2024-02-29',unit:'year',every:1});
  assert.strictEqual(occurrenceAt(item,1),'2025-02-28');
  assert.strictEqual(occurrenceAt(item,4),'2028-02-29');
});
test('pago único: una fecha y luego ningún próximo vencimiento', () => {
  const item=s({firstDue:'2026-12-01',unit:'once',every:1});
  assert.deepStrictEqual(dueDates(item,'2026-01-01','2027-12-31'),['2026-12-01']);
  assert.strictEqual(nextDue(item,'2026-12-02'),null);
});
test('intervalos diarios y semanales', () => {
  assert.deepStrictEqual(dueDates(s({firstDue:'2026-11-01',unit:'week',every:2}),'2026-11-01','2026-11-30'),['2026-11-01','2026-11-15','2026-11-29']);
  assert.deepStrictEqual(dueDates(s({firstDue:'2026-11-01',unit:'day',every:10}),'2026-11-01','2026-11-30'),['2026-11-01','2026-11-11','2026-11-21']);
});
test('fecha final excluye ocurrencias posteriores', () => {
  assert.deepStrictEqual(dueDates(s({firstDue:'2026-01-31',endDate:'2026-03-01'}),'2026-01-01','2026-12-31'),['2026-01-31','2026-02-28']);
});
test('pausada y cancelada no generan vencimientos ni avisos', () => {
  ['paused','cancelled'].forEach(status=>{
    const item=s({status});
    assert.strictEqual(nextDue(item,'2026-11-01'),null);
    assert.deepStrictEqual(remindersForDay(item,'2026-11-01'),[]);
  });
});
test('aviso anticipado, vencimiento y atraso con claves estables', () => {
  const item=s({firstDue:'2026-11-20'});
  assert.deepStrictEqual(reminderFor(item,'2026-11-20','2026-11-19',[1]),{key:'sub-1:2026-11-20:1',scheduleId:'sub-1',dueDate:'2026-11-20',type:'upcoming',daysToDue:1});
  assert.strictEqual(reminderFor(item,'2026-11-20','2026-11-20').type,'due_today');
  assert.strictEqual(reminderFor(item,'2026-11-20','2026-11-22').type,'overdue');
});
test('valida fechas, unidades e intervalos', () => {
  assert.strictEqual(validateSchedule(s()),true);
  assert.throws(()=>validateSchedule(s({firstDue:'2026-02-29'})),/Fecha de calendario inexistente/);
  assert.throws(()=>validateSchedule(s({every:0})),/intervalo/);
  assert.throws(()=>validateSchedule(s({unit:'quarter'})),/Periodicidad/);
  assert.throws(()=>validateSchedule(s({firstDue:'2027-01-01',endDate:'2026-12-31'})),/fecha final/);
});
test('rechaza rangos invertidos y fechas que no vencen', () => {
  assert.throws(()=>dueDates(s(),'2026-12-01','2026-11-30'),/supera/);
  assert.throws(()=>reminderFor(s(),'2026-01-16','2026-01-15'),/no corresponde/);
});
test('avisos diarios incluyen vencimientos atrasados en ventana', () => {
  const notices=remindersForDay(s({firstDue:'2026-10-15'}),'2026-11-17',[7,3,1],40);
  assert.deepStrictEqual(notices.map(x=>[x.dueDate,x.type]),[['2026-10-15','overdue'],['2026-11-15','overdue']]);
});

console.log('Resultado: '+passed+' aprobadas; '+failed+' fallidas.');
if(failed) process.exitCode=1;

// Regressions discovered during integral reconciliation.
const ahead=remindersForDay(s({firstDue:'2026-11-20'}),'2026-11-19',[1],30);
assert.strictEqual(ahead.some(n=>n.type==='upcoming'&&n.dueDate==='2026-11-20'),true);
assert.throws(()=>remindersForDay(s(),'2026-11-19',[NaN]),/Anticipos/);
console.log('PASS 2 additional anticipation regressions');
