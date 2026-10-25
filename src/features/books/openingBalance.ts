import { currencyMinorUnitDigits } from "@/shared/utils/formatCurrency";
/** Exact signed decimal conversion. Never rounds and never multiplies a float. */
export function parseOpeningBalance(
  raw: string,
  currency: string,
): number | null {
  const text = raw.trim();
  if (!text) return 0;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const [, sign, integer, fraction = ""] = match;
  const digits = currencyMinorUnitDigits(currency);
  if (fraction.length > digits) return null;
  const minor = (integer + fraction.padEnd(digits, "0")).replace(
    /^0+(?=\d)/,
    "",
  );
  const max = String(Number.MAX_SAFE_INTEGER);
  if (minor.length > max.length || (minor.length === max.length && minor > max))
    return null;
  const amount = Number(minor);
  return amount === 0 ? 0 : sign === "-" ? -amount : amount;
}
