import { BOOK_COLORS, bookStyle, validateBookName } from "../constants";
import {
  beginBookOperation,
  endBookOperation,
  resetBookOperations,
  hasBookOperation,
} from "../operations";
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
it.each(Object.entries(BOOK_COLORS))(
  "%s meets white glyph and dark background contrast",
  (_key, hex) => {
    expect(contrast(hex, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contrast(hex, "#0B0D0F")).toBeGreaterThanOrEqual(3);
  },
);
it("keeps a visible selected ring", () =>
  expect(contrast("#00C805", "#0B0D0F")).toBeGreaterThan(8.5));
it("falls back only for display and warns for unknown styles", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const input = { icon: "unknown", color: "unknown" };
  expect(bookStyle(input.icon, input.color)).toEqual(
    bookStyle("book", "green"),
  );
  expect(input).toEqual({ icon: "unknown", color: "unknown" });
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
it("trims names, accepts eighty characters, and rejects blank and eighty-one", () => {
  expect(validateBookName(" x ")).toBe("x");
  expect(validateBookName("x".repeat(80))).toHaveLength(80);
  expect(() => validateBookName("x".repeat(81))).toThrow();
  expect(() => validateBookName(" \n ")).toThrow();
});
it("logout clears operation locks and late completion cannot release a new operation", () => {
  const old = beginBookOperation();
  resetBookOperations();
  expect(hasBookOperation()).toBe(false);
  const next = beginBookOperation();
  endBookOperation(old);
  expect(hasBookOperation()).toBe(true);
  endBookOperation(next);
  expect(hasBookOperation()).toBe(false);
});
