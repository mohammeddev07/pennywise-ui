import {
  activeChips,
  addChild,
  addGroup,
  blankCondition,
  buildQuery,
  canonicalKey,
  changeField,
  changeOperator,
  conditionForField,
  defaultRoot,
  depthOf,
  describeExpression,
  emptyRoot,
  makeCondition,
  makeGroup,
  moveChild,
  parseTypedInput,
  readQuick,
  refreshPresets,
  removeNode,
  setConditionInput,
  setGroupOp,
  setQuickAmount,
  setQuickCategories,
  setQuickDate,
  setQuickDescription,
  setQuickPayment,
  setQuickType,
  toWire,
  validateTree,
  zonedToIso,
  type DescribeContext,
  type FilterGroupNode,
} from "../filterModel";
import { FIELD_CAPABILITIES, QUERY_LIMITS, type FilterNode } from "@/shared/types/transactionQuery";

const ctx = { currency: "USD", timezone: "America/New_York" };
const describeCtx: DescribeContext = { ...ctx, today: "2026-03-15", categoryName: (id) => (id === "cat-1" ? "Groceries" : id) };

describe("AND/OR editing", () => {
  it("builds nested AND/OR groups, reorders and removes, and keeps one canonical tree", () => {
    let root = emptyRoot();
    root = addChild(root, root.id, makeCondition("type", "EQ", "EXPENSE"));
    root = addGroup(root, root.id, "OR"); // starts with one blank condition - never an empty group
    const group = root.children[1] as FilterGroupNode;
    expect(group.kind).toBe("group");
    expect(group.children).toHaveLength(1);

    root = addChild(root, group.id, makeCondition("amountMinor", "GTE", 10000));
    root = addChild(root, group.id, makeCondition("description", "CONTAINS", "coffee"));
    const grown = root.children[1] as FilterGroupNode;
    expect(grown.op).toBe("OR");

    // Precedence: the OR group is one operand of the top-level AND.
    expect(describeExpression(root, describeCtx)).toBe(
      "Type is Expense AND (Description (title or note) contains … OR Amount is at least $100.00 OR Description (title or note) contains “coffee”)"
    );

    // Reorder within a group.
    const moved = moveChild(root, grown.id, 2, 1);
    const movedGroup = moved.children[1] as FilterGroupNode;
    expect((movedGroup.children[1] as { value: unknown }).value).toBe("coffee");

    // Flip a group's operator and remove a condition.
    const flipped = setGroupOp(root, grown.id, "AND");
    expect((flipped.children[1] as FilterGroupNode).op).toBe("AND");
    const removed = removeNode(root, grown.children[0].id);
    expect((removed.children[1] as FilterGroupNode).children).toHaveLength(2);
  });

  it("allows repeated conditions on one field", () => {
    let root = emptyRoot();
    root = addChild(root, root.id, makeCondition("amountMinor", "GTE", 500));
    root = addChild(root, root.id, makeCondition("amountMinor", "LTE", 9000));
    root = addChild(root, root.id, makeCondition("amountMinor", "NE", 1234));
    expect(validateTree(root).valid).toBe(true);
    expect(toWire(root)).toMatchObject({ children: [{ field: "amountMinor" }, { field: "amountMinor" }, { field: "amountMinor" }] });
  });

  it("flags blank conditions, empty groups and over-deep or over-large trees", () => {
    let root = addChild(emptyRoot(), "x", blankCondition());
    root = addChild(root, root.id, blankCondition());
    expect(validateTree(root).valid).toBe(false);

    const emptyNested = { ...emptyRoot(), children: [makeGroup("OR", [])] };
    expect(validateTree(emptyNested).valid).toBe(false);

    // depth: root(1) > g(2) > g(3) is the limit; a fourth level is too deep
    const ok = makeGroup("AND", [makeGroup("AND", [makeGroup("AND", [makeCondition("type", "EQ", "INCOME")])])]);
    expect(validateTree(ok).treeErrors).toEqual([]);
    const deep = makeGroup("AND", [ok]);
    expect(validateTree(deep).treeErrors.join(" ")).toMatch(/nest at most 3/);

    const many = makeGroup("AND", Array.from({ length: 31 }, () => makeCondition("type", "EQ", "INCOME")));
    expect(validateTree(many).treeErrors.join(" ")).toMatch(/At most 30/);
  });

  it("supports every field with the operators the server publishes, and read-only metadata", () => {
    for (const [field, cap] of Object.entries(FIELD_CAPABILITIES)) {
      const c = conditionForField(field as keyof typeof FIELD_CAPABILITIES);
      expect(cap.operators).toContain(c.operator);
    }
    expect(Object.keys(FIELD_CAPABILITIES)).toHaveLength(14);
  });

  it("changing the operator re-shapes the value instead of sending a wrong one", () => {
    let root = emptyRoot();
    const c = makeCondition("categoryId", "IN", ["a", "b"]);
    root = addChild(root, root.id, c);
    root = changeOperator(root, c.id, "EQ", ctx);
    expect((root.children[0] as { value: unknown }).value).toBe("a");
    root = changeOperator(root, c.id, "IS_NULL" as never, ctx);
    // IS_NULL is not valid for categoryId, so validation (not a silent send) reports it.
    expect(validateTree(root).valid).toBe(false);

    const p = makeCondition("paymentMethod", "IN", ["CARD"]);
    let r2 = addChild(emptyRoot(), "x", p);
    r2 = { ...r2, children: [p] };
    r2 = changeOperator(r2, p.id, "IS_NULL", ctx);
    expect(toWire(r2)).toEqual({ kind: "group", op: "AND", children: [{ kind: "condition", field: "paymentMethod", operator: "IS_NULL" }] });

    const swapped = changeField(r2, p.id, "amountMinor");
    expect((swapped.children[0] as { operator: string }).operator).toBe("EQ");
  });
});

describe("one canonical expression for quick and advanced filters", () => {
  it("quick filters are views over top-level nodes and round-trip", () => {
    let root = defaultRoot("2026-03-15");
    root = setQuickType(root, "EXPENSE");
    root = setQuickCategories(root, ["cat-1", "cat-2"]);
    root = setQuickAmount(root, 500, 9000);
    root = setQuickPayment(root, ["CARD", "CASH"], true);
    root = setQuickDescription(root, "  coffee ");

    const q = readQuick(root);
    expect(q.date).toEqual({ startDate: "2026-03-15", endDate: "2026-03-15", preset: "today" });
    expect(q.type).toBe("EXPENSE");
    expect(q.categoryIds).toEqual(["cat-1", "cat-2"]);
    expect([q.amountMinMinor, q.amountMaxMinor]).toEqual([500, 9000]);
    expect(q.paymentMethods).toEqual(["CARD", "CASH"]);
    expect(q.paymentUnspecified).toBe(true);
    expect(q.description).toBe("coffee");

    // Payment with "Not specified" is an OR group of IN + IS_NULL, on the wire, not a hidden flag.
    const wire = JSON.stringify(toWire(root));
    expect(wire).toContain('"op":"OR"');
    expect(wire).toContain('"operator":"IS_NULL"');
  });

  it("clearing a quick filter removes exactly its node; nothing hidden remains", () => {
    let root = setQuickType(setQuickDescription(defaultRoot("2026-03-15"), "x"), "INCOME");
    root = setQuickType(root, null);
    root = setQuickDescription(root, "");
    expect(root.children).toHaveLength(1); // only the date
    expect(readQuick(setQuickDate(root, null)).date).toBeNull();
    expect(setQuickDate(root, null).children).toHaveLength(0);
  });

  it("an advanced edit of a quick node is seen by the quick view (no second copy)", () => {
    let root = setQuickAmount(defaultRoot("2026-03-15"), 500, null);
    const min = root.children.find((c) => c.kind === "condition" && c.field === "amountMinor")!;
    root = setConditionInput(root, min.id, 0, "12.34", ctx);
    expect(readQuick(root).amountMinMinor).toBe(1234);
  });

  it("only the first matching top-level node is the quick filter; extras stay advanced chips", () => {
    let root = setQuickType(defaultRoot("2026-03-15"), "EXPENSE");
    root = addChild(root, root.id, makeCondition("type", "EQ", "INCOME"));
    const chips = activeChips(root, describeCtx).map((c) => c.label);
    expect(chips).toEqual(["Today", "Expenses", "Type is Income"]);
    expect(readQuick(root).type).toBe("EXPENSE");
  });

  it("canonical key ignores order and client-only fields but not meaning", () => {
    const a = makeGroup("AND", [makeCondition("type", "EQ", "INCOME"), makeCondition("amountMinor", "GTE", 5)]);
    const b = makeGroup("AND", [makeCondition("amountMinor", "GTE", 5), makeCondition("type", "EQ", "INCOME")]);
    const c = makeGroup("OR", [makeCondition("amountMinor", "GTE", 5), makeCondition("type", "EQ", "INCOME")]);
    expect(canonicalKey(toWire(a))).toBe(canonicalKey(toWire(b)));
    expect(canonicalKey(toWire(a))).not.toBe(canonicalKey(toWire(c)));
  });

  it("wire form carries no client-only bookkeeping", () => {
    const root = setQuickDate(emptyRoot(), { startDate: "2026-03-01", endDate: "2026-03-31", preset: "month" });
    expect(JSON.stringify(toWire(root))).not.toMatch(/"id"|"preset"|"raw"/);
  });

  it("buildQuery: search carries the window; analyze gets the window instead of a duplicate date condition", () => {
    const root = setQuickType(setQuickDate(emptyRoot(), { startDate: "2026-03-01", endDate: "2026-03-31" }), "EXPENSE");
    const q = buildQuery(root, [], "2026-03-15");
    expect(q.window).toEqual({ startDate: "2026-03-01", endDate: "2026-03-31" });
    expect(JSON.stringify(q.filter)).toContain("occurredOn");
    expect(JSON.stringify(q.analyzeFilter)).not.toContain("occurredOn");
  });

  it("without a date the all-dates window is explicit in BOTH search and analyze, so rows and totals match", () => {
    const q = buildQuery(setQuickType(emptyRoot(), "EXPENSE"), [], "2026-03-15");
    const win = q.window;
    expect(win.endDate > "2027-01-01").toBe(true);
    expect(JSON.stringify(q.filter)).toContain(win.startDate);
    // 5-year guard from the server
    const years = (Date.parse(win.endDate) - Date.parse(win.startDate)) / 86_400_000 / 365.25;
    expect(years).toBeLessThanOrEqual(5);
  });

  it("rolling presets follow the calendar day; custom ranges never move", () => {
    const today = defaultRoot("2026-03-15");
    const next = refreshPresets(today, "2026-03-16");
    expect(readQuick(next).date).toMatchObject({ startDate: "2026-03-16", endDate: "2026-03-16", preset: "today" });
    const custom = setQuickDate(emptyRoot(), { startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(refreshPresets(custom, "2026-03-16")).toBe(custom);
  });
});

describe("exact typed input", () => {
  it("parses amounts exactly in minor units, per currency, and rejects instead of rounding", () => {
    expect(parseTypedInput("amountMinor", "GTE", 0, "12.34", ctx)).toEqual({ value: 1234 });
    expect(parseTypedInput("amountMinor", "GTE", 0, "0.1", ctx)).toEqual({ value: 10 });
    expect(parseTypedInput("amountMinor", "GTE", 0, "1,234.50", ctx)).toEqual({ value: 123450 });
    expect(parseTypedInput("amountMinor", "GTE", 0, "19.99", ctx)).toEqual({ value: 1999 }); // 19.99 * 100 = 1998.9999...
    expect(parseTypedInput("amountMinor", "GTE", 0, "1.005", ctx)).toHaveProperty("error");
    expect(parseTypedInput("amountMinor", "GTE", 0, "-5", ctx)).toHaveProperty("error");
    expect(parseTypedInput("amountMinor", "GTE", 0, "abc", ctx)).toHaveProperty("error");
    expect(parseTypedInput("amountMinor", "GTE", 0, "", ctx)).toHaveProperty("error");
    expect(parseTypedInput("amountMinor", "GTE", 0, "99999999999999999999", ctx)).toHaveProperty("error");
    // JPY has no minor unit digits.
    expect(parseTypedInput("amountMinor", "GTE", 0, "500", { ...ctx, currency: "JPY" })).toEqual({ value: 500 });
    expect(parseTypedInput("amountMinor", "GTE", 0, "500.5", { ...ctx, currency: "JPY" })).toHaveProperty("error");
  });

  it("validates real calendar dates and leaves value unset for bad text", () => {
    expect(parseTypedInput("occurredOn", "EQ", 0, "2026-02-31", ctx)).toHaveProperty("error");
    expect(parseTypedInput("occurredOn", "EQ", 0, "2026-02-28", ctx)).toEqual({ value: "2026-02-28" });
    let root = emptyRoot();
    const c = makeCondition("amountMinor", "BETWEEN");
    root = addChild(root, root.id, c);
    root = setConditionInput(root, c.id, 0, "10", ctx);
    expect((root.children[0] as { value?: unknown }).value).toBeUndefined(); // second end missing
    root = setConditionInput(root, c.id, 1, "20", ctx);
    expect((root.children[0] as { value?: unknown }).value).toEqual([1000, 2000]);
    root = setConditionInput(root, c.id, 1, "5", ctx);
    expect(validateTree(root).nodeErrors[c.id]).toMatch(/must not be after/);
  });

  it("timestamps are book-local wall-clock; a bare date means the whole day", () => {
    // New York is UTC-5 in winter (EST) and UTC-4 in summer (EDT).
    expect(zonedToIso("2026-01-15", "00:00", "America/New_York", false)).toBe("2026-01-15T05:00:00Z");
    expect(zonedToIso("2026-07-15", "00:00", "America/New_York", false)).toBe("2026-07-15T04:00:00Z");
    expect(zonedToIso("2026-01-15", null, "America/New_York", true)).toBe("2026-01-16T04:59:59.999999Z");
    expect(parseTypedInput("createdAt", "GTE", 0, "2026-01-15", ctx)).toEqual({ value: "2026-01-15T05:00:00Z" });
    expect(parseTypedInput("createdAt", "LTE", 0, "2026-01-15", ctx)).toEqual({ value: "2026-01-16T04:59:59.999999Z" });
    expect(parseTypedInput("createdAt", "GT", 0, "2026-01-15 10:30", ctx)).toEqual({ value: "2026-01-15T15:30:00Z" });
    expect(parseTypedInput("createdAt", "GT", 0, "2026-01-15 25:00", ctx)).toHaveProperty("error");
  });
});

describe("request limits count what is actually sent", () => {
  const wireDepth = (n: FilterNode): number => (n.kind === "group" ? 1 + Math.max(0, ...n.children.map(wireDepth)) : 0);
  const wireConditions = (n: FilterNode): number =>
    n.kind === "group" ? n.children.reduce((sum, c) => sum + wireConditions(c), 0) : 1;
  const cond = () => makeCondition("description", "CONTAINS", "x");

  // The server counts the request, not the tree on screen: an OR root is wrapped in an AND (one more
  // level) and a tree with no date range gets the analysis window appended (one more condition).
  const fitsTheServer = (root: FilterGroupNode) => {
    const q = buildQuery(root, [], "2026-03-15");
    for (const f of [q.filter, q.analyzeFilter]) {
      // analyze adds its own window condition (and wraps an OR root) server-side
      const sent = f === q.analyzeFilter ? (f.kind === "group" && f.op === "OR" ? { kind: "group", op: "AND", children: [f] } : f) : f;
      expect(wireDepth(sent as FilterNode)).toBeLessThanOrEqual(QUERY_LIMITS.maxDepth);
    }
    expect(wireConditions(q.filter)).toBeLessThanOrEqual(QUERY_LIMITS.maxConditions);
  };

  it("rejects an OR-rooted tree that would be wrapped past the depth limit", () => {
    const deep = makeGroup("OR", [makeGroup("AND", [makeGroup("OR", [cond()])])]);
    expect(depthOf(deep)).toBe(QUERY_LIMITS.maxDepth);
    expect(validateTree(deep).valid).toBe(false);
    expect(validateTree(makeGroup("OR", [makeGroup("AND", [cond()])])).valid).toBe(true);
  });

  it("rejects a tree whose appended window condition would pass the condition limit", () => {
    const full = makeGroup("AND", Array.from({ length: QUERY_LIMITS.maxConditions }, cond));
    expect(validateTree(full).valid).toBe(false);
    // With a date slot the window is that condition, so nothing is appended.
    const dated = setQuickDate(makeGroup("AND", Array.from({ length: QUERY_LIMITS.maxConditions - 1 }, cond)), {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(validateTree(dated).valid).toBe(true);
    fitsTheServer(dated);
  });

  it("every tree the builder accepts produces a request within the server's limits", () => {
    const accepted = [
      makeGroup("AND", Array.from({ length: QUERY_LIMITS.maxConditions - 1 }, cond)),
      makeGroup("OR", [makeGroup("AND", [cond()])]),
      makeGroup("AND", [makeGroup("OR", [makeGroup("AND", [cond()])])]),
    ];
    for (const root of accepted) {
      expect(validateTree(root).valid).toBe(true);
      fitsTheServer(root);
    }
  });
});
