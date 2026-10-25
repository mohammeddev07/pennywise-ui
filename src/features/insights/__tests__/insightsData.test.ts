import type { CategoryTotal } from "@/shared/types/transactionQuery";
import { donutSlices, OTHER_ID, sliceIdFor } from "../insightsData";

const row = (id: string, totalMinor: number): CategoryTotal => ({
  categoryId: id,
  categoryName: id.toUpperCase(),
  type: "EXPENSE",
  totalMinor,
  count: 1,
  percentOfExpense: null,
});

describe("donut slices", () => {
  const colors: Record<string, string> = { a: "#111111", b: "#222222" };
  const colorOf = (id: string) => colors[id] ?? "#999999";

  it("keeps the top categories in their own color and folds the tail into Other", () => {
    const rows = [row("a", 500), row("b", 300), row("c", 100), row("d", 60), row("z", 0)];
    const slices = donutSlices(rows, colorOf, 2);
    expect(slices.map((s) => [s.id, s.value])).toEqual([["a", 500], ["b", 300], [OTHER_ID, 160]]);
    expect(slices[1].color).toBe("#222222");
    expect(sliceIdFor(slices, "b")).toBe("b");
    expect(sliceIdFor(slices, "d")).toBe(OTHER_ID);
  });

  it("has no Other slice when everything fits", () => {
    expect(donutSlices([row("a", 1), row("b", 0)], colorOf).map((s) => s.id)).toEqual(["a"]);
  });
});
