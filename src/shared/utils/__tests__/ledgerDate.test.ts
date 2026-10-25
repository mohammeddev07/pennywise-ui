import {
  addDaysYmd,
  addMonthsYmd,
  endOfMonthYmd,
  isValidYmd,
  localDateToYmd,
  todayInTimeZone,
  ymdToLocalDate,
} from "../ledgerDate";

describe("ledger dates are calendar days, not instants", () => {
  it("does its calendar maths without shifting days", () => {
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysYmd("2024-02-28", 1)).toBe("2024-02-29");
    expect(addMonthsYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsYmd("2026-12-15", 1)).toBe("2027-01-15");
    expect(endOfMonthYmd("2026-02-10")).toBe("2026-02-28");
    expect(isValidYmd("2026-02-31")).toBe(false);
    expect(isValidYmd("2026-2-3")).toBe(false);
  });

  it("a picker Date maps to the day the user sees, in any device zone (TZ=Asia/Tokyo here)", () => {
    // Local 00:30 on 20 Mar is still 19 Mar in UTC. A toISOString().slice(0, 10) shortcut gets this wrong.
    const early = new Date(2026, 2, 20, 0, 30);
    expect(early.toISOString().slice(0, 10)).toBe("2026-03-19");
    expect(localDateToYmd(early)).toBe("2026-03-20");
    expect(localDateToYmd(ymdToLocalDate("2026-03-20"))).toBe("2026-03-20");
  });

  it("'today' is the book's calendar day, which differs from UTC's near midnight", () => {
    const instant = new Date("2026-03-15T23:30:00Z");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-03-15");
    expect(todayInTimeZone("Asia/Tokyo", instant)).toBe("2026-03-16");
    expect(todayInTimeZone("Pacific/Honolulu", instant)).toBe("2026-03-15");
    expect(todayInTimeZone("Not/AZone", instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
