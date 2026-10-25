import { nextSort } from "../sortModel";

describe("table header sort", () => {
  it("a new column starts at its natural direction with date as tie-breaker", () => {
    expect(nextSort([], "amountMinor", "DESC")).toEqual([
      { field: "amountMinor", direction: "DESC" },
      { field: "occurredOn", direction: "DESC" },
    ]);
    expect(nextSort([], "title", "ASC")[0]).toEqual({ field: "title", direction: "ASC" });
  });

  it("the same column flips; the default (empty) sort counts as date descending", () => {
    expect(nextSort([{ field: "amountMinor", direction: "DESC" }], "amountMinor", "DESC")[0].direction).toBe("ASC");
    expect(nextSort([], "occurredOn", "DESC")).toEqual([{ field: "occurredOn", direction: "ASC" }]);
  });
});
