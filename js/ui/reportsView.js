/* ShiftWise — weekly reports: hours & labor cost, coverage, issues. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const ui = global.App.ui;
  const store = global.App.store;
  const Scheduler = global.App.scheduler;

  function render(container) {
    const state = store.get();
    const S = state.settings;
    const dates = global.App.currentWeekDates();
    const keys = dates.map(U.dateToKey);
    const issues = Scheduler.validateWeek(state, keys);

    /* per-employee hours and cost */
    const rows = state.employees.map(emp => {
      const hours = Scheduler.weekHours(state.schedule, emp.id, keys, state.settings);
      const days = Scheduler.daysWorked(state.schedule, emp.id, keys);
      const ot = Math.max(0, hours - (S.overtimeThreshold || 40));
      const cost = (hours - ot) * (emp.wage || 0) + ot * (emp.wage || 0) * 1.5;
      let status = 'OK', cls = 'ok';
      if (emp.maxHours != null && hours > emp.maxHours + 1e-9) { status = 'Over max'; cls = 'bad'; }
      else if (ot > 0) { status = 'Overtime'; cls = 'warn'; }
      else if (hours === 0) { status = 'Unscheduled'; cls = 'muted'; }
      else if ((emp.minHours || 0) > 0 && hours < emp.minHours - 1e-9) { status = 'Under min'; cls = 'warn'; }
      return { emp, hours, days, ot, cost, status, cls };
    }).sort((a, b) => b.hours - a.hours);

    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);

    /* coverage */
    let requiredSlots = 0, filledSlots = 0;
    const coverage = state.shiftTemplates.map(t => {
      let req = 0, filled = 0;
      for (const dk of keys) {
        if (!(t.days || []).includes(U.weekdayOfKey(dk))) continue;
        req += t.required || 1;
        filled += Math.min(t.required || 1,
          (state.schedule[dk] || []).filter(a => a.templateId === t.id).length);
      }
      requiredSlots += req; filledSlots += filled;
      return { t, req, filled };
    });

    const money = n => S.currency + U.round2(n).toFixed(2);
    const errorCount = issues.filter(i => i.severity === 'error').length;

    let html = '<div class="toolbar">' +
      '<div class="week-nav">' +
        '<button class="btn btn-ghost" data-action="prev-week">&#8249;</button>' +
        '<button class="btn btn-ghost" data-action="this-week">Today</button>' +
        '<button class="btn btn-ghost" data-action="next-week">&#8250;</button>' +
        '<h2 class="week-label">Reports · ' + U.weekLabel(dates) + '</h2>' +
      '</div></div>';

    html += '<div class="stat-row">' +
      '<div class="stat"><div class="stat-num">' + U.round2(totalHours) + 'h</div><div class="stat-label">scheduled hours</div></div>' +
      '<div class="stat"><div class="stat-num">' + money(totalCost) + '</div><div class="stat-label">est. labor cost</div></div>' +
      '<div class="stat"><div class="stat-num">' + filledSlots + '/' + requiredSlots + '</div><div class="stat-label">coverage slots filled</div></div>' +
      '<div class="stat' + (errorCount ? ' stat-bad' : '') + '"><div class="stat-num">' + issues.length + '</div><div class="stat-label">issues (' + errorCount + ' errors)</div></div>' +
      '</div>';

    html += '<h3 class="section-h">Hours &amp; labor cost</h3>' +
      '<div class="table-wrap"><table class="report-table"><thead><tr>' +
      '<th>Employee</th><th>Role</th><th class="num">Days</th><th class="num">Hours</th>' +
      '<th class="num">Target</th><th class="num">OT hours</th><th class="num">Est. cost</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      rows.map(r =>
        '<tr><td><span class="dot" style="--chip:' + r.emp.color + '"></span> ' + U.escapeHtml(r.emp.name) + '</td>' +
        '<td>' + U.escapeHtml(r.emp.role) + '</td>' +
        '<td class="num">' + r.days + '</td>' +
        '<td class="num"><b>' + U.round2(r.hours) + '</b></td>' +
        '<td class="num">' + (r.emp.minHours || 0) + '–' + (r.emp.maxHours == null ? '∞' : r.emp.maxHours) + '</td>' +
        '<td class="num">' + (r.ot ? U.round2(r.ot) : '—') + '</td>' +
        '<td class="num">' + money(r.cost) + '</td>' +
        '<td><span class="status status-' + r.cls + '">' + r.status + '</span></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">Total</td><td class="num"><b>' + U.round2(totalHours) + '</b></td>' +
      '<td></td><td></td><td class="num"><b>' + money(totalCost) + '</b></td><td></td></tr></tfoot></table></div>';

    if (coverage.length) {
      html += '<h3 class="section-h">Coverage</h3><div class="table-wrap"><table class="report-table"><thead>' +
        '<tr><th>Shift</th><th>Time</th><th class="num">Slots this week</th><th class="num">Filled</th><th>Status</th></tr></thead><tbody>' +
        coverage.map(c =>
          '<tr><td>' + U.escapeHtml(c.t.name) + '</td><td>' + U.fmtRange(c.t.start, c.t.end) + '</td>' +
          '<td class="num">' + c.req + '</td><td class="num">' + c.filled + '</td>' +
          '<td><span class="status status-' + (c.filled >= c.req ? 'ok' : 'bad') + '">' +
          (c.filled >= c.req ? 'Covered' : (c.req - c.filled) + ' open') + '</span></td></tr>').join('') +
        '</tbody></table></div>';
    }

    html += '<h3 class="section-h">Issues</h3>';
    if (!issues.length) {
      html += '<p class="hint">&#10004; No issues — the week satisfies every constraint and coverage requirement.</p>';
    } else {
      html += '<ul class="issue-list">' + issues.map(i =>
        '<li class="issue issue-' + i.severity + '">' +
        '<span class="status status-' + (i.severity === 'error' ? 'bad' : 'warn') + '">' +
        (i.severity === 'error' ? 'Error' : 'Warning') + '</span> ' +
        U.escapeHtml(i.message) + '</li>').join('') + '</ul>';
    }

    container.innerHTML = html;
    ui.bindActions(container, {
      'prev-week': () => global.App.shiftWeek(-1),
      'next-week': () => global.App.shiftWeek(1),
      'this-week': () => global.App.gotoToday()
    });
  }

  global.App.views = global.App.views || {};
  global.App.views.reports = { render };
})(typeof window !== 'undefined' ? window : globalThis);
