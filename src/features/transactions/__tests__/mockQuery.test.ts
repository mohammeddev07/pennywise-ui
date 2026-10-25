import { mockBackend } from "@/shared/api/mockAdapter";
import { mockAnalyze, mockSearch } from "@/shared/api/mockQuery";
import type { FilterNode, SortKey } from "@/shared/types/transactionQuery";

const bookId = mockBackend.state.books[0].id;
const cat = mockBackend.state.categories.find((c) => c.type === "EXPENSE")!;

const row = (id: string, over: Record<string, unknown>) => ({
  id, bookId, type: "EXPENSE", amountMinor: 100, occurredOn: "2026-03-10", occurredAt: "2026-03-10T12:00:00Z", title: null, categoryId: cat.id,
  category: { id: cat.id, name: cat.name, type: "EXPENSE" }, paymentMethod: null, note: null, externalId: null,
  createdAt: "2026-03-10T12:00:00Z", updatedAt: "2026-03-10T12:00:00Z", deletedAt: null, version: 1, ...over,
}) as never;

const cond = (field: string, operator: string, value?: unknown): FilterNode => ({ kind: "condition", field, operator, value } as never);
const and = (...children: FilterNode[]): FilterNode => ({ kind: "group", op: "AND", children });
const or = (...children: FilterNode[]): FilterNode => ({ kind: "group", op: "OR", children });
const ids = (rows: unknown[], filter?: FilterNode, sort?: SortKey[]) => mockSearch(rows as never, { filter, sort }).items.map((i) => i.id);

// The mock mirrors the documented server semantics, so tests against it mean something.
describe("mock backend mirrors the P1.2 contract", () => {
  const rows = [
    row("card", { paymentMethod: "CARD", title: "Coffee", note: "beans" }),
    row("none", { paymentMethod: null, title: null, note: null }),
    row("cash", { paymentMethod: "CASH", title: "100% cotton_shirt", note: "50\\off" }),
  ];

  it("non-null comparisons exclude nulls, including NE; OR with IS_NULL brings them back", () => {
    expect(ids(rows, cond("paymentMethod", "NE", "CARD"))).toEqual(["cash"]);
    expect(ids(rows, or(cond("paymentMethod", "NE", "CARD"), cond("paymentMethod", "IS_NULL")))).toEqual(expect.arrayContaining(["cash", "none"]));
    expect(ids(rows, cond("paymentMethod", "IS_NULL"))).toEqual(["none"]);
  });

  it("description is title OR note; its negation includes rows with neither", () => {
    expect(ids(rows, cond("description", "CONTAINS", "BEANS"))).toEqual(["card"]);
    expect(ids(rows, cond("description", "NOT_CONTAINS", "beans")).sort()).toEqual(["cash", "none"]);
    expect(ids(rows, cond("title", "NOT_CONTAINS", "beans")).sort()).toEqual(["cash", "card"].sort()); // null title skipped
  });

  it("text matching is literal: % _ and backslash are ordinary characters", () => {
    expect(ids(rows, cond("title", "CONTAINS", "100%"))).toEqual(["cash"]);
    expect(ids(rows, cond("title", "CONTAINS", "%"))).toEqual(["cash"]);
    expect(ids(rows, cond("title", "CONTAINS", "cotton_"))).toEqual(["cash"]);
    expect(ids(rows, cond("note", "CONTAINS", "\\"))).toEqual(["cash"]);
  });

  it("nested groups keep precedence; BETWEEN is inclusive", () => {
    const amounts = [row("a", { amountMinor: 100 }), row("b", { amountMinor: 200 }), row("c", { amountMinor: 300, type: "INCOME" })];
    expect(ids(amounts, and(cond("type", "EQ", "EXPENSE"), or(cond("amountMinor", "EQ", 100), cond("amountMinor", "EQ", 300))))).toEqual(["a"]);
    expect(ids(amounts, cond("amountMinor", "BETWEEN", [100, 200])).sort()).toEqual(["a", "b"]);
  });

  it("sorts with NULLS LAST both ways and breaks ties by id ascending, across pages", () => {
    const ties = [row("z", { amountMinor: 5, title: "b" }), row("a", { amountMinor: 5, title: null }), row("m", { amountMinor: 5, title: "a" })];
    expect(ids(ties, undefined, [{ field: "title", direction: "ASC" }])).toEqual(["m", "z", "a"]);
    expect(ids(ties, undefined, [{ field: "title", direction: "DESC" }])).toEqual(["z", "m", "a"]);
    expect(ids(ties, undefined, [{ field: "amountMinor", direction: "DESC" }])).toEqual(["a", "m", "z"]);
    const p1 = mockSearch(ties as never, { sort: [{ field: "amountMinor", direction: "DESC" }], page: { offset: 0, limit: 2 } });
    const p2 = mockSearch(ties as never, { sort: [{ field: "amountMinor", direction: "DESC" }], page: { offset: 2, limit: 2 } });
    expect([...p1.items, ...p2.items].map((i) => i.id)).toEqual(["a", "m", "z"]);
    expect(p1.page.hasMore).toBe(true);
    expect(p2.page.hasMore).toBe(false);
  });

  it("analyze: window is part of the predicate; partial edge buckets are labelled; zero buckets included", () => {
    const data = [row("m1", { occurredOn: "2026-03-20", amountMinor: 300 }), row("m2", { occurredOn: "2026-05-02", amountMinor: 500 }), row("out", { occurredOn: "2026-07-01", amountMinor: 900 })];
    const res = mockAnalyze(
      data as never,
      mockBackend.state.categories,
      { bucket: "MONTH", window: { startDate: "2026-03-15", endDate: "2026-05-31" } },
      { id: bookId, currencyCode: "USD" },
      []
    );
    expect(res.matchedCount).toBe(2);
    expect(res.expenseTotalMinor).toBe(800);
    expect(res.buckets.map((b) => [b.key, b.partial, b.expenseTotalMinor])).toEqual([
      ["2026-03", true, 300],
      ["2026-04", false, 0], // zero bucket
      ["2026-05", false, 500],
    ]);
    expect(res.largestExpense?.id).toBe("m2");
    expect(res.categories[0].percentOfExpense).toBe(100);
  });
});
