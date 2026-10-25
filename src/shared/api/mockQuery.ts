/**
 * Mock implementation of the P1.2 search / P1.3 analyze semantics, so mock mode and
 * the tests exercise the real filter contract (nulls, description, literal text,
 * sort tie-breakers, dense zero buckets) instead of a look-alike.
 */
import type { CategoryResponse, TransactionResponse } from "@/shared/types/api";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BucketTotal,
  CategoryBucketCell,
  CategoryTotal,
  FilterCondition,
  FilterNode,
  SearchRequest,
  SearchResponse,
  SortKey,
} from "@/shared/types/transactionQuery";
import { FIELD_CAPABILITIES, QUERY_LIMITS } from "@/shared/types/transactionQuery";
import {
  addDaysYmd,
  addMonthsYmd,
  compareYmd,
  endOfMonthYmd,
  parseYmd,
  startOfMonthYmd,
  type Ymd,
} from "@/shared/utils/ledgerDate";

export class MockQueryError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

type Row = TransactionResponse;

function fieldValue(row: Row, field: string): string | number | null {
  switch (field) {
    case "categoryName":
      return row.category?.name ?? row.categoryName ?? null;
    case "occurredAt":
      return row.occurredAt ?? null;
    default:
      return ((row as unknown as Record<string, unknown>)[field] as string | number | null | undefined) ?? null;
  }
}

function cmp(a: string | number, b: string | number, kind: string) {
  if (kind === "TIMESTAMP") return Date.parse(String(a)) - Date.parse(String(b));
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function textMatch(op: string, hay: string, needle: string) {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  switch (op) {
    case "EQ":
      return h === n;
    case "CONTAINS":
      return h.includes(n);
    case "STARTS_WITH":
      return h.startsWith(n);
    case "ENDS_WITH":
      return h.endsWith(n);
    default:
      return false;
  }
}

function evalCondition(row: Row, c: FilterCondition): boolean {
  const meta = FIELD_CAPABILITIES[c.field];
  if (!meta) throw new MockQueryError(400, "VALIDATION_ERROR", `Unknown field: ${c.field}`);
  if (!(meta.operators as readonly string[]).includes(c.operator)) {
    throw new MockQueryError(400, "VALIDATION_ERROR", `${c.operator} is not supported for ${c.field}`);
  }

  if (c.field === "description") {
    const title = String(row.title ?? "");
    const note = String(row.note ?? "");
    const v = String(c.value);
    if (c.operator === "NE") return !(title.toLowerCase() === v.toLowerCase() || note.toLowerCase() === v.toLowerCase());
    if (c.operator === "NOT_CONTAINS") return !(textMatch("CONTAINS", title, v) || textMatch("CONTAINS", note, v));
    return textMatch(c.operator, title, v) || textMatch(c.operator, note, v);
  }

  const actual = fieldValue(row, c.field);
  if (c.operator === "IS_NULL") return actual === null;
  if (c.operator === "IS_NOT_NULL") return actual !== null;
  // A comparison against a value never matches a null column - NE, NOT_IN and NOT_CONTAINS included.
  if (actual === null) return false;

  const v = c.value as string | number | Array<string | number>;
  switch (c.operator) {
    case "IN":
      return (v as Array<string | number>).some((x) => cmp(actual, x, meta.kind) === 0);
    case "NOT_IN":
      return !(v as Array<string | number>).some((x) => cmp(actual, x, meta.kind) === 0);
    case "BETWEEN": {
      const [lo, hi] = v as [string | number, string | number];
      return cmp(actual, lo, meta.kind) >= 0 && cmp(actual, hi, meta.kind) <= 0;
    }
    case "EQ":
    case "NE":
    case "GT":
    case "GTE":
    case "LT":
    case "LTE": {
      if (meta.kind === "TEXT") {
        const eq = textMatch("EQ", String(actual), String(v));
        return c.operator === "EQ" ? eq : !eq;
      }
      const d = cmp(actual, v as string | number, meta.kind);
      return c.operator === "EQ" ? d === 0 : c.operator === "NE" ? d !== 0 : c.operator === "GT" ? d > 0 : c.operator === "GTE" ? d >= 0 : c.operator === "LT" ? d < 0 : d <= 0;
    }
    case "CONTAINS":
    case "STARTS_WITH":
    case "ENDS_WITH":
      return textMatch(c.operator, String(actual), String(v));
    case "NOT_CONTAINS":
      return !textMatch("CONTAINS", String(actual), String(v));
  }
  return false;
}

export function evalFilter(row: Row, node: FilterNode | undefined): boolean {
  if (!node) return true;
  if (node.kind === "condition") return evalCondition(row, node);
  if (node.children.length === 0) return node.op === "AND";
  return node.op === "AND" ? node.children.every((c) => evalFilter(row, c)) : node.children.some((c) => evalFilter(row, c));
}

function conditionCount(node: FilterNode | undefined): number {
  if (!node) return 0;
  return node.kind === "condition" ? 1 : node.children.reduce((n, c) => n + conditionCount(c), 0);
}

function validate(filter: FilterNode | undefined, sort: SortKey[] | undefined) {
  if (conditionCount(filter) > QUERY_LIMITS.maxConditions) {
    throw new MockQueryError(400, "VALIDATION_ERROR", `At most ${QUERY_LIMITS.maxConditions} conditions are allowed.`);
  }
  if ((sort?.length ?? 0) > QUERY_LIMITS.maxSortKeys) {
    throw new MockQueryError(400, "VALIDATION_ERROR", `At most ${QUERY_LIMITS.maxSortKeys} sort keys are allowed.`);
  }
}

const DEFAULT_SORT: SortKey[] = [
  { field: "occurredOn", direction: "DESC" },
  { field: "createdAt", direction: "DESC" },
  { field: "id", direction: "DESC" },
];

function sortValue(row: Row, field: string): string | number | null {
  if (field === "description") return `${String(row.title ?? "").toLowerCase()}\u0000${String(row.note ?? "").toLowerCase()}`;
  const v = fieldValue(row, field);
  return typeof v === "string" && FIELD_CAPABILITIES[field as keyof typeof FIELD_CAPABILITIES]?.kind === "TEXT" ? v.toLowerCase() : v;
}

export function sortRows(rows: Row[], sort: SortKey[] | undefined): Row[] {
  const keys = sort && sort.length > 0 ? [...sort] : [...DEFAULT_SORT];
  if (!keys.some((k) => k.field === "id")) keys.push({ field: "id", direction: "ASC" });
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const av = sortValue(a, key.field);
      const bv = sortValue(b, key.field);
      // NULLS LAST in both directions.
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      const kind = FIELD_CAPABILITIES[key.field]?.kind ?? "TEXT";
      const d = cmp(av, bv, kind);
      if (d !== 0) return key.direction === "ASC" ? d : -d;
    }
    return 0;
  });
}

function fingerprint(filter: FilterNode | undefined, sort: SortKey[] | undefined) {
  // Not a real SHA-256: only has to change when the query changes.
  const text = JSON.stringify([filter ?? null, sort ?? []]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `mock-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export function mockSearch(rows: Row[], body: SearchRequest): SearchResponse {
  validate(body.filter, body.sort);
  const offset = body.page?.offset ?? 0;
  const limit = body.page?.limit ?? QUERY_LIMITS.defaultLimit;
  if (limit < 1 || limit > QUERY_LIMITS.maxLimit) throw new MockQueryError(400, "VALIDATION_ERROR", "page.limit must be 1-200");
  if (offset > QUERY_LIMITS.maxOffset) {
    throw new MockQueryError(400, "PAGE_OFFSET_LIMIT_EXCEEDED", "Offset too large - narrow the filter or change the sort.");
  }
  const matched = sortRows(rows.filter((r) => evalFilter(r, body.filter)), body.sort);
  const items = matched.slice(offset, offset + limit);
  return {
    items,
    totalCount: matched.length,
    page: { offset, limit, hasMore: offset + items.length < matched.length },
    queryFingerprint: fingerprint(body.filter, body.sort),
  };
}

// ---------------------------------------------------------------- export

export const MOCK_EXPORT_HEADER = "id,type,amountMinor,occurredOn,categoryId,paymentMethod,createdAt";

/**
 * Every row matching the filter, in the requested order, as CSV. The real endpoint returns XLSX;
 * the mock only has to prove the *rows* (ids, order, amounts) are the search's, so tests can check
 * them without an XLSX parser. Never used by the app UI (`exportQueryToDevice` refuses in mock mode).
 */
export function mockExportCsv(rows: Row[], body: SearchRequest): string {
  validate(body.filter, body.sort);
  const matched = sortRows(rows.filter((r) => evalFilter(r, body.filter)), body.sort);
  return [
    MOCK_EXPORT_HEADER,
    ...matched.map((r) => [r.id, r.type, r.amountMinor, r.occurredOn, r.categoryId, r.paymentMethod ?? "", r.createdAt].join(",")),
  ].join("\n");
}

// ---------------------------------------------------------------- analyze

function bucketKeyOf(date: Ymd, bucket: AnalyzeRequest["bucket"]) {
  return bucket === "DAY" ? date : bucket === "MONTH" ? date.slice(0, 7) : date.slice(0, 4);
}

function buildBuckets(window: { startDate: Ymd; endDate: Ymd }, bucket: AnalyzeRequest["bucket"]) {
  const out: Array<{ key: string; start: Ymd; end: Ymd; partial: boolean }> = [];
  let cursor = window.startDate;
  while (compareYmd(cursor, window.endDate) <= 0) {
    let periodStart: Ymd;
    let periodEnd: Ymd;
    if (bucket === "DAY") {
      periodStart = periodEnd = cursor;
    } else if (bucket === "MONTH") {
      periodStart = startOfMonthYmd(cursor);
      periodEnd = endOfMonthYmd(cursor);
    } else {
      const p = parseYmd(cursor)!;
      periodStart = `${String(p.y).padStart(4, "0")}-01-01`;
      periodEnd = `${String(p.y).padStart(4, "0")}-12-31`;
    }
    const start = compareYmd(periodStart, window.startDate) < 0 ? window.startDate : periodStart;
    const end = compareYmd(periodEnd, window.endDate) > 0 ? window.endDate : periodEnd;
    out.push({ key: bucketKeyOf(cursor, bucket), start, end, partial: start !== periodStart || end !== periodEnd });
    cursor = addDaysYmd(periodEnd, 1);
  }
  return out;
}

export function mockAnalyze(
  rows: Row[],
  categories: CategoryResponse[],
  body: AnalyzeRequest,
  book: { id: string; currencyCode: string },
  budgets: Array<{ categoryId: string; categoryName: string; amountMinor: number; month: string }>
): AnalyzeResponse {
  validate(body.filter, undefined);
  const { startDate, endDate } = body.window ?? ({} as AnalyzeRequest["window"]);
  if (!startDate || !endDate || !parseYmd(startDate) || !parseYmd(endDate) || compareYmd(startDate, endDate) > 0) {
    throw new MockQueryError(400, "VALIDATION_ERROR", "window must be a valid inclusive date range.");
  }
  if (compareYmd(endDate, addMonthsYmd(startDate, 12 * QUERY_LIMITS.maxAnalysisWindowYears)) > 0) {
    throw new MockQueryError(400, "VALIDATION_ERROR", "window must not exceed 5 years.");
  }

  const windowCondition: FilterCondition = { kind: "condition", field: "occurredOn", operator: "BETWEEN", value: [startDate, endDate] };
  const effectiveFilter: FilterNode =
    body.filter && body.filter.kind === "group" && body.filter.op === "AND"
      ? { ...body.filter, children: [...body.filter.children, windowCondition] }
      : body.filter
        ? { kind: "group", op: "AND", children: [body.filter, windowCondition] }
        : { kind: "group", op: "AND", children: [windowCondition] };

  const matched = rows.filter((r) => evalFilter(r, effectiveFilter));
  let income = 0;
  let expense = 0;
  const cats = new Map<string, CategoryTotal>();
  const buckets = buildBuckets({ startDate, endDate }, body.bucket);
  const bucketTotals = new Map<string, BucketTotal>(
    buckets.map((b) => [b.key, { ...b, incomeTotalMinor: 0, expenseTotalMinor: 0, netMinor: 0, count: 0 }])
  );
  const cells = new Map<string, CategoryBucketCell>();

  for (const t of matched) {
    if (t.type === "INCOME") income += t.amountMinor;
    else expense += t.amountMinor;
    const catKey = `${t.categoryId}|${t.type}`;
    const cat = cats.get(catKey);
    if (cat) {
      cat.totalMinor += t.amountMinor;
      cat.count += 1;
    } else {
      const c = categories.find((x) => x.id === t.categoryId);
      cats.set(catKey, {
        categoryId: t.categoryId,
        categoryName: c?.name ?? t.category?.name ?? t.categoryName ?? "Unknown",
        type: t.type,
        totalMinor: t.amountMinor,
        count: 1,
        percentOfExpense: null,
      });
    }
    const bt = bucketTotals.get(bucketKeyOf(t.occurredOn, body.bucket))!;
    if (t.type === "INCOME") bt.incomeTotalMinor += t.amountMinor;
    else bt.expenseTotalMinor += t.amountMinor;
    bt.netMinor = bt.incomeTotalMinor - bt.expenseTotalMinor;
    bt.count += 1;
  }

  const categoriesOut = [...cats.values()]
    .map((c) => ({
      ...c,
      percentOfExpense: c.type === "EXPENSE" && expense > 0 ? Math.round((c.totalMinor / expense) * 10000) / 100 : null,
    }))
    .sort(
      (a, b) =>
        (a.type === b.type ? 0 : a.type === "EXPENSE" ? -1 : 1) ||
        b.totalMinor - a.totalMinor ||
        a.categoryName.localeCompare(b.categoryName) ||
        a.categoryId.localeCompare(b.categoryId)
    );

  if (categoriesOut.length * buckets.length > QUERY_LIMITS.maxCategoryBucketCells) {
    throw new MockQueryError(422, "ANALYSIS_TOO_LARGE", "Too many category/period cells - use a coarser bucket or a shorter window.");
  }
  for (const c of categoriesOut) {
    for (const b of buckets) cells.set(`${c.categoryId}|${c.type}|${b.key}`, { categoryId: c.categoryId, type: c.type, bucketKey: b.key, totalMinor: 0, count: 0 });
  }
  for (const t of matched) {
    const cell = cells.get(`${t.categoryId}|${t.type}|${bucketKeyOf(t.occurredOn, body.bucket)}`);
    if (cell) {
      cell.totalMinor += t.amountMinor;
      cell.count += 1;
    }
  }

  const largest = matched
    .filter((t) => t.type === "EXPENSE")
    .sort((a, b) => b.amountMinor - a.amountMinor || compareYmd(b.occurredOn, a.occurredOn) || (a.createdAt < b.createdAt ? 1 : -1) || a.id.localeCompare(b.id))[0];

  const wholeMonth = startDate === startOfMonthYmd(startDate) && endDate === endOfMonthYmd(startDate);
  const month = startDate.slice(0, 7);

  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    bucket: body.bucket,
    window: { startDate, endDate },
    effectiveFilter,
    queryFingerprint: fingerprint(effectiveFilter, undefined),
    matchedCount: matched.length,
    incomeTotalMinor: income,
    expenseTotalMinor: expense,
    netMinor: income - expense,
    categories: categoriesOut,
    buckets: [...bucketTotals.values()],
    categoryBuckets: [...cells.values()],
    largestExpense: largest ?? null,
    monthlyBudgets: wholeMonth
      ? {
          month,
          label: "Full-month targets, not adjusted for the current filter",
          items: budgets.filter((b) => b.month === month).map((b) => ({ categoryId: b.categoryId, categoryName: b.categoryName, amountMinor: b.amountMinor })),
        }
      : null,
  };
}
