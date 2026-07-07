/* ShiftWise — weekly schedule grid, auto-schedule flow, CSV export. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const ui = global.App.ui;
  const store = global.App.store;
  const Scheduler = global.App.scheduler;

  function empById(state) {
    return new Map(state.employees.map(e => [e.id, e]));
  }

  function chipHtml(a, emp) {
    const name = emp ? emp.name : 'Deleted employee';
    const color = emp ? emp.color : '#94a3b8';
    return '<div class="chip' + (a.locked ? ' chip-locked' : '') + (emp ? '' : ' chip-orphan') + '" style="--chip:' + color + '" draggable="true" data-drag-date="' + a.dateKey + '" data-drag-id="' + a.id + '">' +
      '<button class="chip-body" data-action="toggle-lock" data-date="' + a.dateKey + '" data-id="' + a.id + '" ' +
        'title="' + (a.locked ? 'Locked — auto-schedule and clear keep this shift. Click to unlock.' : 'Click to lock this shift so auto-schedule and clear keep it.') + '">' +
        (a.locked ? '<span class="chip-lock">&#128274;</span>' : '') +
        '<span class="chip-name">' + U.escapeHtml(name) + '</span>' +
        '<span class="chip-time">' + U.fmtRange(a.start, a.end) + '</span>' +
      '</button>' +
      '<button class="chip-x" data-action="remove-assign" data-date="' + a.dateKey + '" data-id="' + a.id + '" aria-label="Remove shift">&#10005;</button>' +
    '</div>';
  }

  /** Unmet role requirements for a template on a day: {role: missingCount}. */
  function unmetRoles(state, t, assigned) {
    const byId = empById(state);
    const unmet = {};
    for (const [role, count] of Object.entries(t.roleRequirements || {})) {
      if (!count) continue;
      const have = assigned.filter(a => {
        const e = byId.get(a.employeeId);
        return e && e.role === role;
      }).length;
      if (have < count) unmet[role] = count - have;
    }
    return unmet;
  }

  function render(container) {
    const state = store.get();
    const dates = global.App.currentWeekDates();
    const keys = dates.map(U.dateToKey);
    const todayKey = U.dateToKey(new Date());
    const byId = empById(state);
    const issues = Scheduler.validateWeek(state, keys);
    const errorCount = issues.filter(i => i.severity === 'error').length;

    const templates = state.shiftTemplates.slice()
      .sort((a, b) => U.parseTime(a.start) - U.parseTime(b.start) || a.name.localeCompare(b.name));

    let html = '<div class="toolbar no-print">' +
      '<div class="week-nav">' +
        '<button class="btn btn-ghost" data-action="prev-week" title="Previous week">&#8249;</button>' +
        '<button class="btn btn-ghost" data-action="this-week">Today</button>' +
        '<button class="btn btn-ghost" data-action="next-week" title="Next week">&#8250;</button>' +
        '<h2 class="week-label">' + U.weekLabel(dates) + '</h2>' +
      '</div>' +
      '<div class="toolbar-actions">' +
        '<button class="btn btn-primary" data-action="auto-schedule">&#10024; Auto-Schedule</button>' +
        '<button class="btn" data-action="copy-last-week">Copy last week</button>' +
        '<button class="btn" data-action="week-template">Templates</button>' +
        '<button class="btn" data-action="undo">Undo</button>' +
        '<button class="btn" data-action="clear-week">Clear week</button>' +
        '<button class="btn" data-action="employee-print">Print employee</button>' +
        '<button class="btn" data-action="export-ics">Export ICS</button>' +
        '<button class="btn" data-action="export-csv">Export CSV</button>' +
        '<button class="btn" data-action="print">Print</button>' +
      '</div>' +
    '</div>';

    html += '<div class="print-only print-head"><h2>' + U.escapeHtml(state.settings.storeName) +
      ' — ' + U.weekLabel(dates) + '</h2></div>';

    if (issues.length) {
      html += '<button class="issue-banner no-print" data-action="goto-reports">&#9888; ' +
        issues.length + ' issue' + (issues.length > 1 ? 's' : '') + ' this week' +
        (errorCount ? ' (' + errorCount + ' need attention)' : '') +
        ' — see Reports</button>';
    }

    const last = global.App.session.lastAuto;
    if (last && last.weekKey === keys[0] && last.unfilled.length) {
      html += '<div class="unfilled-panel no-print"><div class="unfilled-head">' +
        '<strong>' + last.unfilled.length + ' slot' + (last.unfilled.length > 1 ? 's' : '') +
        ' could not be filled</strong>' +
        '<button class="icon-btn" data-action="dismiss-unfilled" aria-label="Dismiss">&#10005;</button></div><ul>' +
        last.unfilled.map(u =>
          '<li><strong>' + U.escapeHtml(u.templateName) + '</strong> ' +
          U.shortDate(U.keyToDate(u.dateKey)) + ' ' + U.fmtRange(u.start, u.end) +
          (u.role ? ' (needs ' + U.escapeHtml(u.role) + ')' : '') +
          ' — ' + U.escapeHtml(Scheduler.describeReasons(u.reasons)) + '</li>').join('') +
        '</ul></div>';
    }

    /* --- the grid --- */
    html += '<div class="table-wrap"><table class="sched-table"><thead><tr><th class="corner">Shift</th>';
    for (const d of dates) {
      const isToday = U.dateToKey(d) === todayKey;
      html += '<th class="' + (isToday ? 'today' : '') + '"><div class="day-name">' + U.DAY_ABBR[d.getDay()] +
        '</div><div class="day-date">' + U.MONTH_ABBR[d.getMonth()] + ' ' + d.getDate() + '</div></th>';
    }
    html += '</tr></thead><tbody>';

    for (const t of templates) {
      const roleNote = Object.entries(t.roleRequirements || {})
        .filter(([, n]) => n > 0).map(([r, n]) => n + ' ' + r).join(', ');
      html += '<tr><th class="row-head"><div class="tpl-name">' + U.escapeHtml(t.name) + '</div>' +
        '<div class="tpl-meta">' + U.fmtRange(t.start, t.end) + ' · needs ' + (t.required || 1) +
        (roleNote ? '<br>incl. ' + U.escapeHtml(roleNote) : '') + '</div></th>';
      for (const dk of keys) {
        const wd = U.weekdayOfKey(dk);
        if (!(t.days || []).includes(wd)) {
          html += '<td class="cell cell-off"><span class="off-dash">—</span></td>';
          continue;
        }
        const assigned = (state.schedule[dk] || []).filter(a => a.templateId === t.id);
        const missing = (t.required || 1) - assigned.length;
        const unmet = unmetRoles(state, t, assigned);
        const unmetNote = Object.entries(unmet).map(([r, n]) => 'needs ' + n + ' ' + r).join(', ');
        html += '<td class="cell' + (dk === todayKey ? ' today' : '') + (missing > 0 ? ' cell-short' : '') + '" data-drop-date="' + dk + '" data-drop-template="' + t.id + '">' +
          assigned.map(a => chipHtml(a, byId.get(a.employeeId))).join('') +
          (missing > 0
            ? '<button class="add-btn no-print" data-action="open-assign" data-date="' + dk + '" data-template="' + t.id + '">' +
              '+ ' + missing + ' open' + (unmetNote ? '<span class="add-note">' + U.escapeHtml(unmetNote) + '</span>' : '') + '</button>'
            : '<button class="add-btn add-btn-extra no-print" data-action="open-assign" data-date="' + dk + '" data-template="' + t.id + '" title="Add above requirement">+</button>') +
          '</td>';
      }
      html += '</tr>';
    }

    /* custom / orphaned shifts row */
    const tplIds = new Set(state.shiftTemplates.map(t => t.id));
    html += '<tr class="custom-row"><th class="row-head"><div class="tpl-name">Custom</div>' +
      '<div class="tpl-meta">one-off shifts</div></th>';
    for (const dk of keys) {
      const customs = (state.schedule[dk] || []).filter(a => !a.templateId || !tplIds.has(a.templateId));
      html += '<td class="cell' + (dk === todayKey ? ' today' : '') + '" data-drop-date="' + dk + '" data-drop-template="">' +
        customs.map(a => chipHtml(a, byId.get(a.employeeId))).join('') +
        '<button class="add-btn add-btn-extra no-print" data-action="open-custom" data-date="' + dk + '" title="Add a custom shift">+</button>' +
        '</td>';
    }
    html += '</tr></tbody></table></div>';

    /* weekly hours summary */
    const summaries = state.employees.map(e => ({
      emp: e, hours: Scheduler.weekHours(state.schedule, e.id, keys, state.settings)
    })).filter(s => s.hours > 0).sort((a, b) => b.hours - a.hours);
    if (summaries.length) {
      html += '<div class="hours-strip">' + summaries.map(s => {
        const over = s.emp.maxHours != null && s.hours > s.emp.maxHours + 1e-9;
        const ot = s.hours > (state.settings.overtimeThreshold || 40) + 1e-9;
        return '<span class="hours-pill' + (over || ot ? ' hours-hot' : '') + '" style="--chip:' + s.emp.color + '">' +
          U.escapeHtml(s.emp.name) + ' <b>' + U.round2(s.hours) + 'h</b>' +
          '<small>/' + (s.emp.minHours || 0) + '–' + (s.emp.maxHours == null ? '∞' : s.emp.maxHours) + '</small></span>';
      }).join('') + '</div>';
    }

    container.innerHTML = html;

    bindDragDrop(container);

    ui.bindActions(container, {
      'prev-week': () => global.App.shiftWeek(-1),
      'next-week': () => global.App.shiftWeek(1),
      'this-week': () => global.App.gotoToday(),
      'goto-reports': () => global.App.setTab('reports'),
      'dismiss-unfilled': () => { global.App.session.lastAuto = null; global.App.render(); },
      'print': () => window.print(),
      'export-csv': () => exportCsv(state, dates, keys),
      'export-ics': () => exportIcs(state, dates, keys),
      'employee-print': () => printEmployeeSchedule(state, dates, keys),
      'copy-last-week': async () => {
        const prev = keys.map(k => U.dateToKey(U.addDays(U.keyToDate(k), -7)));
        const ok = await ui.confirmDialog({ title: 'Copy last week?', message: 'This replaces unlocked shifts in the visible week with copies from the previous week.', confirmLabel: 'Copy last week' });
        if (ok) { store.copyWeek(prev, keys); ui.toast('Copied last week into this week.'); }
      },
      'week-template': () => openWeekTemplateModal(state, keys),
      'undo': () => { if (store.undo()) ui.toast('Undid last change.'); else ui.toast('Nothing to undo.', 'warn'); },
      'clear-week': async () => {
        const ok = await ui.confirmDialog({
          title: 'Clear this week?',
          message: 'All unlocked shifts from ' + U.weekLabel(dates) + ' will be removed. Locked shifts stay.',
          confirmLabel: 'Clear week'
        });
        if (ok) {
          const n = store.clearWeek(keys);
          ui.toast('Removed ' + n + ' shift' + (n === 1 ? '' : 's') + '.');
        }
      },
      'auto-schedule': () => openAutoScheduleModal(state, keys),
      'open-assign': (d) => openAssignModal(d.date, d.template),
      'open-custom': (d) => openCustomModal(d.date),
      'remove-assign': (d) => store.removeAssignment(d.date, d.id),
      'toggle-lock': (d) => store.toggleLock(d.date, d.id)
    });
  }


  function bindDragDrop(container) {
    container.querySelectorAll('[data-drag-id]').forEach(chip => {
      chip.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', JSON.stringify({ id: chip.dataset.dragId, date: chip.dataset.dragDate }));
      });
    });
    container.querySelectorAll('[data-drop-date]').forEach(cell => {
      cell.addEventListener('dragover', ev => ev.preventDefault());
      cell.addEventListener('drop', ev => {
        ev.preventDefault();
        try {
          const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
          if (store.moveAssignment(data.date, data.id, cell.dataset.dropDate, cell.dataset.dropTemplate || null)) {
            ui.toast('Shift moved.');
          }
        } catch (e) { /* ignore invalid drags */ }
      });
    });
  }

  function openAutoScheduleModal(state, keys) {
    if (!state.shiftTemplates.length) {
      ui.toast('Define shifts first (Shifts tab) so the auto-scheduler knows what to fill.', 'warn');
      return;
    }
    if (!state.employees.length) {
      ui.toast('Add employees first (Employees tab).', 'warn');
      return;
    }
    ui.openModal({
      title: 'Auto-Schedule this week',
      body:
        '<label class="radio-row"><input type="radio" name="mode" value="fill" checked>' +
        '<span><b>Fill open slots</b><br><small>Keeps every current shift and only adds what is missing.</small></span></label>' +
        '<label class="radio-row"><input type="radio" name="mode" value="rebuild">' +
        '<span><b>Rebuild week</b><br><small>Replaces unlocked auto-scheduled shifts. Locked &#128274; and custom shifts are kept.</small></span></label>' +
        '<label class="check-row"><input type="checkbox" name="optimizeCost"' + (state.settings.optimizeCost ? ' checked' : '') + '>' +
        '<span>Prefer lower labor cost (biases picks toward lower wages)</span></label>' +
        '<p class="hint">The scheduler honors availability, time off, max hours/days, role requirements, ' +
        'rest between shifts, and balances hours toward each person’s target.</p>',
      actions: [
        { label: 'Cancel', className: 'btn-ghost' },
        { label: 'Run auto-schedule', className: 'btn-primary', onClick: (modal) => {
          const mode = modal.querySelector('input[name=mode]:checked').value;
          const optimizeCost = modal.querySelector('input[name=optimizeCost]').checked;
          const result = Scheduler.autoSchedule(store.get(), keys, { mode, optimizeCost });
          store.applyAutoResult(result, keys);
          global.App.session.lastAuto = { weekKey: keys[0], unfilled: result.unfilled };
          const total = result.created.length + result.unfilled.length;
          ui.toast('Auto-schedule filled ' + result.created.length + ' of ' + total + ' open slot' +
            (total === 1 ? '' : 's') + (result.unfilled.length ? ' — ' + result.unfilled.length + ' unfilled.' : '.'),
            result.unfilled.length ? 'warn' : 'success');
        } }
      ]
    });
  }

  function openAssignModal(dateKey, templateId) {
    const state = store.get();
    const t = state.shiftTemplates.find(x => x.id === templateId);
    if (!t) return;
    const keys = global.App.currentWeekDates().map(U.dateToKey);
    const slot = { dateKey, startMin: U.parseTime(t.start), endMin: U.parseTime(t.end), role: null };
    const assigned = (state.schedule[dateKey] || []).filter(a => a.templateId === t.id);
    const unmet = unmetRoles(state, t, assigned);
    const alreadyIds = new Set(assigned.map(a => a.employeeId));

    const rows = state.employees
      .map(emp => {
        const block = alreadyIds.has(emp.id)
          ? { code: 'overlap', msg: 'already on this shift' }
          : Scheduler.assessCandidate(state, state.schedule, keys, emp, slot);
        return { emp, block, hours: Scheduler.weekHours(state.schedule, emp.id, keys, state.settings) };
      })
      .sort((a, b) =>
        (a.block ? 1 : 0) - (b.block ? 1 : 0) ||
        ((unmet[b.emp.role] ? 1 : 0) - (unmet[a.emp.role] ? 1 : 0)) ||
        a.hours - b.hours);

    const unmetNote = Object.entries(unmet).map(([r, n]) => n + ' ' + r).join(', ');
    ui.openModal({
      title: 'Assign — ' + t.name + ' · ' + U.shortDate(U.keyToDate(dateKey)) + ' · ' + U.fmtRange(t.start, t.end),
      body:
        (unmetNote ? '<p class="hint">&#9888; This shift still needs: <b>' + U.escapeHtml(unmetNote) + '</b></p>' : '') +
        '<div class="assign-list">' + rows.map(r =>
          '<div class="assign-row' + (r.block ? ' assign-blocked' : '') + '">' +
            '<span class="dot" style="--chip:' + r.emp.color + '"></span>' +
            '<span class="assign-name">' + U.escapeHtml(r.emp.name) +
              ' <small>' + U.escapeHtml(r.emp.role) + ' · ' + U.round2(r.hours) + 'h this week</small></span>' +
            (r.block
              ? '<span class="assign-reason">' + U.escapeHtml(r.block.msg) + '</span>' +
                '<button class="btn btn-ghost btn-sm" data-emp="' + r.emp.id + '" data-force="1">Assign anyway</button>'
              : '<button class="btn btn-primary btn-sm" data-emp="' + r.emp.id + '">Assign</button>') +
          '</div>').join('') +
        (rows.length ? '' : '<p class="hint">No employees yet — add some in the Employees tab.</p>') +
        '</div>',
      onMount: (modal) => {
        modal.querySelectorAll('button[data-emp]').forEach(btn => {
          btn.addEventListener('click', () => {
            store.addAssignment({
              dateKey, employeeId: btn.dataset.emp, templateId: t.id, start: t.start, end: t.end
            });
            ui.closeModal();
            if (btn.dataset.force) ui.toast('Assigned with a constraint override — check Reports for the warning.', 'warn');
          });
        });
      },
      actions: [{ label: 'Close', className: 'btn-ghost' }]
    });
  }

  function openCustomModal(dateKey) {
    const state = store.get();
    if (!state.employees.length) {
      ui.toast('Add employees first (Employees tab).', 'warn');
      return;
    }
    ui.openModal({
      title: 'Custom shift — ' + U.shortDate(U.keyToDate(dateKey)),
      body:
        '<div class="form-grid">' +
        '<label>Employee<select name="emp">' +
          state.employees.map(e => '<option value="' + e.id + '">' + U.escapeHtml(e.name) + ' (' + U.escapeHtml(e.role) + ')</option>').join('') +
        '</select></label>' +
        '<label>Start<input type="time" name="start" value="09:00"></label>' +
        '<label>End<input type="time" name="end" value="17:00"></label>' +
        '</div>',
      actions: [
        { label: 'Cancel', className: 'btn-ghost' },
        { label: 'Add shift', className: 'btn-primary', onClick: (modal) => {
          const emp = modal.querySelector('[name=emp]').value;
          const start = modal.querySelector('[name=start]').value;
          const end = modal.querySelector('[name=end]').value;
          if (!start || !end || U.parseTime(end) <= U.parseTime(start)) {
            ui.toast('End time must be after start time.', 'error');
            return false;
          }
          store.addAssignment({ dateKey, employeeId: emp, templateId: null, start, end });
        } }
      ]
    });
  }


  function openWeekTemplateModal(state, keys) {
    const options = (state.weekTemplates || []).map(t => '<option value="' + t.id + '">' + U.escapeHtml(t.name) + '</option>').join('');
    ui.openModal({
      title: 'Week templates',
      body: '<p class="hint">Save the visible week as a reusable standard week, or apply an existing template.</p>' +
        '<div class="form-grid"><label>Template name<input name="tpl-name" placeholder="Standard week"></label>' +
        '<label>Saved templates<select name="tpl-id">' + (options || '<option value="">No templates saved</option>') + '</select></label></div>',
      actions: [
        { label: 'Close', className: 'btn-ghost' },
        { label: 'Save current week', onClick: (modal) => {
          const tpl = store.saveWeekTemplate(modal.querySelector('[name=tpl-name]').value || ('Week of ' + keys[0]), keys);
          if (tpl) ui.toast('Saved week template.');
        } },
        { label: 'Apply template', className: 'btn-primary', onClick: (modal) => {
          const id = modal.querySelector('[name=tpl-id]').value;
          if (!id) { ui.toast('Choose a saved template first.', 'warn'); return false; }
          store.applyWeekTemplate(id, keys);
          ui.toast('Applied week template.');
        } }
      ]
    });
  }

  function dtStamp(dateKey, time) { return dateKey.replace(/-/g, '') + 'T' + time.replace(':', '') + '00'; }

  function exportIcs(state, dates, keys) {
    const byId = empById(state);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ShiftWise//Schedule//EN'];
    for (const dk of keys) for (const a of (state.schedule[dk] || [])) {
      const emp = byId.get(a.employeeId);
      const endKey = U.parseTime(a.end) <= U.parseTime(a.start) ? U.dateToKey(U.addDays(U.keyToDate(dk), 1)) : dk;
      lines.push('BEGIN:VEVENT', 'UID:' + a.id + '@shiftwise', 'DTSTART:' + dtStamp(dk, a.start), 'DTEND:' + dtStamp(endKey, a.end),
        'SUMMARY:' + (emp ? emp.name : 'Employee') + ' shift', 'DESCRIPTION:' + state.settings.storeName, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    ui.download('shiftwise-' + keys[0] + '.ics', lines.join('\r\n'), 'text/calendar');
    ui.toast('Calendar file exported.');
  }

  function printEmployeeSchedule(state, dates, keys) {
    ui.openModal({
      title: 'Print one employee schedule',
      body: '<label class="stack">Employee<select name="emp">' + state.employees.map(e => '<option value="' + e.id + '">' + U.escapeHtml(e.name) + '</option>').join('') + '</select></label>',
      actions: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Print', className: 'btn-primary', onClick: (modal) => {
        const emp = state.employees.find(e => e.id === modal.querySelector('[name=emp]').value);
        if (!emp) return false;
        const w = window.open('', '_blank');
        const rows = keys.map((dk, i) => '<tr><td>' + U.shortDate(dates[i]) + '</td><td>' + (state.schedule[dk] || []).filter(a => a.employeeId === emp.id).map(a => U.fmtRange(a.start, a.end)).join('<br>') + '</td></tr>').join('');
        w.document.write('<title>' + U.escapeHtml(emp.name) + ' schedule</title><h1>' + U.escapeHtml(emp.name) + '</h1><h2>' + U.escapeHtml(state.settings.storeName) + ' — ' + U.weekLabel(dates) + '</h2><table border="1" cellpadding="8">' + rows + '</table>');
        w.document.close(); w.print();
      } }]
    });
  }

  function exportCsv(state, dates, keys) {
    const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
    const S = state.settings;
    const lines = [];
    lines.push([esc(S.storeName + ' — week of ' + U.weekLabel(dates))].join(','));
    lines.push(['Employee', 'Role', ...dates.map(d => U.shortDate(d)), 'Hours', 'Est. cost'].map(esc).join(','));
    for (const emp of state.employees) {
      const cells = keys.map(dk =>
        (state.schedule[dk] || [])
          .filter(a => a.employeeId === emp.id)
          .sort((a, b) => U.parseTime(a.start) - U.parseTime(b.start))
          .map(a => U.fmtRange(a.start, a.end))
          .join(' / '));
      const hours = Scheduler.weekHours(state.schedule, emp.id, keys, state.settings);
      const ot = Math.max(0, hours - (S.overtimeThreshold || 40));
      const cost = (hours - ot) * (emp.wage || 0) + ot * (emp.wage || 0) * 1.5;
      lines.push([emp.name, emp.role, ...cells, U.round2(hours), S.currency + U.round2(cost).toFixed(2)].map(esc).join(','));
    }
    ui.download('schedule-' + keys[0] + '.csv', lines.join('\r\n'), 'text/csv');
    ui.toast('CSV exported.');
  }

  global.App.views = global.App.views || {};
  global.App.views.schedule = { render };
})(typeof window !== 'undefined' ? window : globalThis);
