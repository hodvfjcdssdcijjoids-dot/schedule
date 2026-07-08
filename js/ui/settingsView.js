/* ShiftWise — settings: store profile, scheduling rules, roles, data tools. */
(function (global) {
  'use strict';

  const U = global.App.utils;
  const ui = global.App.ui;
  const store = global.App.store;

  function render(container) {
    const state = store.get();
    const S = state.settings;

    const html =
      '<div class="toolbar"><h2>Settings</h2></div>' +

      '<div class="settings-grid">' +

      '<div class="card"><h3 class="card-title">Store</h3>' +
        '<label class="stack">Store name<input type="text" data-action="set-store-name" value="' + U.escapeHtml(S.storeName) + '"></label>' +
        '<label class="stack">Week starts on<select data-action="set-week-start">' +
          '<option value="1"' + (S.weekStartsOn === 1 ? ' selected' : '') + '>Monday</option>' +
          '<option value="0"' + (S.weekStartsOn === 0 ? ' selected' : '') + '>Sunday</option>' +
        '</select></label>' +
        '<label class="stack">Currency symbol<input type="text" maxlength="3" data-action="set-currency" value="' + U.escapeHtml(S.currency) + '"></label>' +
        '<label class="stack">Theme<select data-action="set-theme">' +
          [
            ['light', 'Light'], ['dark', 'Dark'], ['midnight', 'Midnight'],
            ['forest', 'Forest'], ['sunset', 'Sunset'], ['ocean', 'Ocean'],
            ['high-contrast', 'High contrast']
          ].map(([value, label]) => '<option value="' + value + '"' + ((S.theme || 'light') === value ? ' selected' : '') + '>' + label + '</option>').join('') +
        '</select></label>' +
      '</div>' +

      '<div class="card"><h3 class="card-title">Scheduling rules</h3>' +
        '<label class="stack">Overtime threshold (hours/week)' +
          '<input type="number" min="0" max="80" data-action="set-ot" value="' + S.overtimeThreshold + '">' +
          '<small class="hint">Hours beyond this cost 1.5× and raise a warning.</small></label>' +
        '<label class="stack">Minimum rest between shifts (hours)' +
          '<input type="number" min="0" max="24" data-action="set-rest" value="' + S.minRestHours + '">' +
          '<small class="hint">Blocks “clopening”. 0 disables the rule.</small></label>' +
        '<label class="stack">Max consecutive work days' +
          '<input type="number" min="0" max="14" data-action="set-consec" value="' + S.maxConsecutiveDays + '">' +
          '<small class="hint">0 disables the rule.</small></label>' +
        '<label class="stack">Weekly labor budget (' + U.escapeHtml(S.currency) + ')' +
          '<input type="number" min="0" step="1" data-action="set-budget" value="' + (S.weeklyLaborBudget || 0) + '">' +
          '<small class="hint">0 disables budget warnings.</small></label>' +
        '<label class="stack">Automatic unpaid break minutes<input type="number" min="0" max="120" step="5" data-action="set-break-mins" value="' + (S.defaultBreakMinutes || 0) + '"></label>' +
        '<label class="stack">Apply break after this many hours<input type="number" min="0" max="24" step="0.5" data-action="set-break-after" value="' + (S.breakAfterHours || 0) + '"></label>' +
        '<label class="check-row"><input type="checkbox" data-action="set-cost"' + (S.optimizeCost ? ' checked' : '') + '>' +
          '<span>Auto-scheduler prefers lower labor cost by default</span></label>' +
      '</div>' +

      '<div class="card"><h3 class="card-title">Roles</h3>' +
        '<div class="role-list">' + state.roles.map(r =>
          '<span class="badge badge-lg">' + U.escapeHtml(r) +
          ' <button class="icon-btn" data-action="del-role" data-role="' + U.escapeHtml(r) + '" aria-label="Remove role">&#10005;</button></span>'
        ).join('') + '</div>' +
        '<div class="role-add"><input type="text" id="new-role" placeholder="New role name">' +
        '<button class="btn btn-sm" data-action="add-role">Add role</button></div>' +
      '</div>' +

      '<div class="card"><h3 class="card-title">Data</h3>' +
        '<p class="hint">Everything is stored locally in this browser. Export a backup to move or share it.</p>' +
        '<div class="btn-col">' +
          '<button class="btn" data-action="export-json">Download backup (JSON)</button>' +
          '<label class="btn file-btn">Import backup<input type="file" accept=".json,application/json" data-action="import-json" hidden></label>' +
          '<button class="btn" data-action="load-sample">Load sample data</button>' +
          '<button class="btn btn-danger-ghost" data-action="reset-all">Reset all data</button>' +
        '</div>' +
      '</div>' +

      '</div>';

    container.innerHTML = html;

    const num = (v, fallback) => { const n = +v; return Number.isFinite(n) && n >= 0 ? n : fallback; };

    ui.bindActions(container, {
      'set-store-name': (d, el) => store.updateSettings({ storeName: el.value.trim() || 'My Store' }),
      'set-week-start': (d, el) => store.updateSettings({ weekStartsOn: +el.value }),
      'set-currency': (d, el) => store.updateSettings({ currency: el.value || '$' }),
      'set-theme': (d, el) => store.updateSettings({ theme: el.value }),
      'set-ot': (d, el) => store.updateSettings({ overtimeThreshold: num(el.value, 40) }),
      'set-rest': (d, el) => store.updateSettings({ minRestHours: num(el.value, 10) }),
      'set-consec': (d, el) => store.updateSettings({ maxConsecutiveDays: num(el.value, 6) }),
      'set-budget': (d, el) => store.updateSettings({ weeklyLaborBudget: num(el.value, 0) }),
      'set-break-mins': (d, el) => store.updateSettings({ defaultBreakMinutes: num(el.value, 0) }),
      'set-break-after': (d, el) => store.updateSettings({ breakAfterHours: num(el.value, 0) }),
      'set-cost': (d, el) => store.updateSettings({ optimizeCost: el.checked }),

      'add-role': () => {
        const input = container.querySelector('#new-role');
        const err = store.addRole(input.value);
        if (err) ui.toast(err, 'error'); else ui.toast('Role added.');
      },
      'del-role': (d) => {
        const err = store.removeRole(d.role);
        if (err) ui.toast(err, 'error'); else ui.toast('Role removed.');
      },

      'export-json': () => {
        ui.download('shiftwise-backup-' + U.dateToKey(new Date()) + '.json', store.exportJSON(), 'application/json');
        ui.toast('Backup downloaded.');
      },
      'import-json': (d, el) => {
        const file = el.files && el.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const res = store.importJSON(reader.result);
          if (res.ok) ui.toast('Backup imported.', 'success');
          else ui.toast(res.error, 'error');
        };
        reader.readAsText(file);
        el.value = '';
      },
      'load-sample': async () => {
        const ok = await ui.confirmDialog({
          title: 'Load sample data?',
          message: 'This replaces the current employees, shifts and schedule with the demo store.',
          confirmLabel: 'Load sample'
        });
        if (ok) { store.loadSampleData(); ui.toast('Sample data loaded.', 'success'); }
      },
      'reset-all': async () => {
        const ok = await ui.confirmDialog({
          title: 'Reset ALL data?',
          message: 'Employees, shifts, schedules and settings will be permanently erased from this browser.',
          confirmLabel: 'Erase everything'
        });
        if (ok) { store.resetAll(); ui.toast('All data reset.'); }
      }
    });
  }

  global.App.views = global.App.views || {};
  global.App.views.settings = { render };
})(typeof window !== 'undefined' ? window : globalThis);
