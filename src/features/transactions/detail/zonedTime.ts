/** Wall-clock date and time of an instant in the book's time zone (the inverse of filterModel's `zonedToIso`). */
export function zonedParts(iso: string, timeZone: string): { ymd: string; hhmm: string } {
  const d = new Date(iso);
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(safe);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(safe);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, hhmm: `${get("hour")}:${get("minute")}` };
}

/** "Mar 5, 2026 at 3:04 PM" style text for an instant, in the book's time zone. */
export function formatInZone(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an unknown time";
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  }
}
