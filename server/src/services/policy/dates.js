// Deterministic date math for the policy engine. All reasoning is anchored to
// the ticket's created_at as "now" — this module never reads the wall clock.
//
// The business runs in India (IST). India observes no DST, so IST is a FIXED
// +05:30 offset; that lets us do all calendar math with plain UTC arithmetic
// and a constant offset, with no timezone database and fully reproducible
// results (the policy tests run with the system clock set to 2031).

const IST_OFFSET_MIN = 330; // +05:30
const IST_OFFSET_MS = IST_OFFSET_MIN * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Parse an ISO string (or pass through a Date) into an absolute instant.
// Date-only strings (e.g. "2026-07-01") are anchored to IST midnight, so a
// return-window date means that calendar day in India, not UTC.
export function parseISO(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('invalid Date');
    return new Date(value.getTime());
  }
  if (typeof value !== 'string') throw new Error(`cannot parse date: ${value}`);

  let date;
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    date = new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
  } else {
    date = new Date(value); // handles explicit offsets and Z
  }
  if (Number.isNaN(date.getTime())) throw new Error(`invalid ISO date: ${value}`);
  return date;
}

// IST wall-clock components of an instant.
function istParts(value) {
  const date = parseISO(value);
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    mm: shifted.getUTCMinutes(),
    ss: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
  };
}

// Day of week in IST: 0 = Sunday … 6 = Saturday.
export function istDayOfWeek(value) {
  return new Date(parseISO(value).getTime() + IST_OFFSET_MS).getUTCDay();
}

// Start / end of the IST calendar day containing `value`.
export function startOfDay(value) {
  const { y, mo, d } = istParts(value);
  return new Date(Date.UTC(y, mo, d) - IST_OFFSET_MS);
}

export function endOfDay(value) {
  const { y, mo, d } = istParts(value);
  return new Date(Date.UTC(y, mo, d, 23, 59, 59, 999) - IST_OFFSET_MS);
}

// Signed whole-calendar-day difference (b - a), counted by IST date.
export function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

// Add n calendar months, preserving the IST time-of-day and clamping the day to
// the target month's length (e.g. Jan 31 + 1mo → Feb 28/29).
export function addMonths(value, n) {
  const { y, mo, d, hh, mm, ss, ms } = istParts(value);
  const total = mo + n;
  const ny = y + Math.floor(total / 12);
  const nmo = ((total % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(ny, nmo + 1, 0)).getUTCDate();
  const nd = Math.min(d, daysInMonth);
  return new Date(Date.UTC(ny, nmo, nd, hh, mm, ss, ms) - IST_OFFSET_MS);
}

// Count business days (Mon–Fri) strictly after `a` up to and including `b`.
// Signed: negative when b precedes a.
export function businessDaysBetween(a, b) {
  let start = startOfDay(a);
  let end = startOfDay(b);
  let sign = 1;
  if (end.getTime() < start.getTime()) {
    [start, end] = [end, start];
    sign = -1;
  }
  let count = 0;
  for (let t = start.getTime() + DAY_MS; t <= end.getTime(); t += DAY_MS) {
    const dow = new Date(t + IST_OFFSET_MS).getUTCDay();
    if (dow >= 1 && dow <= 5) count += 1;
  }
  return sign * count;
}

// Advance `value` by n business days (n ≥ 0), landing at IST midnight.
// n = 0 returns the start of the given day.
export function addBusinessDays(value, n) {
  let cur = startOfDay(value);
  let added = 0;
  while (added < n) {
    cur = new Date(cur.getTime() + DAY_MS);
    const dow = new Date(cur.getTime() + IST_OFFSET_MS).getUTCDay();
    if (dow >= 1 && dow <= 5) added += 1;
  }
  return cur;
}

export const constants = { IST_OFFSET_MIN, IST_OFFSET_MS, DAY_MS };
