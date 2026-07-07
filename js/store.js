/* ShiftWise — application state, persistence (localStorage) and CRUD. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const STORAGE_KEY = 'shiftwise.v1';

  const DEFAULT_SETTINGS = {
    storeName: 'My Store',
    weekStartsOn: 1,          // 0 = Sunday, 1 = Monday
    overtimeThreshold: 40,    // hours/week before overtime warnings + 1.5x cost
    minRestHours: 10,         // minimum rest between shifts on adjacent days (blocks "clopening")
    maxConsecutiveDays: 6,
    optimizeCost: false,      // default for the auto-scheduler's cost bias
    currency: '$',
    weeklyLaborBudget: 0,     // 0 disables budget warnings
    defaultBreakMinutes: 30,
    breakAfterHours: 6
  };

  const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

  let state = null;
  let undoSnapshot = null;
  const listeners = [];

  function defaultState() {
    return {
      employees: [],
      roles: ['Manager', 'Keyholder', 'Associate'],
      shiftTemplates: [],
      schedule: {},     // { "YYYY-MM-DD": [assignment, ...] }
      weekTemplates: [], // reusable snapshots of one week of shifts
      settings: Object.assign({}, DEFAULT_SETTINGS)
    };
  }

  function emptyAvailability() {
    return Array.from({ length: 7 }, () => ({ on: false, start: '09:00', end: '17:00' }));
  }

  /** Build an availability array from {weekday: [start, end]}. */
  function mkAvail(map) {
    const av = emptyAvailability();
    for (const [wd, [start, end]] of Object.entries(map)) {
      av[+wd] = { on: true, start, end };
    }
    return av;
  }

  function normalizeEmployee(e, i) {
    return Object.assign({
      id: U.uid('e'), name: 'Unnamed', role: 'Associate', wage: 0,
      minHours: 0, maxHours: 40, maxDaysPerWeek: 5,
      color: PALETTE[i % PALETTE.length],
      availability: emptyAvailability(),
      prefs: { shift: 'any' },
      contact: { phone: '', email: '', emergencyName: '', emergencyPhone: '' },
      skills: [],
      timeOff: []
    }, e);
  }

  function normalizeState(s) {
    const base = defaultState();
    s = s && typeof s === 'object' ? s : {};
    return {
      employees: (Array.isArray(s.employees) ? s.employees : []).map(normalizeEmployee),
      roles: Array.isArray(s.roles) && s.roles.length ? s.roles : base.roles,
      shiftTemplates: Array.isArray(s.shiftTemplates) ? s.shiftTemplates : [],
      schedule: s.schedule && typeof s.schedule === 'object' ? s.schedule : {},
      weekTemplates: Array.isArray(s.weekTemplates) ? s.weekTemplates : [],
      settings: Object.assign({}, DEFAULT_SETTINGS, s.settings || {})
    };
  }

  function sampleState() {
    const s = defaultState();
    s.settings.storeName = 'Maple Street Market';

    const emps = [
      { name: 'Maya Chen', role: 'Manager', wage: 24.50, minHours: 32, maxHours: 40, maxDaysPerWeek: 5,
        prefs: { shift: 'morning' },
        availability: mkAvail({ 1: ['06:00', '18:00'], 2: ['06:00', '18:00'], 3: ['06:00', '18:00'],
          4: ['06:00', '18:00'], 5: ['06:00', '18:00'], 6: ['06:00', '16:00'] }) },
      { name: 'Derek Okafor', role: 'Manager', wage: 23.00, minHours: 30, maxHours: 40, maxDaysPerWeek: 5,
        prefs: { shift: 'evening' },
        availability: mkAvail({ 0: ['07:00', '22:30'], 3: ['12:00', '22:30'], 4: ['12:00', '22:30'],
          5: ['12:00', '22:30'], 6: ['12:00', '22:30'] }) },
      { name: 'Priya Patel', role: 'Keyholder', wage: 19.25, minHours: 25, maxHours: 38, maxDaysPerWeek: 5,
        prefs: { shift: 'morning' },
        availability: mkAvail({ 0: ['07:00', '16:00'], 1: ['06:00', '16:00'], 2: ['06:00', '16:00'],
          3: ['06:00', '16:00'], 4: ['06:00', '16:00'], 5: ['06:00', '16:00'] }) },
      { name: 'Sam Rivera', role: 'Keyholder', wage: 18.75, minHours: 25, maxHours: 40, maxDaysPerWeek: 5,
        prefs: { shift: 'evening' },
        availability: mkAvail({ 0: ['13:00', '22:30'], 1: ['13:00', '22:30'], 2: ['13:00', '22:30'],
          3: ['13:00', '22:30'], 4: ['13:00', '22:30'], 5: ['13:00', '22:30'], 6: ['13:00', '22:30'] }) },
      { name: 'Nina Kowalski', role: 'Keyholder', wage: 18.50, minHours: 20, maxHours: 32, maxDaysPerWeek: 5,
        prefs: { shift: 'evening' },
        availability: mkAvail({ 0: ['13:00', '22:30'], 1: ['13:00', '22:30'], 2: ['13:00', '22:30'],
          3: ['13:00', '22:30'], 4: ['13:00', '22:30'] }) },
      { name: 'Jordan Lee', role: 'Associate', wage: 16.50, minHours: 12, maxHours: 25, maxDaysPerWeek: 4,
        prefs: { shift: 'evening' },
        availability: mkAvail({ 0: ['08:00', '22:30'], 1: ['15:30', '22:30'], 2: ['15:30', '22:30'],
          3: ['15:30', '22:30'], 4: ['15:30', '22:30'], 5: ['15:30', '22:30'], 6: ['08:00', '22:30'] }) },
      { name: 'Tommy Nguyen', role: 'Associate', wage: 16.00, minHours: 20, maxHours: 35, maxDaysPerWeek: 5,
        prefs: { shift: 'any' },
        availability: mkAvail({ 1: ['06:00', '22:30'], 2: ['06:00', '22:30'], 3: ['06:00', '22:30'],
          4: ['06:00', '22:30'], 5: ['06:00', '22:30'], 6: ['06:00', '22:30'] }) },
      { name: 'Alexis Romero', role: 'Associate', wage: 17.00, minHours: 20, maxHours: 32, maxDaysPerWeek: 5,
        prefs: { shift: 'morning' },
        availability: mkAvail({ 1: ['06:00', '16:00'], 2: ['06:00', '16:00'], 3: ['06:00', '16:00'],
          4: ['06:00', '16:00'], 5: ['06:00', '16:00'], 6: ['06:00', '16:00'] }) },
      { name: 'Ben Carter', role: 'Associate', wage: 15.50, minHours: 8, maxHours: 16, maxDaysPerWeek: 3,
        prefs: { shift: 'any' },
        availability: mkAvail({ 0: ['06:00', '22:30'], 5: ['15:00', '22:30'], 6: ['06:00', '22:30'] }) }
    ];
    s.employees = emps.map(normalizeEmployee);

    // Give one employee sample time off later this week (relative to today).
    const weekStart = U.startOfWeek(new Date(), s.settings.weekStartsOn);
    const jordan = s.employees.find(e => e.name === 'Jordan Lee');
    jordan.timeOff.push({
      id: U.uid('to'),
      start: U.dateToKey(U.addDays(weekStart, 4)),
      end: U.dateToKey(U.addDays(weekStart, 5)),
      note: 'Family trip'
    });

    s.shiftTemplates = [
      { id: U.uid('t'), name: 'Opening', start: '07:30', end: '15:30',
        days: [0, 1, 2, 3, 4, 5, 6], required: 2, roleRequirements: { Manager: 1 } },
      { id: U.uid('t'), name: 'Midday', start: '11:00', end: '19:00',
        days: [1, 2, 3, 4, 5], required: 1, roleRequirements: {} },
      { id: U.uid('t'), name: 'Closing', start: '14:00', end: '22:00',
        days: [0, 1, 2, 3, 4, 5, 6], required: 2, roleRequirements: { Keyholder: 1 } },
      { id: U.uid('t'), name: 'Weekend Surge', start: '10:00', end: '18:00',
        days: [0, 6], required: 1, roleRequirements: {} }
    ];
    return s;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    if (raw) {
      try {
        state = normalizeState(JSON.parse(raw));
        return;
      } catch (e) { /* corrupted — fall through to sample */ }
    }
    rememberUndo();
    state = sampleState();
    persist();
  }

  function rememberUndo() { undoSnapshot = U.deepClone(state); }

  function undo() {
    if (!undoSnapshot) return false;
    const cur = U.deepClone(state);
    state = normalizeState(undoSnapshot);
    undoSnapshot = cur;
    persist();
    notify();
    return true;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function save() {
    persist();
    notify();
  }

  function notify() { listeners.forEach(fn => fn(state)); }
  function subscribe(fn) { listeners.push(fn); }
  function get() { return state; }

  function nextColor() {
    const used = state.employees.map(e => e.color);
    return PALETTE.find(c => !used.includes(c)) || PALETTE[state.employees.length % PALETTE.length];
  }

  /* ----- employees ----- */

  function addEmployee(data) {
    const emp = normalizeEmployee(Object.assign({ color: nextColor() }, data, { id: U.uid('e') }), state.employees.length);
    rememberUndo();
    state.employees.push(emp);
    save();
    return emp;
  }

  function updateEmployee(id, patch) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return null;
    rememberUndo();
    Object.assign(emp, patch);
    save();
    return emp;
  }

  function deleteEmployee(id) {
    rememberUndo();
    state.employees = state.employees.filter(e => e.id !== id);
    for (const dk of Object.keys(state.schedule)) {
      state.schedule[dk] = state.schedule[dk].filter(a => a.employeeId !== id);
    }
    save();
  }

  /* ----- shift templates ----- */

  function addTemplate(data) {
    const t = Object.assign(
      { id: U.uid('t'), name: 'Shift', start: '09:00', end: '17:00', days: [], required: 1, roleRequirements: {} },
      data, { id: U.uid('t') });
    rememberUndo();
    state.shiftTemplates.push(t);
    save();
    return t;
  }

  function updateTemplate(id, patch) {
    const t = state.shiftTemplates.find(x => x.id === id);
    if (!t) return null;
    rememberUndo();
    Object.assign(t, patch);
    save();
    return t;
  }

  /** Deleting a template keeps already-scheduled shifts (they carry their own times). */
  function deleteTemplate(id) {
    rememberUndo();
    state.shiftTemplates = state.shiftTemplates.filter(t => t.id !== id);
    save();
  }

  /* ----- roles ----- */

  function addRole(name) {
    name = (name || '').trim();
    if (!name) return 'Role name is empty.';
    if (state.roles.some(r => r.toLowerCase() === name.toLowerCase())) return 'That role already exists.';
    rememberUndo();
    state.roles.push(name);
    save();
    return null;
  }

  function removeRole(name) {
    if (state.employees.some(e => e.role === name)) return 'A role in use by an employee cannot be removed.';
    if (state.shiftTemplates.some(t => (t.roleRequirements || {})[name])) return 'A role required by a shift cannot be removed.';
    if (state.roles.length <= 1) return 'At least one role is required.';
    rememberUndo();
    state.roles = state.roles.filter(r => r !== name);
    save();
    return null;
  }

  /* ----- schedule ----- */

  function addAssignment(a) {
    rememberUndo();
    const assignment = Object.assign({ id: U.uid('a'), locked: false }, a);
    (state.schedule[assignment.dateKey] = state.schedule[assignment.dateKey] || []).push(assignment);
    save();
    return assignment;
  }

  function removeAssignment(dateKey, id) {
    if (!state.schedule[dateKey]) return;
    rememberUndo();
    state.schedule[dateKey] = state.schedule[dateKey].filter(a => a.id !== id);
    save();
  }

  function toggleLock(dateKey, id) {
    const a = (state.schedule[dateKey] || []).find(x => x.id === id);
    if (a) { rememberUndo(); a.locked = !a.locked; save(); }
  }

  function moveAssignment(fromDateKey, id, toDateKey, templateId) {
    const list = state.schedule[fromDateKey] || [];
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) return false;
    rememberUndo();
    const a = list.splice(idx, 1)[0];
    a.dateKey = toDateKey;
    a.templateId = templateId || null;
    (state.schedule[toDateKey] = state.schedule[toDateKey] || []).push(a);
    save();
    return true;
  }

  /** Remove all unlocked assignments in the given days. Returns count removed. */
  function clearWeek(dateKeys) {
    rememberUndo();
    let removed = 0;
    for (const dk of dateKeys) {
      const before = (state.schedule[dk] || []).length;
      state.schedule[dk] = (state.schedule[dk] || []).filter(a => a.locked);
      removed += before - state.schedule[dk].length;
    }
    save();
    return removed;
  }

  /** Replace the week's days with the auto-scheduler's result. */
  function applyAutoResult(result, dateKeys) {
    rememberUndo();
    for (const dk of dateKeys) {
      state.schedule[dk] = result.schedule[dk] || [];
    }
    save();
  }


  function copyWeek(fromKeys, toKeys) {
    rememberUndo();
    for (let i = 0; i < toKeys.length; i++) {
      const locked = (state.schedule[toKeys[i]] || []).filter(a => a.locked);
      state.schedule[toKeys[i]] = locked.concat((state.schedule[fromKeys[i]] || []).map(a =>
        Object.assign({}, a, { id: U.uid('a'), dateKey: toKeys[i], locked: false })));
    }
    save();
  }

  function saveWeekTemplate(name, dateKeys) {
    name = (name || '').trim();
    if (!name) return null;
    rememberUndo();
    state.weekTemplates.push({ id: U.uid('wt'), name, shifts: dateKeys.map(dk =>
      (state.schedule[dk] || []).map(a => Object.assign({}, a, { offset: dateKeys.indexOf(dk) }))).flat() });
    save();
    return state.weekTemplates[state.weekTemplates.length - 1];
  }

  function applyWeekTemplate(id, dateKeys) {
    const tpl = state.weekTemplates.find(t => t.id === id);
    if (!tpl) return false;
    rememberUndo();
    for (const dk of dateKeys) state.schedule[dk] = (state.schedule[dk] || []).filter(a => a.locked);
    for (const a of tpl.shifts || []) {
      const dk = dateKeys[a.offset || 0];
      if (!dk) continue;
      (state.schedule[dk] = state.schedule[dk] || []).push(Object.assign({}, a, { id: U.uid('a'), dateKey: dk, locked: false }));
    }
    save();
    return true;
  }

  function deleteWeekTemplate(id) {
    rememberUndo();
    state.weekTemplates = state.weekTemplates.filter(t => t.id !== id);
    save();
  }

  /* ----- settings & data ----- */

  function updateSettings(patch) {
    rememberUndo();
    Object.assign(state.settings, patch);
    save();
  }

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.employees)) {
        return { ok: false, error: 'That file does not look like a ShiftWise backup.' };
      }
      state = normalizeState(parsed);
      save();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Could not parse the file: ' + e.message };
    }
  }

  function loadSampleData() {
    rememberUndo();
    state = sampleState();
    save();
  }

  function resetAll() {
    rememberUndo();
    state = defaultState();
    save();
  }

  global.App = global.App || {};
  global.App.store = {
    load, save, get, subscribe, undo,
    addEmployee, updateEmployee, deleteEmployee,
    addTemplate, updateTemplate, deleteTemplate,
    addRole, removeRole,
    addAssignment, removeAssignment, toggleLock, moveAssignment, clearWeek, applyAutoResult,
    copyWeek, saveWeekTemplate, applyWeekTemplate, deleteWeekTemplate,
    updateSettings, exportJSON, importJSON, loadSampleData, resetAll,
    emptyAvailability, PALETTE
  };
})(typeof window !== 'undefined' ? window : globalThis);
