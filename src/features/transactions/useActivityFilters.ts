import { useCallback, useEffect, useMemo, useState } from "react";

import { useBooksStore } from "@/features/books/store";
import { useCategoriesStore } from "@/features/categories/store";
import { todayInTimeZone } from "@/shared/utils/ledgerDate";
import {
  buildQuery,
  emptyRoot,
  readQuick,
  setQuickAmount,
  setQuickCategories,
  setQuickDate,
  setQuickDescription,
  setQuickPayment,
  setQuickType,
  removeNode,
  activeChips,
  describeExpression,
  type DatePreset,
  type DescribeContext,
  type FilterRoot,
  type ModelContext,
  type SortState,
} from "./filterModel";
import { makeScope, useFilterStore, type ScopeKey } from "./filterStore";
import { useAccountScope } from "./queries";
import type { PaymentMethod, TransactionType } from "@/shared/types/transactionQuery";
import type { Ymd } from "@/shared/utils/ledgerDate";

const EMPTY_ROOT = emptyRoot();

/** The persisted filters load asynchronously; seeding defaults before they land would be overwritten by them. */
function useFilterStoreHydrated() {
  const [hydrated, setHydrated] = useState(() => useFilterStore.persist.hasHydrated());
  useEffect(() => {
    if (useFilterStore.persist.hasHydrated()) setHydrated(true);
    return useFilterStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

/** The book-local calendar day, refreshed when the app returns to the foreground. */
function useLedgerToday(timezone: string) {
  const [today, setToday] = useState(() => todayInTimeZone(timezone));
  useEffect(() => {
    setToday(todayInTimeZone(timezone));
    const onVisible = () => {
      if (document.visibilityState === "visible") setToday(todayInTimeZone(timezone));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [timezone]);
  return today;
}

/**
 * Everything Activity needs about the applied filter, bound to the current
 * account + book: the canonical expression, the built request, the model context
 * (currency / time zone) and one setter per quick filter. Every setter goes through
 * `applyRoot`, so quick and advanced edits can never diverge.
 */
export function useActivityFilters() {
  const { accountId, bookId } = useAccountScope();
  const book = useBooksStore((s) => s.books.find((b) => b.id === bookId));
  const categories = useCategoriesStore((s) => s.categories);

  const timezone = book?.timezone ?? "UTC";
  const currency = book?.currencyCode ?? "USD";
  const today = useLedgerToday(timezone);
  const scope: ScopeKey = makeScope(accountId, bookId);

  const applied = useFilterStore((s) => s.byScope[scope]);
  const ensure = useFilterStore((s) => s.ensure);
  const applyRoot = useFilterStore((s) => s.applyRoot);
  const applySort = useFilterStore((s) => s.applySort);
  const resetStore = useFilterStore((s) => s.reset);
  const clearAllStore = useFilterStore((s) => s.clearAll);

  // Seeds the default filter on first use and rolls Today / 7 days / This month forward.
  const hydrated = useFilterStoreHydrated();
  const ready = hydrated && Boolean(accountId && bookId);
  useEffect(() => {
    if (ready) ensure(scope, today);
  }, [ready, scope, today, ensure]);

  const root: FilterRoot = applied?.root ?? EMPTY_ROOT;
  const sort: SortState = applied?.sort ?? [];

  const modelContext: ModelContext = useMemo(() => ({ currency, timezone }), [currency, timezone]);
  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) if (c.bookId === bookId) map.set(c.id, c.name);
    return map;
  }, [categories, bookId]);
  const describeContext: DescribeContext = useMemo(
    () => ({ ...modelContext, today, categoryName: (id) => categoryNames.get(id) ?? "Unknown category" }),
    [modelContext, today, categoryNames]
  );

  // Nothing is queried until the scope's filter exists, so a first render never fires an "all rows" request.
  const query = useMemo(() => (applied ? buildQuery(root, sort, today) : null), [applied, root, sort, today]);
  const quick = useMemo(() => readQuick(root), [root]);
  const chips = useMemo(() => activeChips(root, describeContext), [root, describeContext]);
  const expressionText = useMemo(() => describeExpression(root, describeContext), [root, describeContext]);

  const apply = useCallback((next: FilterRoot) => applyRoot(scope, next), [applyRoot, scope]);

  return {
    scope,
    ready,
    root,
    sort,
    revision: applied?.revision ?? 0,
    query,
    quick,
    chips,
    expressionText,
    today,
    modelContext,
    describeContext,
    setSort: (next: SortState) => applySort(scope, next),
    setDate: (range: { startDate: Ymd; endDate: Ymd; preset?: DatePreset } | null) => apply(setQuickDate(root, range)),
    setType: (type: TransactionType | null) => apply(setQuickType(root, type)),
    setCategories: (ids: string[]) => apply(setQuickCategories(root, ids)),
    setAmount: (min: number | null, max: number | null) => apply(setQuickAmount(root, min, max)),
    setPayment: (methods: PaymentMethod[], unspecified: boolean) => apply(setQuickPayment(root, methods, unspecified)),
    setDescription: (text: string) => apply(setQuickDescription(root, text)),
    removeChip: (id: string) => apply(removeNode(root, id)),
    clearAll: () => clearAllStore(scope),
    reset: () => resetStore(scope, today),
  };
}
