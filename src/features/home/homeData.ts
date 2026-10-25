import type { MonthlySummaryResponse } from "@/shared/types/api";
import type { Budget } from "@/shared/types/models";
import type { AnalyzeResponse } from "@/shared/types/transactionQuery";
import { addDaysYmd, formatYmd, ymdToLocalDate, type Ymd } from "@/shared/utils/ledgerDate";

export function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** Device-local YYYY-MM, the same month key mobile and `invalidateTransactionData` use. */
export function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type DayPoint = { day: Ymd; label: string; longLabel: string; value: number };

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** Seven dense days of spending. A day the server returned no bucket for is a real 0, never skipped. */
export function weekSpend(analysis: AnalyzeResponse | undefined, start: Ymd): DayPoint[] {
  const byDay = new Map((analysis?.buckets ?? []).map((b) => [b.key, b.expenseTotalMinor]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDaysYmd(start, i);
    const label = WEEKDAY.format(ymdToLocalDate(day));
    return { day, label, longLabel: `${label}, ${formatYmd(day, false)}`, value: byDay.get(day) ?? 0 };
  });
}

/** Expense categories of the month, biggest first; `total` is over every category so shares add up. */
export function topSpending(summary: MonthlySummaryResponse | undefined, limit = 4) {
  const rows = (summary?.byCategory ?? [])
    .filter((c) => c.type === "EXPENSE" && c.totalMinor > 0)
    .sort((a, b) => b.totalMinor - a.totalMinor);
  return { rows: rows.slice(0, limit), total: rows.reduce((sum, r) => sum + r.totalMinor, 0) };
}

export type BudgetItem = { categoryId: string; categoryName: string; spentMinor: number; budgetMinor: number };

/** Budgets closest to (or past) their limit first. The summary wins; the budgets store is the fallback, as on mobile. */
export function budgetItems(
  summary: MonthlySummaryResponse | undefined,
  budgets: Budget[],
  bookId: string,
  month: string
): BudgetItem[] {
  const fromSummary = (summary?.byCategory ?? [])
    .filter((c) => c.type === "EXPENSE" && (c.budgetMinor ?? 0) > 0)
    .map((c) => ({ categoryId: c.categoryId, categoryName: c.categoryName, budgetMinor: c.budgetMinor ?? 0, spentMinor: c.totalMinor }));
  const items =
    fromSummary.length > 0
      ? fromSummary
      : budgets
          .filter((b) => b.bookId === bookId && b.month === month)
          .map((b) => ({ categoryId: b.categoryId, categoryName: b.categoryName, budgetMinor: b.amountMinor, spentMinor: b.spentMinor }));
  const ratio = (i: BudgetItem) => i.spentMinor / Math.max(1, i.budgetMinor);
  return items.sort((a, b) => ratio(b) - ratio(a));
}
