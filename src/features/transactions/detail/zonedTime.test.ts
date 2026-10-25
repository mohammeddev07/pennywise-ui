import { zonedToIso } from "../filterModel";
import { zonedParts } from "./zonedTime";

it("reads an instant back as the book's wall clock, the inverse of zonedToIso", () => {
  const iso = zonedToIso("2026-03-08", "02:30", "America/New_York", false); // the DST gap rolls forward
  expect(zonedParts(zonedToIso("2026-01-15", "23:45", "Asia/Tokyo", false), "Asia/Tokyo")).toEqual({ ymd: "2026-01-15", hhmm: "23:45" });
  expect(zonedParts("2026-01-15T14:45:00Z", "Asia/Tokyo")).toEqual({ ymd: "2026-01-15", hhmm: "23:45" });
  expect(zonedParts("2026-01-15T14:45:00Z", "America/Los_Angeles")).toEqual({ ymd: "2026-01-15", hhmm: "06:45" });
  expect(zonedParts(iso, "America/New_York").ymd).toBe("2026-03-08");
});
