/* ShiftWise — shift templates (coverage requirements): list + editor. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const ui = global.App.ui;
  const store = global.App.store;

  function render(container) {
    const state = store.get();
    const templates = state.shiftTemplates.slice()
      .sort((a, b) => U.parseTime(a.start) - U.parseTime(b.start) || a.name.localeCompare(b.name));

    let html = '<div class="toolbar">' +
      '<h2>Shifts <span class="count-badge">' + templates.length + '</span></h2>' +
      '<div class="toolbar-actions"><button class="btn btn-primary" data-action="add-tpl">+ Add shift</button></div>' +
      '</div>' +
      '<p class="hint">Shifts define the coverage your store needs. The auto-scheduler fills each one, ' +
      'per day, with the required number of people (and required roles, if any).</p>';

    if (!templates.length) {
      html += '<div class="empty-state"><p>No shifts defined yet.</p>' +
        '<button class="btn btn-primary" data-action="add-tpl">Create your first shift</button></div>';
    } else {
      html += '<div class="card-grid">' + templates.map(t => {
        const roleNote = Object.entries(t.roleRequirements || {})
          .filter(([, n]) => n > 0).map(([r, n]) => n + ' ' + r).join(', ');
        return '<div class="card">' +
          '<div class="card-top"><div><div class="card-title">' + U.escapeHtml(t.name) + '</div>' +
          '<div class="tpl-meta">' + U.fmtRange(t.start, t.end) + '</div></div></div>' +
          '<div class="day-pills">' + Array.from({ length: 7 }, (_, wd) =>
            '<span class="pill' + ((t.days || []).includes(wd) ? ' pill-on' : '') + '">' + U.DAY_ABBR[wd] + '</span>').join('') +
          '</div>' +
          '<div class="card-facts"><span>base needs ' + (t.required || 1) + ' per day</span>' +
          (t.demand ? '<span>demand varies by day</span>' : '') +
          (roleNote ? '<span>incl. ' + U.escapeHtml(roleNote) + '</span>' : '') + '</div>' +
          '<div class="card-actions">' +
            '<button class="btn btn-sm" data-action="edit-tpl" data-id="' + t.id + '">Edit</button>' +
            '<button class="btn btn-sm btn-danger-ghost" data-action="del-tpl" data-id="' + t.id + '">Delete</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }

    container.innerHTML = html;
    ui.bindActions(container, {
      'add-tpl': () => openTemplateModal(null),
      'edit-tpl': (d) => openTemplateModal(d.id),
      'del-tpl': async (d) => {
        const t = store.get().shiftTemplates.find(x => x.id === d.id);
        if (!t) return;
        const ok = await ui.confirmDialog({
          title: 'Delete shift "' + t.name + '"?',
          message: 'Already-scheduled occurrences stay on the calendar (they move to the Custom row). ' +
            'Future auto-schedules will no longer fill this shift.'
        });
        if (ok) { store.deleteTemplate(d.id); ui.toast('Shift deleted.'); }
      }
    });
  }

  function openTemplateModal(id) {
    const state = store.get();
    const t = id ? state.shiftTemplates.find(x => x.id === id) : null;
    const days = t ? (t.days || []).slice() : [1, 2, 3, 4, 5];
    const rr = t ? Object.assign({}, t.roleRequirements) : {};
    const demand = t && t.demand ? Object.assign({}, t.demand) : {};

    const body =
      '<div class="form-grid form-grid-2">' +
        '<label>Shift name<input name="name" type="text" value="' + U.escapeHtml(t ? t.name : '') + '" placeholder="e.g. Opening"></label>' +
        '<label>People required per day<input name="required" type="number" min="1" max="20" step="1" value="' + (t ? (t.required || 1) : 1) + '"></label>' +
        '<label>Start<input name="start" type="time" value="' + (t ? t.start : '09:00') + '"></label>' +
        '<label>End<input name="end" type="time" value="' + (t ? t.end : '17:00') + '"><small class="hint">Can be earlier than start for overnight shifts.</small></label>' +
      '</div>' +
      '<h4 class="section-h">Days</h4>' +
      '<div class="day-checks">' + Array.from({ length: 7 }, (_, wd) =>
        '<label class="pill-check"><input type="checkbox" data-day="' + wd + '"' + (days.includes(wd) ? ' checked' : '') + '>' +
        U.DAY_ABBR[wd] + '</label>').join('') + '</div>' +
      '<h4 class="section-h">Demand by day <small class="hint-inline">optional override for busier/slower days</small></h4>' +
      '<div class="form-grid">' + Array.from({ length: 7 }, (_, wd) =>
        '<label>' + U.DAY_ABBR[wd] + '<input type="number" min="0" max="20" step="1" data-demand="' + wd + '" value="' + (demand[wd] == null ? '' : demand[wd]) + '" placeholder="base"></label>').join('') + '</div>' +
      '<h4 class="section-h">Role requirements <small class="hint-inline">(of the people required, how many must hold each role)</small></h4>' +
      '<div class="form-grid form-grid-2">' + state.roles.map(r =>
        '<label>' + U.escapeHtml(r) + '<input type="number" min="0" max="20" step="1" data-role="' + U.escapeHtml(r) + '" value="' + (rr[r] || 0) + '"></label>'
      ).join('') + '</div>';

    ui.openModal({
      title: t ? 'Edit shift' : 'New shift',
      wide: true,
      body,
      actions: [
        { label: 'Cancel', className: 'btn-ghost' },
        { label: t ? 'Save changes' : 'Add shift', className: 'btn-primary', onClick: (modal) => {
          const name = modal.querySelector('[name=name]').value.trim();
          if (!name) { ui.toast('Shift name is required.', 'error'); return false; }
          const start = modal.querySelector('[name=start]').value;
          const end = modal.querySelector('[name=end]').value;
          if (!start || !end) {
            ui.toast('Start and end times are required.', 'error');
            return false;
          }
          const required = U.clamp(+modal.querySelector('[name=required]').value || 1, 1, 20);
          const newDays = [];
          modal.querySelectorAll('[data-day]').forEach(cb => { if (cb.checked) newDays.push(+cb.dataset.day); });
          if (!newDays.length) { ui.toast('Pick at least one day.', 'error'); return false; }

          const roleRequirements = {};
          let roleSum = 0;
          modal.querySelectorAll('[data-role]').forEach(inp => {
            const n = Math.max(0, Math.floor(+inp.value || 0));
            if (n > 0) { roleRequirements[inp.dataset.role] = n; roleSum += n; }
          });
          if (roleSum > required) {
            ui.toast('Role requirements (' + roleSum + ') exceed the people required (' + required + ').', 'error');
            return false;
          }

          const demand = {};
          modal.querySelectorAll('[data-demand]').forEach(inp => { if (inp.value !== '') demand[inp.dataset.demand] = U.clamp(Math.floor(+inp.value || 0), 0, 20); });
          const data = { name, start, end, required, demand: Object.keys(demand).length ? demand : null, days: newDays, roleRequirements };
          if (t) { store.updateTemplate(t.id, data); ui.toast('Shift saved.'); }
          else { store.addTemplate(data); ui.toast('Shift added.'); }
        } }
      ]
    });
  }

  global.App.views = global.App.views || {};
  global.App.views.shifts = { render };
})(typeof window !== 'undefined' ? window : globalThis);
