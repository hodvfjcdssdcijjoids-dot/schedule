/* ShiftWise — shared utilities (works in browser and Node) */
(function (global) {
  'use strict';

  let uidCounter = 0;
  function uid(prefix) {
    uidCounter = (uidCounter + 1) % 1679616;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      uidCounter.toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** "HH:MM" -> minutes since midnight (accepts "24:00"). Returns null if invalid. */
  function parseTime(str) {
    if (typeof str !== 'string') return null;
    const m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
    return h * 60 + min;
  }

  /** minutes since midnight -> "HH:MM" */
  function formatTime(mins) {
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }

  /** minutes since midnight -> compact 12h form: "7a", "7:30p", "12p" */
  function formatTimeShort(mins) {
    if (mins >= 1440) mins -= 1440;
    const h = Math.floor(mins / 60), m = mins % 60;
    const suffix = h < 12 ? 'a' : 'p';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (m ? ':' + pad2(m) : '') + suffix;
  }

  /** "HH:MM","HH:MM" -> "7a–3:30p" */
  function fmtRange(start, end) {
    return formatTimeShort(parseTime(start)) + '–' + formatTimeShort(parseTime(end));
  }

  /** Date -> "YYYY-MM-DD" (local time) */
  function dateToKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** "YYYY-MM-DD" -> Date (local midnight) */
  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  /** Start of the week containing `date`. weekStartsOn: 0 = Sunday, 1 = Monday. */
  function startOfWeek(date, weekStartsOn) {
    const ws = weekStartsOn === 0 ? 0 : 1;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = (d.getDay() - ws + 7) % 7;
    return addDays(d, -diff);
  }

  /** 7 Date objects starting at `start`. */
  function weekDates(start) {
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function weekdayOfKey(key) { return keyToDate(key).getDay(); }

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Date -> "Mon 7/6" */
  function shortDate(d) {
    return DAY_ABBR[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  /** "Jul 6 – Jul 12, 2026" */
  function weekLabel(dates) {
    const a = dates[0], b = dates[6];
    const left = MONTH_ABBR[a.getMonth()] + ' ' + a.getDate();
    const right = (a.getMonth() === b.getMonth() ? '' : MONTH_ABBR[b.getMonth()] + ' ') + b.getDate() + ', ' + b.getFullYear();
    return left + ' – ' + right;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  const utils = {
    uid, pad2, parseTime, formatTime, formatTimeShort, fmtRange,
    dateToKey, keyToDate, addDays, startOfWeek, weekDates, weekdayOfKey,
    DAY_NAMES, DAY_ABBR, MONTH_ABBR, shortDate, weekLabel,
    escapeHtml, clamp, round2, deepClone
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
  } else {
    global.App = global.App || {};
    global.App.utils = utils;
  }
})(typeof window !== 'undefined' ? window : globalThis);
