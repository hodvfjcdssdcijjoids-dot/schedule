/* ShiftWise — employee management: list, create/edit modal (availability,
 * preferences, time off), delete. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const ui = global.App.ui;
  const store = global.App.store;

  function availabilitySummary(av) {
    return Array.from({ length: 7 }, (_, wd) => {
      const a = (av || [])[wd];
      const on = a && a.on;
      return '<span class="avdot' + (on ? ' avdot-on' : '') + '" title="' + U.DAY_NAMES[wd] +
        (on ? ' ' + U.fmtRange(a.start, a.end) : ' — unavailable') + '">' + U.DAY_ABBR[wd][0] + '</span>';
    }).join('');
  }

  function render(container) {
    const state = store.get();
    const S = state.settings;
    const emps = state.employees.slice().sort((a, b) => a.name.localeCompare(b.name));

    let html = '<div class="toolbar">' +
      '<h2>Employees <span class="count-badge">' + emps.length + '</span></h2>' +
      '<div class="toolbar-actions"><button class="btn btn-primary" data-action="add-emp">+ Add employee</button></div>' +
      '</div>';

    if (!emps.length) {
      html += '<div class="empty-state"><p>No employees yet.</p>' +
        '<button class="btn btn-primary" data-action="add-emp">Add your first employee</button></div>';
    } else {
      html += '<div class="card-grid">' + emps.map(e => {
        const pref = (e.prefs && e.prefs.shift) || 'any';
        return '<div class="card emp-card" style="--chip:' + e.color + '">' +
          '<div class="card-top"><span class="dot" style="--chip:' + e.color + '"></span>' +
          '<div><div class="card-title">' + U.escapeHtml(e.name) + '</div>' +
          '<span class="badge">' + U.escapeHtml(e.role) + '</span></div></div>' +
          '<div class="card-facts">' +
            '<span>' + S.currency + (e.wage || 0).toFixed(2) + '/hr</span>' +
            '<span>' + (e.minHours || 0) + '–' + (e.maxHours == null ? '∞' : e.maxHours) + ' h/wk</span>' +
            '<span>≤ ' + (e.maxDaysPerWeek || 7) + ' days</span>' +
            '<span>prefers ' + pref + '</span>' +
            ((e.contact && (e.contact.phone || e.contact.email)) ? '<span>' + U.escapeHtml([e.contact.phone, e.contact.email].filter(Boolean).join(' · ')) + '</span>' : '') +
            ((e.skills || []).length ? '<span>skills: ' + U.escapeHtml(e.skills.join(', ')) + '</span>' : '') +
          '</div>' +
          '<div class="card-avail">' + availabilitySummary(e.availability) + '</div>' +
          ((e.timeOff || []).length
            ? '<div class="card-timeoff">&#127958; ' + e.timeOff.length + ' time-off period' + (e.timeOff.length > 1 ? 's' : '') + '</div>'
            : '') +
          '<div class="card-actions">' +
            '<button class="btn btn-sm" data-action="edit-emp" data-id="' + e.id + '">Edit</button>' +
            '<button class="btn btn-sm btn-danger-ghost" data-action="del-emp" data-id="' + e.id + '">Delete</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }

    container.innerHTML = html;
    ui.bindActions(container, {
      'add-emp': () => openEmployeeModal(null),
      'edit-emp': (d) => openEmployeeModal(d.id),
      'del-emp': async (d) => {
        const emp = store.get().employees.find(e => e.id === d.id);
        if (!emp) return;
        const ok = await ui.confirmDialog({
          title: 'Delete ' + emp.name + '?',
          message: 'This removes them and every shift they are scheduled for. This cannot be undone.'
        });
        if (ok) { store.deleteEmployee(d.id); ui.toast(emp.name + ' deleted.'); }
      }
    });
  }

  function openEmployeeModal(id) {
    const state = store.get();
    const S = state.settings;
    const emp = id ? state.employees.find(e => e.id === id) : null;
    const av = emp ? U.deepClone(emp.availability) : store.emptyAvailability();
    const timeOff = emp ? U.deepClone(emp.timeOff || []) : [];
    const contact = emp && emp.contact ? emp.contact : {};
    const skills = emp && emp.skills ? emp.skills : [];

    // day rows follow the configured week start
    const dayOrder = Array.from({ length: 7 }, (_, i) => (i + (S.weekStartsOn === 0 ? 0 : 1)) % 7);

    const body =
      '<div class="form-grid form-grid-2">' +
        '<label>Name<input name="name" type="text" value="' + U.escapeHtml(emp ? emp.name : '') + '" placeholder="Full name"></label>' +
        '<label>Role<select name="role">' + state.roles.map(r =>
          '<option' + (emp && emp.role === r ? ' selected' : '') + '>' + U.escapeHtml(r) + '</option>').join('') + '</select></label>' +
        '<label>Hourly wage (' + U.escapeHtml(S.currency) + ')<input name="wage" type="number" min="0" step="0.25" value="' + (emp ? emp.wage : 15) + '"></label>' +
        '<label>Preferred shift time<select name="pref">' +
          ['any', 'morning', 'evening'].map(p => '<option' + (emp && emp.prefs && emp.prefs.shift === p ? ' selected' : '') + '>' + p + '</option>').join('') +
        '</select></label>' +
        '<label>Min hours / week<input name="minHours" type="number" min="0" max="80" step="1" value="' + (emp ? emp.minHours : 0) + '"></label>' +
        '<label>Max hours / week<input name="maxHours" type="number" min="0" max="80" step="1" value="' + (emp ? emp.maxHours : 40) + '"></label>' +
        '<label>Max days / week<input name="maxDays" type="number" min="1" max="7" step="1" value="' + (emp ? (emp.maxDaysPerWeek || 7) : 5) + '"></label>' +
        '<label>Color<input name="color" type="color" value="' + (emp ? emp.color : store.PALETTE[state.employees.length % store.PALETTE.length]) + '"></label>' +
        '<label>Phone<input name="phone" type="tel" value="' + U.escapeHtml(contact.phone || '') + '" placeholder="(555) 123-4567"></label>' +
        '<label>Email<input name="email" type="email" value="' + U.escapeHtml(contact.email || '') + '" placeholder="name@example.com"></label>' +
        '<label>Emergency contact<input name="emergencyName" type="text" value="' + U.escapeHtml(contact.emergencyName || '') + '"></label>' +
        '<label>Emergency phone<input name="emergencyPhone" type="tel" value="' + U.escapeHtml(contact.emergencyPhone || '') + '"></label>' +
      '</div>' +

      '<h4 class="section-h">Skills / qualifications</h4>' +
      '<div class="check-grid">' + state.roles.map(r =>
        '<label class="check-row"><input type="checkbox" data-skill="' + U.escapeHtml(r) + '"' + (skills.includes(r) ? ' checked' : '') + '> <span>' + U.escapeHtml(r) + '</span></label>').join('') + '</div>' +

      '<h4 class="section-h">Weekly availability</h4>' +
      '<div class="avail-editor">' + dayOrder.map(wd => {
        const a = av[wd];
        return '<div class="avail-row">' +
          '<label class="avail-day"><input type="checkbox" data-av-on="' + wd + '"' + (a.on ? ' checked' : '') + '> ' + U.DAY_NAMES[wd] + '</label>' +
          '<input type="time" data-av-start="' + wd + '" value="' + a.start + '"' + (a.on ? '' : ' disabled') + '>' +
          '<span class="avail-dash">to</span>' +
          '<input type="time" data-av-end="' + wd + '" value="' + a.end + '"' + (a.on ? '' : ' disabled') + '>' +
        '</div>';
      }).join('') + '</div>' +

      '<h4 class="section-h">Time off</h4>' +
      '<p class="hint">Time off blocks auto-scheduling for every date in the saved range, including overnight shifts that cross into a time-off day.</p>' +
      '<div id="timeoff-list"></div>' +
      '<div class="timeoff-add">' +
        '<input type="date" name="to-start" title="First day off">' +
        '<span class="avail-dash">to</span>' +
        '<input type="date" name="to-end" title="Last day off">' +
        '<input type="text" name="to-note" placeholder="Note (optional)">' +
        '<button type="button" class="btn btn-sm" data-add-timeoff>Add</button>' +
      '</div>';

    ui.openModal({
      title: emp ? 'Edit ' + emp.name : 'New employee',
      wide: true,
      body,
      onMount: (modal) => {
        modal.querySelectorAll('[data-av-on]').forEach(cb => {
          cb.addEventListener('change', () => {
            const wd = cb.dataset.avOn;
            modal.querySelector('[data-av-start="' + wd + '"]').disabled = !cb.checked;
            modal.querySelector('[data-av-end="' + wd + '"]').disabled = !cb.checked;
          });
        });

        const listEl = modal.querySelector('#timeoff-list');
        function redrawTimeOff() {
          listEl.innerHTML = timeOff.length
            ? timeOff.map((t, i) =>
                '<div class="timeoff-row"><span>' + t.start + ' → ' + t.end +
                (t.note ? ' <small>(' + U.escapeHtml(t.note) + ')</small>' : '') + '</span>' +
                '<button class="icon-btn" data-to-del="' + i + '" aria-label="Remove">&#10005;</button></div>').join('')
            : '<p class="hint">No time off recorded.</p>';
          listEl.querySelectorAll('[data-to-del]').forEach(btn => {
            btn.addEventListener('click', () => { timeOff.splice(+btn.dataset.toDel, 1); redrawTimeOff(); });
          });
        }
        redrawTimeOff();

        modal.querySelector('[data-add-timeoff]').addEventListener('click', () => {
          const start = modal.querySelector('[name=to-start]').value;
          const end = modal.querySelector('[name=to-end]').value || start;
          const note = modal.querySelector('[name=to-note]').value.trim();
          if (!start) { ui.toast('Pick a start date for the time off.', 'error'); return; }
          if (end < start) { ui.toast('Time off cannot end before it starts.', 'error'); return; }
          timeOff.push({ id: U.uid('to'), start, end, note });
          ui.toast('Time off added — save the employee to apply it.', 'success');
          modal.querySelector('[name=to-start]').value = '';
          modal.querySelector('[name=to-end]').value = '';
          modal.querySelector('[name=to-note]').value = '';
          redrawTimeOff();
        });
      },
      actions: [
        { label: 'Cancel', className: 'btn-ghost' },
        { label: emp ? 'Save changes' : 'Add employee', className: 'btn-primary', onClick: (modal) => {
          const name = modal.querySelector('[name=name]').value.trim();
          if (!name) { ui.toast('Name is required.', 'error'); return false; }
          const minHours = Math.max(0, +modal.querySelector('[name=minHours]').value || 0);
          const maxHours = Math.max(0, +modal.querySelector('[name=maxHours]').value || 0);
          if (minHours > maxHours) { ui.toast('Min hours cannot exceed max hours.', 'error'); return false; }

          for (const wd of Object.keys(av)) {
            const on = modal.querySelector('[data-av-on="' + wd + '"]').checked;
            const start = modal.querySelector('[data-av-start="' + wd + '"]').value || '09:00';
            const end = modal.querySelector('[data-av-end="' + wd + '"]').value || '17:00';
            if (on && U.parseTime(end) <= U.parseTime(start)) {
              ui.toast(U.DAY_NAMES[wd] + ' availability must end after it starts.', 'error');
              return false;
            }
            av[wd] = { on, start, end };
          }

          const data = {
            name,
            role: modal.querySelector('[name=role]').value,
            wage: Math.max(0, +modal.querySelector('[name=wage]').value || 0),
            minHours, maxHours,
            maxDaysPerWeek: U.clamp(+modal.querySelector('[name=maxDays]').value || 7, 1, 7),
            color: modal.querySelector('[name=color]').value,
            prefs: { shift: modal.querySelector('[name=pref]').value },
            contact: {
              phone: modal.querySelector('[name=phone]').value.trim(),
              email: modal.querySelector('[name=email]').value.trim(),
              emergencyName: modal.querySelector('[name=emergencyName]').value.trim(),
              emergencyPhone: modal.querySelector('[name=emergencyPhone]').value.trim()
            },
            skills: Array.from(modal.querySelectorAll('[data-skill]:checked')).map(cb => cb.dataset.skill),
            availability: av,
            timeOff
          };
          if (emp) { store.updateEmployee(emp.id, data); ui.toast('Saved ' + name + '.'); }
          else { store.addEmployee(data); ui.toast(name + ' added.'); }
        } }
      ]
    });
  }

  global.App.views = global.App.views || {};
  global.App.views.employees = { render };
})(typeof window !== 'undefined' ? window : globalThis);
