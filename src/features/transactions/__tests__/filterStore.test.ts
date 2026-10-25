import { addChild, blankCondition, defaultRoot, makeCondition, readQuick, setConditionValue, setQuickType } from "../filterModel";
import { makeScope, useFilterStore } from "../filterStore";

const A = makeScope("user-A", "book-1");
const B = makeScope("user-A", "book-2");
const TODAY = "2026-03-15";

beforeEach(() => useFilterStore.getState().clearAllScopes());

describe("applied filters and drafts", () => {
  it("seeds a per-account, per-book default and keeps scopes apart", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    s.ensure(B, TODAY);
    s.applyRoot(A, setQuickType(useFilterStore.getState().byScope[A].root, "EXPENSE"));
    expect(readQuick(useFilterStore.getState().byScope[A].root).type).toBe("EXPENSE");
    expect(readQuick(useFilterStore.getState().byScope[B].root).type).toBeNull();
    expect(makeScope("user-B", "book-1")).not.toBe(A);
  });

  it("the revision moves only when the applied query really changes", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    const r0 = useFilterStore.getState().byScope[A].revision;
    s.applyRoot(A, useFilterStore.getState().byScope[A].root); // same query
    expect(useFilterStore.getState().byScope[A].revision).toBe(r0);
    s.applyRoot(A, setQuickType(useFilterStore.getState().byScope[A].root, "INCOME"));
    expect(useFilterStore.getState().byScope[A].revision).toBe(r0 + 1);
    s.applySort(A, [{ field: "amountMinor", direction: "DESC" }]);
    expect(useFilterStore.getState().byScope[A].revision).toBe(r0 + 2);
    // Reordering nothing meaningful (sort default -> default) does not refetch either.
    s.applySort(A, [{ field: "amountMinor", direction: "DESC" }]);
    expect(useFilterStore.getState().byScope[A].revision).toBe(r0 + 2);
  });

  it("draft edits are invisible until Apply, and Apply is all-or-nothing", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    const applied = useFilterStore.getState().byScope[A].root;

    s.beginDraft(A);
    const draft = useFilterStore.getState().drafts[A]!;
    s.setDraft(A, { root: addChild(draft.root, draft.root.id, blankCondition()) }); // blank = invalid
    expect(useFilterStore.getState().byScope[A].root).toBe(applied); // nothing applied yet

    expect(useFilterStore.getState().applyDraft(A, "filter")).toBe(false); // invalid draft: rejected whole
    expect(useFilterStore.getState().byScope[A].root).toBe(applied);
    expect(useFilterStore.getState().drafts[A]).toBeDefined(); // still editable

    const blank = useFilterStore.getState().drafts[A]!.root.children.at(-1)!;
    s.setDraft(A, { root: setConditionValue(useFilterStore.getState().drafts[A]!.root, blank.id, "coffee") });
    expect(useFilterStore.getState().applyDraft(A, "filter")).toBe(true);
    expect(readQuick(useFilterStore.getState().byScope[A].root).description).toBe("coffee");
    expect(useFilterStore.getState().drafts[A]).toBeUndefined();
  });

  it("a sort-only draft never writes back a stale filter", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    s.beginDraft(A); // sort sheet opens with the filter as it is now
    s.applyRoot(A, setQuickType(useFilterStore.getState().byScope[A].root, "EXPENSE")); // a search commits meanwhile
    s.setDraft(A, { sort: [{ field: "amountMinor", direction: "DESC" }] });
    expect(useFilterStore.getState().applyDraft(A, "sort")).toBe(true);
    expect(readQuick(useFilterStore.getState().byScope[A].root).type).toBe("EXPENSE"); // kept
    expect(useFilterStore.getState().byScope[A].sort).toEqual([{ field: "amountMinor", direction: "DESC" }]);
  });

  it("Cancel discards the draft", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    const applied = useFilterStore.getState().byScope[A].root;
    s.beginDraft(A);
    s.setDraft(A, { root: addChild(useFilterStore.getState().drafts[A]!.root, applied.id, makeCondition("type", "EQ", "INCOME")) });
    s.cancelDraft(A);
    expect(useFilterStore.getState().drafts[A]).toBeUndefined();
    expect(useFilterStore.getState().byScope[A].root).toBe(applied);
  });

  it("reset returns to Today; clearAll removes every condition including the date", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    s.applyRoot(A, setQuickType(useFilterStore.getState().byScope[A].root, "EXPENSE"));
    s.clearAll(A);
    expect(useFilterStore.getState().byScope[A].root.children).toHaveLength(0);
    s.reset(A, TODAY);
    expect(readQuick(useFilterStore.getState().byScope[A].root).date?.preset).toBe("today");
    expect(useFilterStore.getState().byScope[A].root.children).toHaveLength(1);
  });

  it("ensure rolls a persisted 'Today' forward without touching anything else", () => {
    const s = useFilterStore.getState();
    s.applyRoot(A, defaultRoot("2026-03-14"));
    s.ensure(A, TODAY);
    expect(readQuick(useFilterStore.getState().byScope[A].root).date).toMatchObject({ startDate: TODAY, endDate: TODAY });
  });

  it("logout clears every account's filters", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    s.clearAllScopes();
    expect(useFilterStore.getState().byScope).toEqual({});
  });
});

describe("drill-down", () => {
  it("remembers the pre-drill filter, sort and scroll; a second drill keeps the original; Back restores it once", () => {
    const s = useFilterStore.getState();
    s.ensure(A, TODAY);
    s.applyRoot(A, setQuickType(useFilterStore.getState().byScope[A].root, "EXPENSE"));
    s.applySort(A, [{ field: "amountMinor", direction: "DESC" }]);
    const before = useFilterStore.getState().byScope[A];

    const drilled = setQuickType(before.root, "INCOME");
    useFilterStore.getState().drillInto(A, drilled, "Salary · Jan 2026", 320);
    useFilterStore.getState().drillInto(A, setQuickType(before.root, null), "Salary · Feb 2026", 999);

    const during = useFilterStore.getState();
    expect(during.drills[A]).toMatchObject({ label: "Salary · Feb 2026", scrollOffset: 320 }); // origin kept, label updated
    expect(during.byScope[A].sort).toEqual(before.sort);
    expect(during.byScope[A].revision).toBeGreaterThan(before.revision);

    expect(useFilterStore.getState().restoreDrill(A)).toBe(true);
    const after = useFilterStore.getState();
    expect(after.byScope[A].root).toBe(before.root);
    expect(after.byScope[A].sort).toEqual(before.sort);
    expect(after.drills[A]).toBeUndefined();
    expect(after.pendingScroll[A]).toBe(320);
    expect(useFilterStore.getState().restoreDrill(A)).toBe(false); // nothing left to go back to
  });

  it("drills are per scope and never persisted", () => {
    useFilterStore.getState().ensure(A, TODAY);
    useFilterStore.getState().drillInto(A, setQuickType(useFilterStore.getState().byScope[A].root, "INCOME"), "x", 0);
    expect(useFilterStore.getState().drills[B]).toBeUndefined();
    expect(Object.keys(useFilterStore.persist.getOptions().partialize!(useFilterStore.getState()) as object)).toEqual(["byScope"]);
  });
});
