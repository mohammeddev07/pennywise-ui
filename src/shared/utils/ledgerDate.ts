/**
 * Ledger dates are book-local calendar days, written `YYYY-MM-DD`. They are
 * plain calendar values - never instants - so nothing here goes through
 * `toISOString()` / UTC slicing, which shifts the day for anyone west or east of
 * UTC. `Date.UTC` is used only as a calendar calculator (its fields are read back
 * with the UTC getters), never to reinterpret a device-local moment.
 */

export type Ymd = string;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = YMD.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  // Rejects 2026-02-31 and friends instead of rolling them into March.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isValidYmd(value: string) {
  return parseYmd(value) !== null;
}

function pad(n: number, width = 2) {
  return String(n).padStart(width, "0");
}

export function makeYmd(y: number, m: number, d: number): Ymd {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function addDaysYmd(value: Ymd, days: number): Ymd {
  const p = parseYmd(value);
  if (!p) throw new Error(`Invalid ledger date: ${value}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return makeYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Adds calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsYmd(value: Ymd, months: number): Ymd {
  const p = parseYmd(value);
  if (!p) throw new Error(`Invalid ledger date: ${value}`);
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return makeYmd(y, m, Math.min(p.d, daysInMonth(y, m)));
}

export function startOfMonthYmd(value: Ymd): Ymd {
  const p = parseYmd(value);
  if (!p) throw new Error(`Invalid ledger date: ${value}`);
  return makeYmd(p.y, p.m, 1);
}

export function endOfMonthYmd(value: Ymd): Ymd {
  const p = parseYmd(value);
  if (!p) throw new Error(`Invalid ledger date: ${value}`);
  return makeYmd(p.y, p.m, daysInMonth(p.y, p.m));
}

export function monthKeyOf(value: Ymd) {
  return value.slice(0, 7); // a YYYY-MM prefix of a calendar date, not of an instant
}

export function compareYmd(a: Ymd, b: Ymd) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Calendar days from `a` to `b` (b - a). */
export function diffDaysYmd(a: Ymd, b: Ymd) {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  if (!pa || !pb) throw new Error("Invalid ledger date");
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** The calendar day it currently is in `timeZone` (an IANA name), falling back to the device zone. */
export function todayInTimeZone(timeZone?: string | null, now: Date = new Date()): Ymd {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const value = `${get("year")}-${get("month")}-${get("day")}`;
    if (isValidYmd(value)) return value;
  } catch {
    // Unknown zone: fall through to the device's calendar.
  }
  return localDateToYmd(now);
}

/** A picker's device-local `Date` to the calendar day the user actually sees. */
export function localDateToYmd(date: Date): Ymd {
  return makeYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** A calendar day to a device-local `Date` (noon, so DST edges cannot roll it). */
export function ymdToLocalDate(value: Ymd): Date {
  const p = parseYmd(value);
  if (!p) return new Date();
  return new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `Mar 5, 2026` - formatted from the calendar fields, so no time zone is involved. */
export function formatYmd(value: Ymd, withYear = true) {
  const p = parseYmd(value);
  if (!p) return value;
  return withYear ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : `${MONTHS[p.m - 1]} ${p.d}`;
}

export function formatMonthYmd(value: Ymd) {
  const p = parseYmd(value);
  if (!p) return value;
  return `${MONTHS_LONG[p.m - 1]} ${p.y}`;
}
