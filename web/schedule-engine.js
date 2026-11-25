(function(root){
'use strict';

const DAY_MS = 86400000;
const MAX_RANGE_OCCURRENCES = 50000;

function parseISO(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Fecha inválida; se requiere AAAA-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError('Fecha de calendario inexistente');
  }
  return date;
}

function formatISO(date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((parseISO(to) - parseISO(from)) / DAY_MS);
}

function addDays(dateISO, days) {
  const date = parseISO(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return formatISO(date);
}

function addMonthsAnchored(startISO, monthOffset) {
  const start = parseISO(startISO);
  const absoluteMonth = start.getUTCFullYear() * 12 + start.getUTCMonth() + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatISO(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
}

function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') throw new TypeError('Programación inválida');
  if (!schedule.id || typeof schedule.id !== 'string') throw new TypeError('Falta el identificador');
  parseISO(schedule.firstDue);
  if (schedule.endDate != null) {
    parseISO(schedule.endDate);
    if (schedule.endDate < schedule.firstDue) throw new RangeError('La fecha final precede al primer vencimiento');
  }
  if (!['once', 'day', 'week', 'month', 'year'].includes(schedule.unit)) {
    throw new TypeError('Periodicidad no admitida');
  }
  if (schedule.unit === 'once') {
    if (schedule.every != null && schedule.every !== 1) throw new RangeError('Una sola vez no admite intervalo');
  } else if (!Number.isSafeInteger(schedule.every) || schedule.every < 1 || schedule.every > (['day','week'].includes(schedule.unit)?3650:120)) {
    throw new RangeError('El intervalo debe ser un entero entre 1 y 120');
  }
  if (schedule.status != null && !['active', 'paused', 'cancelled'].includes(schedule.status)) {
    throw new TypeError('Estado de programación inválido');
  }
  return true;
}

function stepDays(schedule) {
  return schedule.unit === 'week' ? schedule.every * 7 : schedule.every;
}

function stepMonths(schedule) {
  return schedule.unit === 'year' ? schedule.every * 12 : schedule.every;
}

function occurrenceAt(schedule, index) {
  validateSchedule(schedule);
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Índice de ocurrencia inválido');
  if (schedule.unit === 'once' && index !== 0) return null;
  const date = schedule.unit === 'day' || schedule.unit === 'week'
    ? addDays(schedule.firstDue, index * stepDays(schedule))
    : schedule.unit === 'once'
      ? schedule.firstDue
      : addMonthsAnchored(schedule.firstDue, index * stepMonths(schedule));
  if (schedule.endDate && date > schedule.endDate) return null;
  return date;
}

function firstOccurrenceIndexOnOrAfter(schedule, fromISO) {
  const from = parseISO(fromISO);
  const start = parseISO(schedule.firstDue);
  if (from <= start) return 0;
  if (schedule.unit === 'once') return 1;
  if (schedule.unit === 'day' || schedule.unit === 'week') {
    const step = stepDays(schedule);
    return Math.max(0, Math.ceil((from - start) / (step * DAY_MS)));
  }
  const monthsApart = (from.getUTCFullYear() - start.getUTCFullYear()) * 12
    + from.getUTCMonth() - start.getUTCMonth();
  let index = Math.max(0, Math.floor(monthsApart / stepMonths(schedule)));
  if (occurrenceAt(schedule, index) < fromISO) index += 1;
  return index;
}

function nextDue(schedule, fromISO) {
  validateSchedule(schedule);
  if (schedule.status && schedule.status !== 'active') return null;
  const index = firstOccurrenceIndexOnOrAfter(schedule, fromISO);
  return occurrenceAt(schedule, index);
}

function dueDates(schedule, fromISO, throughISO, maxOccurrences = MAX_RANGE_OCCURRENCES) {
  validateSchedule(schedule);
  parseISO(fromISO);
  parseISO(throughISO);
  if (fromISO > throughISO) throw new RangeError('El inicio del rango supera el final');
  if (!Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1) throw new RangeError('Límite de ocurrencias inválido');
  if (schedule.status && schedule.status !== 'active') return [];
  const dates = [];
  let index = firstOccurrenceIndexOnOrAfter(schedule, fromISO);
  for (let count = 0; count <= maxOccurrences; count++, index++) {
    const due = occurrenceAt(schedule, index);
    if (due == null || due > throughISO) return dates;
    if (due >= fromISO) dates.push(due);
  }
  throw new RangeError('El rango excede el máximo de ocurrencias permitido');
}

function reminderFor(schedule, dueISO, todayISO, leadDays = [7, 3, 1]) {
  validateSchedule(schedule);
  parseISO(todayISO);
  if (!dueDates(schedule, dueISO, dueISO).includes(dueISO)) {
    throw new RangeError('La fecha indicada no corresponde a un vencimiento');
  }
  if (!Array.isArray(leadDays) || leadDays.some(n => !Number.isSafeInteger(n) || n < 0 || n > 365)) {
    throw new RangeError('Los anticipos deben ser días enteros entre 0 y 365');
  }
  const daysToDue = daysBetween(todayISO, dueISO);
  if (daysToDue < 0) {
    return { key: schedule.id + ':' + dueISO + ':overdue', scheduleId: schedule.id, dueDate: dueISO, type: 'overdue', daysToDue };
  }
  if (daysToDue === 0) {
    return { key: schedule.id + ':' + dueISO + ':due', scheduleId: schedule.id, dueDate: dueISO, type: 'due_today', daysToDue: 0 };
  }
  if (leadDays.includes(daysToDue)) {
    return { key: schedule.id + ':' + dueISO + ':' + daysToDue, scheduleId: schedule.id, dueDate: dueISO, type: 'upcoming', daysToDue };
  }
  return null;
}

function remindersForDay(schedule, todayISO, leadDays = [7, 3, 1], overdueWindowDays = 30) {
  validateSchedule(schedule);
  parseISO(todayISO);
  if (!Number.isSafeInteger(overdueWindowDays) || overdueWindowDays < 0 || overdueWindowDays > 3650) {
    throw new RangeError('Ventana de vencidos inválida');
  }
  if (schedule.status && schedule.status !== 'active') return [];
  if (!Array.isArray(leadDays) || leadDays.some(n => !Number.isSafeInteger(n) || n < 0 || n > 365)) throw new RangeError('Anticipos inválidos');
  const earliest = addDays(todayISO, -overdueWindowDays);
  const latest = addDays(todayISO, Math.max(...leadDays, 0));
  const dates = dueDates(schedule, earliest, latest);
  const notices = dates.map(d => reminderFor(schedule, d, todayISO, leadDays)).filter(Boolean);
  return notices;
}

const api = {
  addMonthsAnchored,
  daysBetween,
  dueDates,
  nextDue,
  occurrenceAt,
  reminderFor,
  remindersForDay,
  validateSchedule
};

if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MF_SCHEDULE_ENGINE=api;
})(typeof window!=='undefined'?window:globalThis);
