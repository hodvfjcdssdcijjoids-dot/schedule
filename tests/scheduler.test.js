/* Tests for the ShiftWise auto-scheduling engine. Run: node --test tests/ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/scheduler.js');

// Mon Jul 6 – Sun Jul 12, 2026
const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09',
  '2026-07-10', '2026-07-11', '2026-07-12'];

let seq = 0;

function allDayAvailability() {
  return Array.from({ length: 7 }, () => ({ on: true, start: '00:00', end: '24:00' }));
}

function emp(over) {
  return Object.assign({
    id: 'e' + (++seq), name: 'Emp' + seq, role: 'Associate', wage: 15,
    minHours: 0, maxHours: 60, maxDaysPerWeek: 7,
    availability: allDayAvailability(), prefs: { shift: 'any' }, timeOff: []
  }, over);
}

function tmpl(over) {
  return Object.assign({
    id: 't' + (++seq), name: 'Shift' + seq, start: '09:00', end: '17:00',
    days: [0, 1, 2, 3, 4, 5, 6], required: 1, roleRequirements: {}
  }, over);
}

function mkState(employees, shiftTemplates, over) {
  return Object.assign({
    employees, shiftTemplates, schedule: {},
    roles: ['Manager', 'Keyholder', 'Associate'],
    settings: { overtimeThreshold: 40, minRestHours: 10, maxConsecutiveDays: 6, weekStartsOn: 1 }
  }, over || {});
}

function assignmentsOf(schedule, empId) {
  const out = [];
  for (const dk of WEEK) for (const a of schedule[dk] || []) {
    if (!empId || a.employeeId === empId) out.push(a);
  }
  return out;
}

test('fills every slot when capacity allows', () => {
  const state = mkState([emp({ maxDaysPerWeek: 4 }), emp({ maxDaysPerWeek: 4 })], [tmpl()]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.unfilled.length, 0);
  assert.strictEqual(res.created.length, 7);
  for (const dk of WEEK) assert.strictEqual(res.schedule[dk].length, 1, dk);
});

test('respects day-off availability', () => {
  const weekdayOnly = allDayAvailability();
  weekdayOnly[0].on = false; // Sunday
  weekdayOnly[6].on = false; // Saturday
  const a = emp({ availability: weekdayOnly, name: 'Weekday Wanda' });
  const b = emp({ name: 'Anyday Andy' });
  const state = mkState([a, b], [tmpl({ days: [0, 6] })]); // weekend-only shift
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.unfilled.length, 0);
  assert.ok(res.created.every(x => x.employeeId === b.id), 'weekend shifts must all go to Andy');
});

test('respects availability time window', () => {
  const morningOnly = allDayAvailability().map(x => ({ on: x.on, start: '08:00', end: '12:00' }));
  const a = emp({ availability: morningOnly });
  const b = emp();
  const state = mkState([a, b], [tmpl({ start: '09:00', end: '17:00', days: [1] })]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.unfilled.length, 0);
  assert.strictEqual(res.created[0].employeeId, b.id);
});

test('time off blocks assignment and is reported as the reason', () => {
  const a = emp({ timeOff: [{ start: '2026-07-01', end: '2026-07-31' }] });
  const state = mkState([a], [tmpl({ days: [1] })]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.created.length, 0);
  assert.strictEqual(res.unfilled.length, 1);
  assert.strictEqual(res.unfilled[0].reasons.timeoff, 1);
});

test('never exceeds max weekly hours', () => {
  const a = emp({ maxHours: 16 }); // 8h shifts -> at most 2
  const b = emp();
  const state = mkState([a, b], [tmpl()]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.unfilled.length, 0);
  assert.ok(S.weekHours(res.schedule, a.id, WEEK) <= 16 + 1e-9);
});

test('meets role requirements each day', () => {
  const mgr = emp({ role: 'Manager', name: 'Mgr' });
  const a1 = emp();
  const a2 = emp();
  const state = mkState([mgr, a1, a2], [tmpl({ required: 2, roleRequirements: { Manager: 1 } })]);
  state.settings.maxConsecutiveDays = 0; // the lone manager must cover all 7 days
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  for (const dk of WEEK) {
    const assigned = res.schedule[dk] || [];
    assert.strictEqual(assigned.length, 2, dk);
    assert.ok(assigned.some(x => x.employeeId === mgr.id), 'manager required on ' + dk);
  }
});

test('never double-books overlapping shifts for one employee', () => {
  const a = emp();
  const state = mkState([a], [
    tmpl({ start: '09:00', end: '17:00', days: [1] }),
    tmpl({ start: '12:00', end: '20:00', days: [1] })
  ]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.created.length, 1);
  assert.strictEqual(res.unfilled.length, 1);
  assert.ok(res.unfilled[0].reasons.overlap >= 1);
});

test('fill mode counts existing assignments toward coverage', () => {
  const a = emp();
  const t = tmpl({ days: [1] });
  const state = mkState([a], [t], {
    schedule: { '2026-07-06': [{ id: 'x1', dateKey: '2026-07-06', employeeId: a.id, templateId: t.id, start: t.start, end: t.end }] }
  });
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.created.length, 0);
  assert.strictEqual(res.unfilled.length, 0);
  assert.strictEqual(res.schedule['2026-07-06'].length, 1);
});

test('rebuild mode replaces unlocked shifts but keeps locked and custom ones', () => {
  const a = emp();
  const b = emp();
  const t = tmpl({ days: [1, 2] });
  const locked = { id: 'L', dateKey: '2026-07-06', employeeId: b.id, templateId: t.id, start: t.start, end: t.end, locked: true };
  const unlocked = { id: 'U', dateKey: '2026-07-07', employeeId: b.id, templateId: t.id, start: t.start, end: t.end, locked: false };
  const custom = { id: 'C', dateKey: '2026-07-08', employeeId: b.id, templateId: null, start: '10:00', end: '12:00' };
  const state = mkState([a, b], [t], {
    schedule: { '2026-07-06': [locked], '2026-07-07': [unlocked], '2026-07-08': [custom] }
  });
  const res = S.autoSchedule(state, WEEK, { mode: 'rebuild' });
  assert.ok(res.schedule['2026-07-06'].some(x => x.id === 'L'), 'locked shift kept');
  assert.ok(!res.schedule['2026-07-07'].some(x => x.id === 'U'), 'unlocked shift replaced');
  assert.ok(res.schedule['2026-07-08'].some(x => x.id === 'C'), 'custom shift kept');
  assert.strictEqual(res.removedCount, 1);
});

test('minimum rest blocks a "clopen" pairing', () => {
  const a = emp();
  const closing = { id: 'c1', dateKey: '2026-07-06', employeeId: a.id, templateId: null, start: '14:00', end: '22:00' };
  const state = mkState([a], [tmpl({ start: '06:00', end: '14:00', days: [2] })], // Tuesday open
    { schedule: { '2026-07-06': [closing] } });
  // rest between 22:00 Mon and 06:00 Tue = 8h < 10h minimum
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.created.length, 0);
  assert.strictEqual(res.unfilled.length, 1);
  assert.ok(res.unfilled[0].reasons.rest >= 1);
});

test('honors max consecutive days', () => {
  const a = emp();
  const state = mkState([a], [tmpl()]);
  state.settings.maxConsecutiveDays = 3;
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  // With a 7-day week and a 3-day cap one day must stay open.
  assert.ok(res.unfilled.length >= 1);
  for (const dk of WEEK) {
    if ((res.schedule[dk] || []).length) {
      assert.ok(S.consecutiveRun(res.schedule, a.id, dk) <= 3, 'run too long at ' + dk);
    }
  }
});

test('prefers an employee who is under their minimum hours', () => {
  const needy = emp({ minHours: 30, maxHours: 40, name: 'Needy' });
  const casual = emp({ minHours: 0, maxHours: 40, name: 'Casual' });
  const state = mkState([casual, needy], [tmpl({ days: [1] })]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  assert.strictEqual(res.created[0].employeeId, needy.id);
});

test('optimizeCost biases toward the cheaper employee', () => {
  const cheap = emp({ wage: 12, name: 'Cheap' });
  const pricey = emp({ wage: 30, name: 'Pricey' });
  const state = mkState([pricey, cheap], [tmpl({ days: [1] })]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill', optimizeCost: true });
  assert.strictEqual(res.created[0].employeeId, cheap.id);
});

test('validateWeek flags understaffed days and unmet roles', () => {
  const a = emp();
  const state = mkState([a], [tmpl({ days: [1], required: 2, roleRequirements: { Manager: 1 } })]);
  const issues = S.validateWeek(state, WEEK);
  assert.ok(issues.some(i => i.type === 'understaffed'));
  assert.ok(issues.some(i => i.type === 'role-unmet'));
});

test('validateWeek flags overtime, max-hours and time-off conflicts', () => {
  const a = emp({ maxHours: 45, timeOff: [{ start: '2026-07-08', end: '2026-07-08' }] });
  const schedule = {};
  for (const dk of WEEK.slice(0, 6)) { // 6 × 8h = 48h
    schedule[dk] = [{ id: 'x' + dk, dateKey: dk, employeeId: a.id, templateId: null, start: '09:00', end: '17:00' }];
  }
  const state = mkState([a], [], { schedule });
  state.settings.maxConsecutiveDays = 0;
  state.settings.minRestHours = 0;
  const issues = S.validateWeek(state, WEEK);
  assert.ok(issues.some(i => i.type === 'max-hours'), 'over the personal max');
  assert.ok(issues.some(i => i.type === 'timeoff'), 'scheduled during time off');
});

test('validateWeek passes a clean, fully-covered week', () => {
  const a = emp({ maxDaysPerWeek: 4 });
  const b = emp({ maxDaysPerWeek: 4 });
  const state = mkState([a, b], [tmpl()]);
  const res = S.autoSchedule(state, WEEK, { mode: 'fill' });
  state.schedule = res.schedule;
  const issues = S.validateWeek(state, WEEK).filter(i => i.severity === 'error');
  assert.deepStrictEqual(issues, []);
});
