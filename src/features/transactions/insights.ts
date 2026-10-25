import type { AnalyzeResponse, Bucket, CategoryTotal, TransactionType } from "@/shared/types/transactionQuery";
import {
  addMonthsYmd,
  endOfMonthYmd,
  parseYmd,
  startOfMonthYmd,
  type Ymd,
} from "@/shared/utils/ledgerDate";

/** Insights buckets. DAY exists on the API but is not an Insights view. */
export type InsightsBucket = Extract<Bucket, "MONTH" | "YEAR">;

/**
 * The explicit analysis window: whole calendar periods, so nothing is partial unless the server says
 * so. MONTH = the last 12 months, YEAR = the last 4 calendar years (both inside the 5-year API limit).
 * Insights does not follow Activity's date chip - it shares every *other* predicate - so this is
 * always shown on screen.
 */
export function insightsWindow(bucket: InsightsBucket, today: Ymd): { startDate: Ymd; endDate: Ymd } {
  if (bucket === "MONTH") {
    return { startDate: startOfMonthYmd(addMonthsYmd(today, -11)), endDate: endOfMonthYmd(today) };
  }
  const year = parseYmd(today)!.y;
  return { startDate: `${String(year - 3).padStart(4, "0")}-01-01`, endDate: `${String(year).padStart(4, "0")}-12-31` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-03` -> "Mar" (axis) / "Mar 2026" (tooltip, table); `2026` -> "2026". */
export function bucketLabel(key: string, long = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const month = MONTHS[Number(m[2]) - 1] ?? key;
  return long ? `${month} ${m[1]}` : month;
}

/** Expense/income categories separately, biggest first, ties by name then id so the order is stable. */
export function categoryRows(analysis: AnalyzeResponse, type: TransactionType): CategoryTotal[] {
  return analysis.categories
    .filter((c) => c.type === type)
    .sort((a, b) => b.totalMinor - a.totalMinor || a.categoryName.localeCompare(b.categoryName) || a.categoryId.localeCompare(b.categoryId));
}

export type SeriesPoint = {
  key: string;
  label: string;
  longLabel: string;
  start: Ymd;
  end: Ymd;
  partial: boolean;
  valueMinor: number;
  count: number;
};

/**
 * One series over the analysis buckets: every expense (or income) together, or a single category.
 * Values come straight from the server's dense bucket / category-by-bucket cells - a period with no
 * matching rows is a real 0, never an interpolated point.
 */
export function series(analysis: AnalyzeResponse, type: TransactionType, categoryId: string | null): SeriesPoint[] {
  const byBucket = new Map<string, { total: number; count: number }>();
  for (const cell of analysis.categoryBuckets) {
    if (cell.type !== type || (categoryId && cell.categoryId !== categoryId)) continue;
    const cur = byBucket.get(cell.bucketKey) ?? { total: 0, count: 0 };
    cur.total += cell.totalMinor;
    cur.count += cell.count;
    byBucket.set(cell.bucketKey, cur);
  }
  return analysis.buckets.map((b) => {
    const cells = byBucket.get(b.key) ?? { total: 0, count: 0 };
    return {
      key: b.key,
      label: bucketLabel(b.key),
      longLabel: bucketLabel(b.key, true),
      start: b.start,
      end: b.end,
      partial: b.partial,
      // "All" uses the bucket's own type total; the cells only add the per-type count.
      valueMinor: categoryId ? cells.total : type === "EXPENSE" ? b.expenseTotalMinor : b.incomeTotalMinor,
      count: cells.count,
    };
  });
}
