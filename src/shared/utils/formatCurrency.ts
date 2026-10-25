import type { CurrencyCode } from "@/shared/types/models";

export type CurrencyInput = CurrencyCode | string;

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
};

export function currencySymbol(currency: CurrencyInput) {
  return SYMBOLS[currency] ?? currency;
}

export function currencyMinorUnitDigits(currency: CurrencyInput) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return currency === "JPY" ? 0 : 2;
  }
}

export function minorToMajor(amountMinor: number, currency: CurrencyInput) {
  return amountMinor / 10 ** currencyMinorUnitDigits(currency);
}

export function majorToMinor(amount: number, currency: CurrencyInput) {
  return Math.round(amount * 10 ** currencyMinorUnitDigits(currency));
}

/**
 * Numeric bounds shared with the backend (`domain/common/MoneyLimits.java`).
 * Amounts are integer minor units in a Java `long`; a JS `number` is only exact
 * up to 2^53 - 1, so a single transaction is capped well below that and any
 * aggregate the server reports stays within the safe-integer range.
 */
export const MAX_TRANSACTION_AMOUNT_MINOR = 999_999_999_999_999;
export const MAX_AGGREGATE_AMOUNT_MINOR = Number.MAX_SAFE_INTEGER;

/**
 * Exact decimal-string to minor-units conversion for user input.
 *
 * Returns `null` (never 0, never a rounded value) when the text is not a plain
 * non-negative decimal, has more fraction digits than the currency allows (JPY
 * allows none), or exceeds `MAX_TRANSACTION_AMOUNT_MINOR`. Thousands separators
 * and surrounding whitespace are tolerated; everything else is rejected.
 */
export function parseAmountToMinor(raw: string, currency: CurrencyInput): number | null {
  const text = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (text === "") return null;
  const digits = currencyMinorUnitDigits(currency);
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const [, intPart, fracPart = ""] = match;
  if (fracPart.length > digits) return null;
  const minorText = intPart + fracPart.padEnd(digits, "0");
  if (minorText.replace(/^0+(?=\d)/, "").length > 15) return null;
  const minor = Number(minorText);
  if (!Number.isSafeInteger(minor) || minor > MAX_TRANSACTION_AMOUNT_MINOR) return null;
  return minor;
}

export function formatCurrency(amountMinor: number, currency: CurrencyInput, maximumFractionDigits?: number) {
  const amount = minorToMajor(amountMinor, currency);
  const displayDigits = maximumFractionDigits ?? currencyMinorUnitDigits(currency);

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: displayDigits,
      maximumFractionDigits: displayDigits,
    }).format(amount);
  } catch {
    // Fallback (very simple)
    const sign = amount < 0 ? "-" : "";
    const abs = Math.abs(amount).toFixed(displayDigits);
    return `${sign}${currency} ${abs}`;
  }
}

export function formatSignedCurrency(amountMinor: number, currency: CurrencyInput, maximumFractionDigits?: number) {
  const formatted = formatCurrency(Math.abs(amountMinor), currency, maximumFractionDigits);
  if (amountMinor === 0) return formatted;
  return `${amountMinor > 0 ? "+" : "-"}${formatted}`;
}

/**
 * The number half of a currency figure - grouped and rounded exactly as
 * `formatCurrency` would, but with no symbol and no currency code.
 *
 * `HeroAmount` renders the symbol itself, at half size in the tertiary color,
 * so the digits and the symbol are two separate text nodes. That is the one
 * split the type system allows inside a single figure.
 */
export function formatCurrencyDigits(
  amountMinor: number,
  currency: CurrencyInput,
  maximumFractionDigits?: number
) {
  const amount = minorToMajor(amountMinor, currency);
  const displayDigits = maximumFractionDigits ?? currencyMinorUnitDigits(currency);

  try {
    return new Intl.NumberFormat(undefined, {
      style: "decimal",
      minimumFractionDigits: displayDigits,
      maximumFractionDigits: displayDigits,
    }).format(amount);
  } catch {
    return Math.abs(amount).toFixed(displayDigits);
  }
}
