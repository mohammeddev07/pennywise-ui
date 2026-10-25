/** Shared client limits and display mappings; API style values are keys, never hex. */
export const BOOK_NAME_MAX = 80;
export const BOOK_LIMIT = 10;
export const BOOK_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "INR",
  "CHF",
  "CNY",
  "HKD",
  "SGD",
  "NZD",
  "MXN",
  "BRL",
  "KRW",
  "AED",
  "SAR",
  "KWD",
] as const;
export const BOOK_ICONS = {
  book: "book-outline",
  briefcase: "briefcase-outline",
  airplane: "airplane-outline",
  home: "home-outline",
  car: "car-outline",
  heart: "heart-outline",
  family: "people-outline",
  education: "school-outline",
  cart: "cart-outline",
} as const;
export const BOOK_COLORS = {
  green: "#16A34A",
  purple: "#8B5CF6",
  orange: "#F06F15",
  blue: "#3B82F6",
  red: "#EF4444",
  pink: "#E46BAA",
} as const;
export type BookIcon = keyof typeof BOOK_ICONS;
export type BookColor = keyof typeof BOOK_COLORS;
export const DEFAULT_BOOK_ICON: BookIcon = "book";
export const DEFAULT_BOOK_COLOR: BookColor = "green";
export const isBookIcon = (value: unknown): value is BookIcon =>
  typeof value === "string" && Object.hasOwn(BOOK_ICONS, value);
export const isBookColor = (value: unknown): value is BookColor =>
  typeof value === "string" && Object.hasOwn(BOOK_COLORS, value);
export function bookStyle(icon?: string, color?: string) {
  if (
    __DEV__ &&
    ((icon !== undefined && !isBookIcon(icon)) ||
      (color !== undefined && !isBookColor(color)))
  ) {
    console.warn("Unknown book style; using display defaults.");
  }
  return {
    icon: BOOK_ICONS[isBookIcon(icon) ? icon : DEFAULT_BOOK_ICON],
    color: BOOK_COLORS[isBookColor(color) ? color : DEFAULT_BOOK_COLOR],
  };
}
export function validateBookName(value: string) {
  const name = value.trim();
  if (!name || name.length > BOOK_NAME_MAX)
    throw new Error(
      `Enter a book name between 1 and ${BOOK_NAME_MAX} characters.`,
    );
  return name;
}
