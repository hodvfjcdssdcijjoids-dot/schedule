/* ShiftWise — app shell: tabs, week navigation, render orchestration. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const store = global.App.store;

  const TABS = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'employees', label: 'Employees' },
    { id: 'shifts', label: 'Shifts' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' }
  ];

  global.App.session = {
    tab: 'schedule',
    weekStart: null,   // Date — first day of the visible week
    lastAuto: null     // {weekKey, unfilled[]} from the most recent auto-schedule run
  };

  function currentWeekDates() {
    return U.weekDates(global.App.session.weekStart);
  }

  function shiftWeek(n) {
    global.App.session.weekStart = U.addDays(global.App.session.weekStart, n * 7);
    render();
  }

  function gotoToday() {
    global.App.session.weekStart = U.startOfWeek(new Date(), store.get().settings.weekStartsOn);
    render();
  }

  function setTab(tab) {
    global.App.session.tab = tab;
    render();
  }

  function render() {
    const state = store.get();
    const session = global.App.session;

    if (!session.weekStart) {
      session.weekStart = U.startOfWeek(new Date(), state.settings.weekStartsOn);
    } else {
      // keep the visible week aligned if the week-start setting changed
      session.weekStart = U.startOfWeek(session.weekStart, state.settings.weekStartsOn);
    }

    document.documentElement.dataset.theme = state.settings.theme === 'dark' ? 'dark' : 'light';

    const header = document.getElementById('app-header');
    header.innerHTML =
      '<div class="brand"><span class="brand-logo">&#128197;</span>' +
      '<div><div class="brand-name">ShiftWise</div>' +
      '<div class="brand-store">' + U.escapeHtml(state.settings.storeName) + '</div></div></div>' +
      '<nav class="tabs">' + TABS.map(t =>
        '<button class="tab' + (session.tab === t.id ? ' tab-active' : '') + '" data-tab="' + t.id + '">' +
        t.label + '</button>').join('') + '</nav>';
    header.querySelectorAll('[data-tab]').forEach(btn =>
      btn.addEventListener('click', () => setTab(btn.dataset.tab)));

    const view = document.getElementById('view');
    const views = global.App.views;
    (views[session.tab] || views.schedule).render(view);
  }

  global.App.currentWeekDates = currentWeekDates;
  global.App.shiftWeek = shiftWeek;
  global.App.gotoToday = gotoToday;
  global.App.setTab = setTab;
  global.App.render = render;

  store.load();
  store.subscribe(render);
  render();
})(typeof window !== 'undefined' ? window : globalThis);
