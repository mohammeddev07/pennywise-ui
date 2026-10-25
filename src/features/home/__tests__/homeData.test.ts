import type { MonthlySummaryResponse } from "@/shared/types/api";
import type { Budget } from "@/shared/types/models";
import type { AnalyzeResponse } from "@/shared/types/transactionQuery";
import { budgetItems, greeting, topSpending, weekSpend } from "../homeData";

const cat = (id: string, type: "INCOME" | "EXPENSE", totalMinor: number, budgetMinor?: number) => ({
  categoryId: id,
  categoryName: id,
  type,
  totalMinor,
  budgetMinor,
  transactionCount: 1,
});
const summary = (byCategory: MonthlySummaryResponse["byCategory"]) =>
  ({ bookId: "b", month: "2026-10", currencyCode: "USD", incomeTotalMinor: 0, expenseTotalMinor: 0, byCategory }) as MonthlySummaryResponse;

describe("home data shaping", () => {
  it("greets by time of day", () => {
    expect([greeting(6), greeting(13), greeting(21)]).toEqual(["Good morning", "Good afternoon", "Good evening"]);
  });

  it("fills a dense 7-day week, missing days as real zeros", () => {
    const analysis = { buckets: [{ key: "2026-10-21", expenseTotalMinor: 500 }] } as unknown as AnalyzeResponse;
    const days = weekSpend(analysis, "2026-10-19");
    expect(days.map((d) => d.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(days.map((d) => d.value)).toEqual([0, 0, 500, 0, 0, 0, 0]);
    expect(days[0].label).toBe("Mon");
  });

  it("ranks expense categories and shares over every category", () => {
    const s = summary([cat("a", "EXPENSE", 100), cat("b", "EXPENSE", 300), cat("c", "INCOME", 900), cat("d", "EXPENSE", 0), cat("e", "EXPENSE", 50)]);
    const top = topSpending(s, 2);
    expect(top.rows.map((r) => r.categoryId)).toEqual(["b", "a"]);
    expect(top.total).toBe(450);
  });

  it("orders budgets by how used they are, falling back to the store", () => {
    const s = summary([cat("a", "EXPENSE", 50, 100), cat("b", "EXPENSE", 90, 100), cat("c", "EXPENSE", 10)]);
    expect(budgetItems(s, [], "b1", "2026-10").map((i) => i.categoryId)).toEqual(["b", "a"]);

    const stored = [
      { bookId: "b1", month: "2026-10", categoryId: "x", categoryName: "x", amountMinor: 100, spentMinor: 120 },
      { bookId: "b1", month: "2026-09", categoryId: "y", categoryName: "y", amountMinor: 100, spentMinor: 10 },
    ] as Budget[];
    expect(budgetItems(summary([]), stored, "b1", "2026-10").map((i) => i.categoryId)).toEqual(["x"]);
  });
});
