import { currencyMinorUnitDigits, parseAmountToMinor } from "@/shared/utils/formatCurrency";
import { addDaysYmd, formatYmd, todayInTimeZone } from "@/shared/utils/ledgerDate";

/**
 * Keypad / keyboard edit of the draft's raw amount string ("12.5", never grouped). A key the
 * parser would reject (too many fraction digits, a decimal in JPY, past the backend cap) is a no-op.
 */
export function applyAmountKey(prev: string, key: string, currency: string): string {
  const curr = prev || "0";
  if (key === "back") return curr.length <= 1 ? "0" : curr.slice(0, -1);
  if (key === ".") return currencyMinorUnitDigits(currency) > 0 && !curr.includes(".") ? `${curr}.` : curr;
  if (!/^\d$/.test(key)) return curr;
  const next = curr === "0" ? key : curr + key;
  return parseAmountToMinor(next, currency) === null ? curr : next;
}

/** The hero figure split for display: grouped integer digits, then the typed fraction and its unfilled slots. */
export function amountParts(raw: string, currency: string) {
  const [int = "0", frac] = (raw || "0").split(".");
  const digits = currencyMinorUnitDigits(currency);
  let symbol = currency;
  let decimal = ".";
  try {
    symbol =
      new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency;
    decimal = new Intl.NumberFormat().formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
  } catch {
    // Unknown currency code: show the code itself.
  }
  return {
    symbol,
    int: new Intl.NumberFormat().format(Number(int)),
    decimal,
    frac: frac ?? null,
    pad: frac === undefined ? 0 : Math.max(0, digits - frac.length),
  };
}

function safeZone(timeZone?: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

function wall(t: number, timeZone?: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: safeZone(timeZone),
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** An instant as the book-local values a native `<input type="date">` and `<input type="time">` show. */
export function toZonedInputs(iso: string, timeZone?: string) {
  const t = Date.parse(iso);
  return wall(Number.isNaN(t) ? Date.now() : t, timeZone);
}

/** Book-local date + time back to an ISO instant (DST-safe: the zone offset is re-read at the result). */
export function fromZonedInputs(date: string, time: string, timeZone?: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const h = /^(\d{2}):(\d{2})/.exec(time);
  if (!d || !h) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]);
  const offset = (t: number) => {
    const w = wall(t, timeZone);
    const [y, m, day] = w.date.split("-").map(Number);
    const [hh, mm] = w.time.split(":").map(Number);
    return Date.UTC(y, m - 1, day, hh, mm) - (t - (((t % 60_000) + 60_000) % 60_000));
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** "Today, 3:42 PM" in the book's zone, for the success receipt. */
export function whenLabel(iso: string, timeZone?: string) {
  const zone = safeZone(timeZone);
  const { date } = toZonedInputs(iso, zone);
  const today = todayInTimeZone(zone);
  const day =
    date === today ? "Today" : date === addDaysYmd(today, -1) ? "Yesterday" : formatYmd(date, date.slice(0, 4) !== today.slice(0, 4));
  const clock = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return `${day}, ${clock}`;
}
