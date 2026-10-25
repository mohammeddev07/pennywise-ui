import { applyAmountKey, fromZonedInputs, toZonedInputs } from "../draftHelpers";

const type = (keys: string[], currency = "USD") => keys.reduce((a, k) => applyAmountKey(a, k, currency), "0");

describe("applyAmountKey", () => {
  it("builds decimals and caps fraction digits", () => {
    expect(type(["1", "2", ".", "5", "0", "9"])).toBe("12.50");
    expect(type(["0", "0", "."])).toBe("0.");
    expect(type(["7", "back", "back"])).toBe("0");
  });
  it("refuses a decimal for zero-minor-digit currencies", () => {
    expect(type(["5", ".", "5"], "JPY")).toBe("55");
  });
  it("stops at the backend amount cap", () => {
    expect(type(Array(20).fill("9")).length).toBe(13);
  });
});

describe("zoned inputs", () => {
  it("round-trips across zones and DST", () => {
    for (const zone of ["America/New_York", "Asia/Tokyo", "Asia/Kolkata", "UTC"]) {
      for (const iso of ["2026-03-08T07:30:00.000Z", "2026-11-01T05:45:00.000Z", "2026-07-15T23:59:00.000Z"]) {
        const { date, time } = toZonedInputs(iso, zone);
        expect(fromZonedInputs(date, time, zone)).toBe(iso);
      }
    }
  });
  it("reads book-local wall time", () => {
    expect(toZonedInputs("2026-01-01T03:00:00.000Z", "America/New_York")).toEqual({ date: "2025-12-31", time: "22:00" });
  });
});
