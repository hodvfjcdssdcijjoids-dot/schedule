# ShiftWise — Store Scheduling for Managers

ShiftWise is an advanced, zero-dependency scheduling app for retail store
managers. Define the coverage your store needs, describe each employee's
availability and constraints, and let the auto-scheduler build the week —
then fine-tune by hand with full conflict checking.

## Running it

No build step and no dependencies. Either:

- open `index.html` directly in a browser, or
- serve the folder: `npm run serve` (or `python3 -m http.server 8080`) and
  visit http://localhost:8080

The app seeds itself with a realistic demo store (9 employees, 4 shift
patterns) on first launch so you can try auto-scheduling immediately.
All data is stored in the browser's `localStorage`; use **Settings → Data**
to export/import JSON backups, reload the sample data, or reset.

## Features

### Employees
- Create, edit, and delete employees (deleting also removes their shifts).
- Per-employee needs, all honored by the auto-scheduler:
  - weekly **availability** — an on/off toggle plus a time window per weekday
  - **time off** — date ranges with optional notes
  - **min/max hours per week** and **max days per week**
  - **preferred shift time** (morning / evening / any)
  - role (Manager, Keyholder, Associate — roles are editable in Settings),
    hourly wage, and a display color

### Shifts (coverage requirements)
- Shift templates such as *Opening 7:30a–3:30p, every day, needs 2 people,
  incl. 1 Manager* — with per-shift days, headcount, and role requirements.

### Auto-scheduling
- One click fills the week using a greedy constraint solver that always
  handles the most-constrained slot first (fewest eligible employees).
- **Hard constraints** (never violated): availability windows, time off,
  role requirements, no overlapping shifts, max hours/week, max days/week,
  max consecutive work days, and minimum rest between shifts (blocks
  "clopening").
- **Soft scoring** picks the best candidate per slot: balances everyone
  toward their target hours, strongly favors people under their minimum,
  matches morning/evening preferences, spreads weekend load, avoids split
  shifts, and can optionally bias toward lower labor cost.
- Two modes: **fill open slots** (keeps everything already scheduled) or
  **rebuild the week** (replaces unlocked auto-scheduled shifts).
- Slots that cannot be filled are reported with the reasons
  (e.g. "3 not available that day · 1 at max weekly hours").

### Manual control
- Click any open slot to assign someone — the picker shows who is eligible
  and explains exactly why others are blocked (with an override if you
  insist; the violation then shows up in Reports).
- Add one-off **custom shifts** with arbitrary times.
- **Lock** any shift (click it) so auto-schedule and *Clear week* keep it.

### Validation & reports
- Continuous validation of the visible week: understaffed shifts, unmet
  role requirements, availability/time-off conflicts, double bookings,
  over-max hours, overtime, under-min hours, consecutive-day and rest
  violations.
- Weekly report: hours, days, overtime, and estimated labor cost per
  employee (overtime costed at 1.5×), coverage per shift, and the full
  issue list.

### Sharing
- **Export CSV** of the week (opens in Excel/Sheets) and a print-friendly
  layout via the **Print** button.

### Settings
- Store name, week start day (Mon/Sun), currency symbol.
- Scheduling rules: overtime threshold, minimum rest hours, max consecutive
  days, default cost-optimization.
- Manage roles; full JSON backup/restore.

## Architecture

Plain HTML/CSS/JS, no framework, no build:

```
index.html              entry point (script load order matters)
css/styles.css          all styling incl. print styles
js/utils.js             date/time helpers (browser + Node)
js/scheduler.js         auto-scheduling engine + week validation (pure, browser + Node)
js/store.js             state, localStorage persistence, CRUD, sample data
js/ui/components.js     modal, confirm, toast, event binding, downloads
js/ui/*View.js          one module per tab (schedule, employees, shifts, reports, settings)
js/app.js               shell: tabs, week navigation, render loop
tests/scheduler.test.js engine tests (node:test)
```

The scheduling engine is pure and framework-free, so it runs under Node for
testing exactly as it runs in the browser.

## Tests

```
npm test
```

16 tests cover the engine: constraint enforcement (availability, time off,
hours/days caps, rest, consecutive days, roles, overlaps), fill vs rebuild
semantics, lock handling, fairness and cost-bias behavior, and week
validation.

## Notes & limitations

- Shifts live within a single day (up to a 24:00 end); overnight shifts that
  cross midnight are not supported.
- Data is per-browser. Use JSON export to move between machines.
