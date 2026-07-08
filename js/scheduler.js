/* ShiftWise — auto-scheduling engine and week validation.
 * Pure functions, no DOM. Works in browser (App.scheduler) and Node (module.exports). */
(function (global) {
  'use strict';

  const U = (typeof module !== 'undefined' && module.exports)
    ? require('./utils.js')
    : global.App.utils;

  const REASON_LABELS = {
    role: 'missing role/skill',
    timeoff: 'time off',
    unavailable: 'not available that day',
    window: 'availability window too short',
    overlap: 'already scheduled then',
    maxhours: 'at max weekly hours',
    maxdays: 'at max days per week',
    consecutive: 'too many consecutive days',
    rest: 'not enough rest between shifts'
  };

  function settingsOf(state) {
    const s = (state && state.settings) || {};
    return {
      overtimeThreshold: s.overtimeThreshold == null ? 40 : s.overtimeThreshold,
      minRestHours: s.minRestHours == null ? 10 : s.minRestHours,
      maxConsecutiveDays: s.maxConsecutiveDays == null ? 6 : s.maxConsecutiveDays,
      optimizeCost: !!s.optimizeCost,
      weeklyLaborBudget: +s.weeklyLaborBudget || 0,
      defaultBreakMinutes: +s.defaultBreakMinutes || 0,
      breakAfterHours: +s.breakAfterHours || 0
    };
  }

  function durationMinutes(start, end) {
    const s = U.parseTime(start), e = U.parseTime(end);
    return e >= s ? e - s : (1440 - s) + e;
  }

  function paidMinutesFor(start, end, settings) {
    const mins = durationMinutes(start, end);
    const S = settings || {};
    const breakAfter = (+S.breakAfterHours || 0) * 60;
    const breakMins = +S.defaultBreakMinutes || 0;
    return Math.max(0, mins - (breakAfter > 0 && mins >= breakAfter ? breakMins : 0));
  }

  function assignmentHours(a, settings) {
    return paidMinutesFor(a.start, a.end, settings) / 60;
  }

  function isOnTimeOff(emp, dateKey) {
    return (emp.timeOff || []).some(t => t.start <= dateKey && dateKey <= t.end);
  }

  /** The employee's availability window for that date, or null if unavailable. */
  function availabilityFor(emp, dateKey) {
    const av = (emp.availability || [])[U.weekdayOfKey(dateKey)];
    return av && av.on ? av : null;
  }

  function dayAssignments(schedule, empId, dateKey) {
    return (schedule[dateKey] || []).filter(a => a.employeeId === empId);
  }

  /** Total scheduled hours for an employee within the given dateKeys. */
  function weekHours(schedule, empId, dateKeys, settings) {
    let h = 0;
    for (const dk of dateKeys) {
      for (const a of dayAssignments(schedule, empId, dk)) h += assignmentHours(a, settings);
    }
    return h;
  }

  /** Distinct days the employee works within the given dateKeys. */
  function daysWorked(schedule, empId, dateKeys) {
    let n = 0;
    for (const dk of dateKeys) if (dayAssignments(schedule, empId, dk).length) n++;
    return n;
  }

  /** Length of the consecutive-worked-days run if the employee works dateKey.
   * Looks beyond the current week using the full schedule. */
  function consecutiveRun(schedule, empId, dateKey) {
    let run = 1;
    let d = U.addDays(U.keyToDate(dateKey), -1);
    while (dayAssignments(schedule, empId, U.dateToKey(d)).length) { run++; d = U.addDays(d, -1); }
    d = U.addDays(U.keyToDate(dateKey), 1);
    while (dayAssignments(schedule, empId, U.dateToKey(d)).length) { run++; d = U.addDays(d, 1); }
    return run;
  }

  /** Rest (in minutes) violation against adjacent-day shifts, or null. */
  function restViolation(schedule, empId, dateKey, startMin, endMin, minRestMins) {
    const prevKey = U.dateToKey(U.addDays(U.keyToDate(dateKey), -1));
    const nextKey = U.dateToKey(U.addDays(U.keyToDate(dateKey), 1));
    for (const a of dayAssignments(schedule, empId, prevKey)) {
      const rest = (1440 - U.parseTime(a.end)) + startMin;
      if (rest < minRestMins) return { adjacent: 'previous', rest };
    }
    for (const a of dayAssignments(schedule, empId, nextKey)) {
      const rest = (1440 - endMin) + U.parseTime(a.start);
      if (rest < minRestMins) return { adjacent: 'next', rest };
    }
    return null;
  }

  /**
   * Hard-constraint check for assigning `emp` to `slot`
   * ({dateKey, startMin, endMin, role|null}) given the working `schedule`.
   * Returns null if assignable, else {code, msg}.
   */
  function assessCandidate(state, schedule, dateKeys, emp, slot) {
    const S = settingsOf(state);
    if (slot.role && emp.role !== slot.role && !(emp.skills || []).includes(slot.role)) {
      return { code: 'role', msg: 'requires ' + slot.role + ' role or skill' };
    }
    if (isOnTimeOff(emp, slot.dateKey)) {
      return { code: 'timeoff', msg: 'on time off' };
    }
    const av = availabilityFor(emp, slot.dateKey);
    if (!av) {
      return { code: 'unavailable', msg: 'not available this day' };
    }
    if (!slot.overnight && (U.parseTime(av.start) > slot.startMin || U.parseTime(av.end) < slot.endMin)) {
      return { code: 'window', msg: 'only available ' + U.fmtRange(av.start, av.end) };
    }
    for (const a of dayAssignments(schedule, emp.id, slot.dateKey)) {
      if (!slot.overnight && U.parseTime(a.start) < slot.endMin && slot.startMin < U.parseTime(a.end)) {
        return { code: 'overlap', msg: 'already scheduled ' + U.fmtRange(a.start, a.end) };
      }
    }
    const slotHours = paidMinutesFor(slot.start, slot.end, state.settings) / 60;
    const maxH = emp.maxHours == null ? 168 : emp.maxHours;
    if (weekHours(schedule, emp.id, dateKeys, state.settings) + slotHours > maxH + 1e-9) {
      return { code: 'maxhours', msg: 'would exceed max ' + maxH + 'h/week' };
    }
    const worksToday = dayAssignments(schedule, emp.id, slot.dateKey).length > 0;
    const maxDays = emp.maxDaysPerWeek || 7;
    if (!worksToday && daysWorked(schedule, emp.id, dateKeys) >= maxDays) {
      return { code: 'maxdays', msg: 'at max ' + maxDays + ' days/week' };
    }
    if (S.maxConsecutiveDays > 0 && !worksToday &&
        consecutiveRun(schedule, emp.id, slot.dateKey) > S.maxConsecutiveDays) {
      return { code: 'consecutive', msg: 'over ' + S.maxConsecutiveDays + ' consecutive days' };
    }
    if (S.minRestHours > 0 &&
        restViolation(schedule, emp.id, slot.dateKey, slot.startMin, slot.endMin, S.minRestHours * 60)) {
      return { code: 'rest', msg: 'under ' + S.minRestHours + 'h rest from adjacent shift' };
    }
    return null;
  }

  /** Soft score — higher is better. Used to pick among eligible candidates. */
  function scoreCandidate(state, schedule, dateKeys, emp, slot, opts) {
    const slotHours = paidMinutesFor(slot.start, slot.end, state.settings) / 60;
    const cur = weekHours(schedule, emp.id, dateKeys, state.settings);
    const minH = emp.minHours || 0;
    const maxH = emp.maxHours == null ? 40 : emp.maxHours;
    const target = Math.max(minH, (minH + maxH) / 2);

    let s = (target - cur) * 3;                       // fairness: fill toward target hours
    if (cur < minH) s += (minH - cur) * 4;            // strong pull for anyone under min hours

    const mid = (slot.startMin + slot.endMin) / 2;    // shift-time preference
    const pref = (emp.prefs && emp.prefs.shift) || 'any';
    if (pref === 'morning') s += mid < 12 * 60 ? 15 : -10;
    if (pref === 'evening') s += mid >= 15 * 60 ? 15 : -10;

    const wd = U.weekdayOfKey(slot.dateKey);          // spread weekend load
    if (wd === 0 || wd === 6) {
      let wkndDays = 0;
      for (const dk of dateKeys) {
        const w = U.weekdayOfKey(dk);
        if ((w === 0 || w === 6) && dayAssignments(schedule, emp.id, dk).length) wkndDays++;
      }
      s -= wkndDays * 8;
    }

    if (dayAssignments(schedule, emp.id, slot.dateKey).length) s -= 25; // avoid split shifts

    if (opts.optimizeCost) s -= (emp.wage || 0) * slotHours * 0.75;
    return s;
  }

  /**
   * Expand shift templates into open slots for the week, subtracting
   * assignments already on the schedule (they count toward coverage,
   * including role requirements).
   */
  function expandSlots(state, schedule, dateKeys) {
    const empById = new Map(state.employees.map(e => [e.id, e]));
    const slots = [];
    for (const dk of dateKeys) {
      const wd = U.weekdayOfKey(dk);
      for (const t of state.shiftTemplates) {
        if (!(t.days || []).includes(wd)) continue;
        const existing = (schedule[dk] || []).filter(a => a.templateId === t.id);
        const demand = (t.demand && t.demand[wd] != null) ? +t.demand[wd] : (t.required || 1);
        const remaining = demand - existing.length;
        if (remaining <= 0) continue;

        const roleSlots = [];
        for (const [role, count] of Object.entries(t.roleRequirements || {})) {
          if (!count) continue;
          const have = existing.filter(a => {
            const e = empById.get(a.employeeId);
            return e && (e.role === role || (e.skills || []).includes(role));
          }).length;
          for (let i = 0; i < Math.max(0, count - have); i++) roleSlots.push(role);
        }
        while (roleSlots.length > remaining) roleSlots.pop();

        const base = {
          dateKey: dk, templateId: t.id, templateName: t.name,
          start: t.start, end: t.end,
          startMin: U.parseTime(t.start), endMin: U.parseTime(t.end),
          overnight: U.parseTime(t.end) <= U.parseTime(t.start)
        };
        for (const role of roleSlots) slots.push(Object.assign({}, base, { role }));
        for (let i = 0; i < remaining - roleSlots.length; i++) {
          slots.push(Object.assign({}, base, { role: null }));
        }
      }
    }
    return slots;
  }

  /**
   * Greedy constraint solver: repeatedly assigns the most-constrained open
   * slot (fewest eligible employees) to its best-scoring candidate.
   *
   * opts.mode: 'fill' keeps every current assignment and only fills gaps;
   *            'rebuild' first drops unlocked template assignments in the week.
   * opts.optimizeCost: bias candidate choice toward lower wages.
   *
   * Returns {schedule, created, unfilled, removedCount} — `schedule` is a new
   * object; the input state is not mutated.
   */
  function autoSchedule(state, dateKeys, opts) {
    opts = opts || {};
    const optimizeCost = opts.optimizeCost != null ? !!opts.optimizeCost : settingsOf(state).optimizeCost;

    const schedule = {};
    for (const k of Object.keys(state.schedule || {})) schedule[k] = state.schedule[k].slice();

    let removedCount = 0;
    if (opts.mode === 'rebuild') {
      for (const dk of dateKeys) {
        const before = (schedule[dk] || []).length;
        schedule[dk] = (schedule[dk] || []).filter(a => a.locked || !a.templateId);
        removedCount += before - schedule[dk].length;
      }
    }

    let slots = expandSlots(state, schedule, dateKeys);
    const created = [];
    const unfilled = [];

    while (slots.length) {
      const evals = slots.map(slot => {
        const cands = [];
        const reasons = {};
        for (const emp of state.employees) {
          const block = assessCandidate(state, schedule, dateKeys, emp, slot);
          if (block) reasons[block.code] = (reasons[block.code] || 0) + 1;
          else cands.push(emp);
        }
        return { slot, cands, reasons };
      });
      evals.sort((a, b) =>
        a.cands.length - b.cands.length ||
        a.slot.dateKey.localeCompare(b.slot.dateKey) ||
        a.slot.startMin - b.slot.startMin);

      const ev = evals[0];
      slots = evals.slice(1).map(e => e.slot);

      if (!ev.cands.length) {
        unfilled.push({
          dateKey: ev.slot.dateKey, templateName: ev.slot.templateName,
          start: ev.slot.start, end: ev.slot.end, role: ev.slot.role,
          reasons: ev.reasons
        });
        continue;
      }

      const scored = ev.cands.map(emp => ({
        emp,
        score: scoreCandidate(state, schedule, dateKeys, emp, ev.slot, { optimizeCost }),
        hours: weekHours(schedule, emp.id, dateKeys, state.settings)
      }));
      scored.sort((a, b) =>
        b.score - a.score || a.hours - b.hours || a.emp.name.localeCompare(b.emp.name));

      const emp = scored[0].emp;
      const assignment = {
        id: U.uid('a'), dateKey: ev.slot.dateKey, employeeId: emp.id,
        templateId: ev.slot.templateId, start: ev.slot.start, end: ev.slot.end,
        locked: false
      };
      (schedule[ev.slot.dateKey] = schedule[ev.slot.dateKey] || []).push(assignment);
      created.push(assignment);
    }

    return { schedule, created, unfilled, removedCount };
  }

  /** "3 not available that day · 1 at max weekly hours" */
  function describeReasons(reasons) {
    return Object.entries(reasons || {})
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => n + ' ' + (REASON_LABELS[code] || code))
      .join(' · ') || 'no employees';
  }

  /**
   * Validate the week's schedule against constraints and coverage.
   * Returns [{severity: 'error'|'warn', type, message, dateKey?, employeeId?}].
   */
  function validateWeek(state, dateKeys) {
    const S = settingsOf(state);
    const schedule = state.schedule || {};
    const empById = new Map(state.employees.map(e => [e.id, e]));
    const issues = [];

    for (const dk of dateKeys) {
      const list = schedule[dk] || [];
      for (const a of list) {
        const emp = empById.get(a.employeeId);
        const when = U.shortDate(U.keyToDate(dk));
        if (!emp) {
          issues.push({ severity: 'error', type: 'orphan', dateKey: dk,
            message: 'A shift on ' + when + ' is assigned to a deleted employee.' });
          continue;
        }
        if (isOnTimeOff(emp, dk)) {
          issues.push({ severity: 'error', type: 'timeoff', dateKey: dk, employeeId: emp.id,
            message: emp.name + ' is scheduled on ' + when + ' but has time off.' });
        }
        const av = availabilityFor(emp, dk);
        if (!av) {
          issues.push({ severity: 'error', type: 'unavailable', dateKey: dk, employeeId: emp.id,
            message: emp.name + ' is scheduled on ' + when + ' but is not available that day.' });
        } else if (U.parseTime(av.start) > U.parseTime(a.start) || U.parseTime(av.end) < U.parseTime(a.end)) {
          issues.push({ severity: 'error', type: 'window', dateKey: dk, employeeId: emp.id,
            message: emp.name + ' works ' + U.fmtRange(a.start, a.end) + ' on ' + when +
              ' but is only available ' + U.fmtRange(av.start, av.end) + '.' });
        }
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.employeeId !== b.employeeId) continue;
          if (U.parseTime(a.start) < U.parseTime(b.end) && U.parseTime(b.start) < U.parseTime(a.end)) {
            const emp = empById.get(a.employeeId);
            issues.push({ severity: 'error', type: 'overlap', dateKey: dk, employeeId: a.employeeId,
              message: (emp ? emp.name : 'An employee') + ' has overlapping shifts on ' +
                U.shortDate(U.keyToDate(dk)) + '.' });
          }
        }
      }
    }

    for (const emp of state.employees) {
      const hours = weekHours(schedule, emp.id, dateKeys, state.settings);
      if (emp.maxHours != null && hours > emp.maxHours + 1e-9) {
        issues.push({ severity: 'error', type: 'max-hours', employeeId: emp.id,
          message: emp.name + ' is scheduled ' + U.round2(hours) + 'h, above their max of ' + emp.maxHours + 'h.' });
      } else if (hours > S.overtimeThreshold + 1e-9) {
        issues.push({ severity: 'warn', type: 'overtime', employeeId: emp.id,
          message: emp.name + ' is at ' + U.round2(hours) + 'h — overtime past ' + S.overtimeThreshold + 'h.' });
      }
      if (hours > 0 && (emp.minHours || 0) > 0 && hours < emp.minHours - 1e-9) {
        issues.push({ severity: 'warn', type: 'min-hours', employeeId: emp.id,
          message: emp.name + ' has only ' + U.round2(hours) + 'h of a requested minimum ' + emp.minHours + 'h.' });
      }

      if (S.maxConsecutiveDays > 0) {
        let flagged = false;
        for (const dk of dateKeys) {
          if (!flagged && dayAssignments(schedule, emp.id, dk).length &&
              consecutiveRun(schedule, emp.id, dk) > S.maxConsecutiveDays) {
            issues.push({ severity: 'warn', type: 'consecutive', employeeId: emp.id,
              message: emp.name + ' works more than ' + S.maxConsecutiveDays + ' days in a row.' });
            flagged = true;
          }
        }
      }
      if (S.minRestHours > 0) {
        for (const dk of dateKeys) {
          const prevKey = U.dateToKey(U.addDays(U.keyToDate(dk), -1));
          for (const a of dayAssignments(schedule, emp.id, dk)) {
            for (const p of dayAssignments(schedule, emp.id, prevKey)) {
              const rest = (1440 - U.parseTime(p.end)) + U.parseTime(a.start);
              if (rest < S.minRestHours * 60) {
                issues.push({ severity: 'warn', type: 'rest', employeeId: emp.id, dateKey: dk,
                  message: emp.name + ' has under ' + S.minRestHours + 'h rest before their ' +
                    U.shortDate(U.keyToDate(dk)) + ' shift.' });
              }
            }
          }
        }
      }
    }

    for (const dk of dateKeys) {
      const wd = U.weekdayOfKey(dk);
      const when = U.shortDate(U.keyToDate(dk));
      for (const t of state.shiftTemplates) {
        if (!(t.days || []).includes(wd)) continue;
        const assigned = (schedule[dk] || []).filter(a => a.templateId === t.id);
        if (assigned.length < (t.required || 1)) {
          issues.push({ severity: 'error', type: 'understaffed', dateKey: dk,
            message: t.name + ' on ' + when + ' has ' + assigned.length + ' of ' + (t.required || 1) + ' required.' });
        }
        for (const [role, count] of Object.entries(t.roleRequirements || {})) {
          if (!count) continue;
          const have = assigned.filter(a => {
            const e = empById.get(a.employeeId);
            return e && (e.role === role || (e.skills || []).includes(role));
          }).length;
          if (have < count) {
            issues.push({ severity: 'error', type: 'role-unmet', dateKey: dk,
              message: t.name + ' on ' + when + ' needs ' + count + ' ' + role + (count > 1 ? 's' : '') +
                ' (' + have + ' assigned).' });
          }
        }
      }
    }

    if (S.weeklyLaborBudget > 0) {
      let cost = 0;
      for (const emp of state.employees) {
        const hours = weekHours(schedule, emp.id, dateKeys, state.settings);
        const ot = Math.max(0, hours - S.overtimeThreshold);
        cost += (hours - ot) * (emp.wage || 0) + ot * (emp.wage || 0) * 1.5;
      }
      if (cost > S.weeklyLaborBudget + 1e-9) {
        issues.push({ severity: 'warn', type: 'budget',
          message: 'Projected labor cost is above the weekly budget (' + U.round2(cost) + ' vs ' + U.round2(S.weeklyLaborBudget) + ').' });
      }
    }

    const order = { error: 0, warn: 1 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);
    return issues;
  }

  const Scheduler = {
    REASON_LABELS,
    settingsOf,
    durationMinutes,
    paidMinutesFor,
    assignmentHours,
    isOnTimeOff,
    availabilityFor,
    weekHours,
    daysWorked,
    consecutiveRun,
    assessCandidate,
    expandSlots,
    autoSchedule,
    describeReasons,
    validateWeek
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scheduler;
  } else {
    global.App = global.App || {};
    global.App.scheduler = Scheduler;
  }
})(typeof window !== 'undefined' ? window : globalThis);
