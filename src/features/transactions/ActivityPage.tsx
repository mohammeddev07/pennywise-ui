import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useOverlay } from "@/app/overlays";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { captureBookScope } from "@/features/books/coordinator";
import { useBooksStore } from "@/features/books/store";
import { useCategoriesStore } from "@/features/categories/store";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/shared/api/errors";
import { useIsDesktop } from "@/shared/hooks/useMediaQuery";
import { Icon } from "@/shared/ui/Icon";
import { AnimatedMoney, Money } from "@/shared/ui/Money";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/states";
import { useExportToastStore } from "@/shared/ui/state/useExportToastStore";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { useDelayedFlag } from "@/shared/ui/utils/useDelayedFlag";
import { MockModeUnsupportedError, exportQueryToDevice } from "@/shared/utils/exportFile";
import { addDaysYmd, addMonthsYmd, endOfMonthYmd, formatMonthYmd, formatYmd, startOfMonthYmd, type Ymd } from "@/shared/utils/ledgerDate";
import { buildActivityRows } from "./activityRows";
import { setActivityScroll } from "./activityScroll";
import { deleteWithConfirm, duplicate, seedDetail } from "./detail/commands";
import { TransactionDetail } from "./detail/TransactionDetail";
import { DEFAULT_SORT, allDatesWindow, dateRangeLabel, hasAdvancedNodes, isDatePrimarySort, type DatePreset, type FilterRoot, type SortState } from "./filterModel";
import { useFilterStore } from "./filterStore";
import type { Transaction } from "./model";
import { useActivityResults } from "./queries";
import { describeSort, directionLabels, reverseSort } from "./sortModel";
import { ActivityList, RowActionsSheet } from "./ui/ActivityList";
import { ActivityTable } from "./ui/ActivityTable";
import { AdvancedFilterSheet } from "./ui/AdvancedFilterSheet";
import { Chip, ChipRow } from "./ui/Chip";
import { CustomRangeSheet } from "./ui/CustomRangeSheet";
import { DescribeFilterSheet } from "./ui/DescribeFilterSheet";
import { DrillBreadcrumb } from "./ui/DrillBreadcrumb";
import { AmountFilterSheet, CategoryFilterSheet, PaymentFilterSheet } from "./ui/QuickFilterSheets";
import { SortSheet } from "./ui/SortSheet";
import { useActivityFilters } from "./useActivityFilters";
import { useDebouncedText } from "./ui/useDebouncedText";

type Sheet = "custom" | "category" | "amount" | "payment" | "advanced" | "describe" | "sort";

// The domain's range labels join dates with an en dash; the UI copy rule allows none.
const plain = (s: string) => s.replace(/\s*[–—]\s*/g, " to ");
const isWholeMonth = (start: Ymd, end: Ymd) => start === startOfMonthYmd(start) && end === endOfMonthYmd(start);

function IconButton({ label, icon, onClick, disabled, active }: { label: string; icon: "download-outline" | "swap-vertical" | "search" | "close"; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn("size-11 rounded-full", active && "bg-primary-soft text-primary")}
    >
      <Icon name={icon} size={20} />
    </Button>
  );
}

/**
 * Owns the typed text so a keystroke re-renders only this input, not every loaded row; the page re-renders when
 * the debounced value commits to the filter.
 */
function SearchField({
  applied,
  commit,
  inputRef,
  showKbd,
  onEscape,
}: {
  applied: string;
  commit: (text: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  showKbd: boolean;
  onEscape: () => void;
}) {
  const [text, setText] = useDebouncedText(applied, commit);
  return (
    <div className="relative w-full lg:w-72">
      <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          setText("");
          onEscape();
          e.currentTarget.blur();
        }}
        placeholder="Search title or note"
        aria-label="Search transactions"
        autoComplete="off"
        className="h-11 rounded-full pr-10 pl-10 md:h-10"
      />
      {showKbd && !text && <Kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">/</Kbd>}
    </div>
  );
}

function LoadMore({ enabled, onLoad }: { enabled: boolean; onLoad: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && onLoad(), { rootMargin: "800px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled, onLoad]);
  return <div ref={ref} aria-hidden className="h-px" />;
}

function ResultsSkeleton({ table }: { table: boolean }) {
  if (table) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-label="Loading transactions">
        <Skeleton className="h-11 w-full rounded-xl" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading transactions">
      <Skeleton className="h-4 w-20" />
      <div className="surface divide-y divide-border rounded-xl">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="size-10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityPage() {
  const { txId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();

  const filters = useActivityFilters();
  const results = useActivityResults(filters.query);
  const { quick, today, scope, describeContext } = filters;
  const currency = filters.modelContext.currency;
  const bookId = useBooksStore((s) => s.selectedBookId);

  const categories = useCategoriesStore((s) => s.categories);
  const bookCategories = useMemo(() => categories.filter((c) => c.bookId === bookId && !c.isDisabled), [categories, bookId]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [proposal, setProposal] = useState<{ root: FilterRoot; sort: SortState; limitation: string | null } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [menuTx, setMenuTx] = useState<Transaction | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(txId ?? null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ---- routing: /activity/:txId is the detail; ?edit=1 opens it in edit mode; ?search=1 focuses search.
  const editing = params.get("edit") === "1";
  const lastTxId = useRef(txId);
  if (txId) lastTxId.current = txId;
  useEffect(() => {
    if (txId) setSelectedId(txId);
  }, [txId]);
  useEffect(() => {
    if (params.get("search") !== "1") return;
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("search");
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const setEditing = (on: boolean) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (on) next.set("edit", "1");
        else next.delete("edit");
        return next;
      },
      { replace: true },
    );
  const openTx = (tx: Transaction) => {
    seedDetail(tx);
    setSelectedId(tx.id);
    if (txId !== tx.id || editing) navigate(`/activity/${tx.id}`, { replace: Boolean(txId) });
  };
  const editTx = (tx: Transaction) => {
    seedDetail(tx);
    setSelectedId(tx.id);
    navigate(`/activity/${tx.id}?edit=1`, { replace: Boolean(txId) });
  };
  const closeDetail = useCallback(() => navigate("/activity"), [navigate]);
  const deleteTx = (tx: Transaction) => deleteWithConfirm(tx, currency, () => txId === tx.id && closeDetail());
  const duplicateTx = async (tx: Transaction) => {
    const copy = await duplicate(tx);
    if (copy) navigate(`/activity/${copy.id}`);
  };

  // Escape closes the desktop detail panel (the phone sheet handles its own).
  useEffect(() => {
    if (!isDesktop || !txId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "Escape" || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      // An open edit form is closed by its own Cancel, never by a stray Escape that drops the changes.
      if (editing) return;
      closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, txId, closeDetail, editing]);

  // ---- date chips
  const date = quick.date;
  const isPreset = (p: DatePreset) => date?.preset === p;
  const monthView = date !== null && isWholeMonth(date.startDate, date.endDate);
  const customActive = date !== null && !isPreset("today") && !isPreset("7d") && !monthView;
  const rangeLabel = date ? plain(dateRangeLabel(date, describeContext)) : "All dates";
  const allWindow = useMemo(() => allDatesWindow(today), [today]);
  const setMonth = (start: Ymd) =>
    filters.setDate({ startDate: start, endDate: endOfMonthYmd(start), preset: start === startOfMonthYmd(today) ? "month" : undefined });

  // ---- applied chips (the date has its own chips; Expenses / Income already show as selected quick chips)
  const dateChipId = filters.root.children.find((c) => c.kind === "condition" && c.field === "occurredOn" && c.operator === "BETWEEN")?.id;
  const activeChips = filters.chips.filter((c) => c.id !== dateChipId);
  const filterCount = activeChips.length;
  const appliedChips = activeChips.filter((c) => c.label !== "Expenses" && c.label !== "Income");

  // ---- results
  const rows = useMemo(
    () => buildActivityRows(results.rows, filters.sort, { today, hasMore: Boolean(results.hasNextPage) }),
    [results.rows, filters.sort, today, results.hasNextPage],
  );
  const showRows = results.status === "ready" && (results.rowsCurrent || results.rows.length > 0);
  const updating = results.isUpdating;
  const slow = useDelayedFlag(updating, 4000);
  const staleError = results.status === "ready" && Boolean(results.error);
  const totals = results.totals;
  const primarySort = filters.sort[0] ?? DEFAULT_SORT[0];
  const orderLabel = directionLabels(primarySort.field)[primarySort.direction];

  // The stagger replays only when a new result set lands, never on page appends or refetches.
  const revealKey = useRef("");
  if (results.rowsCurrent && filters.query) revealKey.current = filters.query.queryHash;

  // Drill-down Back: return to where the list was once the restored rows are on screen.
  const pendingScroll = useFilterStore((s) => s.pendingScroll[scope]);
  const clearPendingScroll = useFilterStore((s) => s.clearPendingScroll);
  useEffect(() => {
    if (pendingScroll === undefined || !showRows || !results.rowsCurrent) return;
    const frame = requestAnimationFrame(() => {
      if (results.rows.length > 0) window.scrollTo({ top: pendingScroll });
      clearPendingScroll(scope);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingScroll, showRows, results.rowsCurrent, results.rows.length, scope, clearPendingScroll]);
  // Insights reads this when it drills down; Activity is unmounted by then, so record it on the way out.
  useEffect(() => () => setActivityScroll(scope, window.scrollY), [scope]);

  const onExport = async () => {
    if (exporting || !filters.query || !bookId) return;
    const isCurrent = captureBookScope();
    setExporting(true);
    try {
      const { fileName } = await exportQueryToDevice(bookId, {
        filter: filters.query.filter,
        ...(filters.query.sort.length > 0 ? { sort: filters.query.sort } : {}),
      });
      if (isCurrent()) useExportToastStore.getState().showSuccess(fileName);
    } catch (error) {
      if (!isCurrent()) return;
      useUndoToastStore.getState().showError(error, error instanceof MockModeUnsupportedError ? error.message : "Couldn't export these transactions.");
    } finally {
      setExporting(false);
    }
  };

  const split = isDesktop && Boolean(txId);
  const handlers = { onOpen: openTx, onEdit: editTx, onDelete: deleteTx, onMenu: setMenuTx };
  const fetchNextPage = results.fetchNextPage;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  const empty =
    filterCount > 0
      ? { title: "No matches", body: "Try changing or clearing the filters.", label: "Clear filters", run: filters.clearAll }
      : date !== null
        ? { title: "No transactions in this range", body: `Nothing falls inside ${rangeLabel}.`, label: "Show all dates", run: () => filters.setDate(null) }
        : { title: "No transactions yet", body: "Add your first one and it shows up here.", label: "Add transaction", run: () => useOverlay.getState().show({ kind: "add-transaction" }) };

  const searchField = (
    <SearchField
      applied={quick.description}
      commit={filters.setDescription}
      inputRef={searchRef}
      showKbd={isDesktop}
      onEscape={() => !isDesktop && setSearchOpen(false)}
    />
  );

  return (
    <div className="space-y-5">
      {/* ---- header */}
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="mr-auto text-2xl font-semibold tracking-tight md:text-3xl">Activity</h1>
          {isDesktop && searchField}
          <IconButton label="Export current results" icon="download-outline" onClick={onExport} disabled={exporting || results.totalCount === 0} />
          <IconButton label={`Sort: ${describeSort(filters.sort)}`} icon="swap-vertical" onClick={() => setSheet("sort")} active={filters.sort.length > 0} />
          {!isDesktop && (
            <IconButton
              label={searchOpen ? "Close search" : "Search transactions"}
              icon={searchOpen ? "close" : "search"}
              onClick={() => {
                if (searchOpen) filters.setDescription("");
                else requestAnimationFrame(() => searchRef.current?.focus());
                setSearchOpen((o) => !o);
              }}
            />
          )}
        </div>
        <AnimatePresence initial={false}>
          {!isDesktop && searchOpen && (
            <motion.div
              key="search"
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              {searchField}
            </motion.div>
          )}
        </AnimatePresence>
        <DrillBreadcrumb scope={scope} />
      </header>

      {/* ---- filters */}
      <div className="space-y-2">
        <ChipRow label="Date range">
          <Chip active={isPreset("today")} onClick={() => filters.setDate({ startDate: today, endDate: today, preset: "today" })}>
            Today
          </Chip>
          <Chip active={isPreset("7d")} onClick={() => filters.setDate({ startDate: addDaysYmd(today, -6), endDate: today, preset: "7d" })}>
            7 days
          </Chip>
          {monthView && date ? (
            <span className="inline-flex h-11 shrink-0 items-center rounded-full border border-primary/30 bg-primary-soft md:h-9">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonthsYmd(date.startDate, -1))} className="grid h-full w-10 place-items-center rounded-l-full hover:bg-primary/10">
                <Icon name="chevron-back" size={16} />
              </button>
              <span className="min-w-28 text-center text-sm font-medium" aria-live="polite">
                {formatMonthYmd(date.startDate)}
              </span>
              <button type="button" aria-label="Next month" onClick={() => setMonth(addMonthsYmd(date.startDate, 1))} className="grid h-full w-10 place-items-center rounded-r-full hover:bg-primary/10">
                <Icon name="chevron-forward" size={16} />
              </button>
            </span>
          ) : (
            <Chip onClick={() => setMonth(startOfMonthYmd(today))}>Month</Chip>
          )}
          <Chip active={date === null} onClick={() => filters.setDate(null)}>
            All
          </Chip>
          <Chip icon="calendar-outline" active={customActive} onClick={() => setSheet("custom")}>
            {customActive ? rangeLabel : "Custom"}
          </Chip>
        </ChipRow>
        <ChipRow label="Filters">
          <Chip icon="sparkles-outline" onClick={() => setSheet("describe")}>
            Describe your filter
          </Chip>
          <Chip tone="expense" active={quick.type === "EXPENSE"} onClick={() => filters.setType(quick.type === "EXPENSE" ? null : "EXPENSE")}>
            Expenses
          </Chip>
          <Chip tone="income" active={quick.type === "INCOME"} onClick={() => filters.setType(quick.type === "INCOME" ? null : "INCOME")}>
            Income
          </Chip>
          <Chip active={quick.categoryIds.length > 0} onClick={() => setSheet("category")}>
            Categories
            {quick.categoryIds.length > 0 && <span className="money ml-1 rounded-full bg-primary/15 px-1.5 text-xs">{quick.categoryIds.length}</span>}
          </Chip>
          <Chip active={quick.amountMinMinor !== null || quick.amountMaxMinor !== null} onClick={() => setSheet("amount")}>
            Amount
          </Chip>
          <Chip active={quick.paymentMethods.length > 0 || quick.paymentUnspecified} onClick={() => setSheet("payment")}>
            Payment
          </Chip>
          <Chip icon="settings-outline" active={hasAdvancedNodes(filters.root)} onClick={() => setSheet("advanced")}>
            Advanced
          </Chip>
        </ChipRow>
        {appliedChips.length > 0 && (
          <ChipRow label="Applied filters">
            {appliedChips.map((chip) => (
              <Chip key={chip.id} active onRemove={() => filters.removeChip(chip.id)}>
                {plain(chip.label)}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {/* ---- totals over every match (server-side), dimmed rather than swapped while the filter changes */}
      <section aria-label="Totals" className="surface rounded-2xl p-4 md:p-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <p className="min-w-0 flex-1 truncate">
            {rangeLabel}
            {filterCount > 0 && `, ${filterCount} ${filterCount === 1 ? "filter" : "filters"}`}
          </p>
          <span aria-live="polite" className={cn("text-xs", slow && "text-warning")}>
            {updating ? (slow ? "Slow connection, still loading" : "Updating") : ""}
          </span>
          {filterCount > 0 && (
            <button type="button" onClick={filters.clearAll} className="min-h-11 rounded-full px-2 font-medium text-foreground hover:text-primary md:min-h-0" aria-label="Clear all filters">
              Clear all
            </button>
          )}
        </div>
        {date === null && (
          <p className="text-xs text-subtle">
            {formatYmd(allWindow.startDate)} to {formatYmd(allWindow.endDate)}
          </p>
        )}
        {totals ? (
          <div className={cn("mt-3 grid grid-cols-2 gap-x-4 gap-y-3 transition-opacity duration-300 md:grid-cols-[1.6fr_1fr_1fr] md:items-end", updating && "opacity-60")}>
            <div className="col-span-2 md:col-span-1">
              <p className="text-sm text-muted-foreground">
                Net, {totals.matchedCount} {totals.matchedCount === 1 ? "transaction" : "transactions"}
              </p>
              <AnimatedMoney amountMinor={Math.abs(totals.netMinor)} currency={currency} kind={totals.netMinor < 0 ? "expense" : "income"} className="text-3xl font-semibold md:text-4xl" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Spent</p>
              <Money amountMinor={totals.expenseTotalMinor} currency={currency} kind="expense" className="text-lg font-semibold" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Received</p>
              <Money amountMinor={totals.incomeTotalMinor} currency={currency} kind="income" className="text-lg font-semibold" />
            </div>
          </div>
        ) : results.status === "error" ? null : results.totalsError ? (
          <p className="mt-3 text-sm text-expense">
            Couldn't load totals.{" "}
            <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={() => void results.refetch()}>
              Retry
            </button>
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-[1.6fr_1fr_1fr]" aria-hidden>
            <Skeleton className="col-span-2 h-14 md:col-span-1" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
        {filters.sort.length > 0 && !isDatePrimarySort(filters.sort) && <p className="mt-3 text-xs text-subtle">Sorted by {describeSort(filters.sort)}</p>}
        {results.totalCount > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <p className="text-xs text-subtle">
              Showing <span className="money">{results.rows.length}</span> of <span className="money">{results.totalCount}</span>
            </p>
            <button
              type="button"
              onClick={() => filters.setSort(reverseSort(filters.sort))}
              aria-label={`Order: ${orderLabel}. Reverse it.`}
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-xs font-semibold text-primary md:min-h-8"
            >
              <motion.span animate={{ rotate: primarySort.direction === "ASC" ? 180 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} className="inline-flex">
                <Icon name="arrow-down" size={14} weight="bold" />
              </motion.span>
              {orderLabel}
            </button>
          </div>
        )}
      </section>

      {/* ---- results, with the detail beside them on desktop */}
      <div className={cn("grid gap-6", split && "grid-cols-[minmax(0,1fr)_minmax(340px,400px)] items-start")}>
        <div className="min-w-0 space-y-3">
          {staleError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3">
              <Icon name="cloud-outline" size={20} className="mt-0.5 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Showing saved results</p>
                <p className="text-sm text-muted-foreground">{getApiErrorMessage(results.error, "Couldn't refresh.")}</p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={() => void results.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {results.status === "error" ? (
            <ErrorState error={results.error} title="Couldn't load transactions" onRetry={() => void results.refetch()} />
          ) : !showRows ? (
            <ResultsSkeleton table={isDesktop} />
          ) : results.rows.length === 0 ? (
            <EmptyState
              title={empty.title}
              body={empty.body}
              action={
                <Button className="glow h-11 rounded-full px-5 font-semibold" onClick={empty.run}>
                  {empty.label}
                </Button>
              }
            />
          ) : (
            <div key={`${scope}:${revealKey.current}`} className={cn("transition-opacity duration-300", updating && !results.rowsCurrent && "opacity-50")}>
              {isDesktop ? (
                <ActivityTable
                  rows={results.rows}
                  sort={filters.sort}
                  onSort={filters.setSort}
                  currency={currency}
                  categories={categoryMap}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    if (!txId || id === txId) return;
                    const tx = results.rows.find((r) => r.id === id);
                    if (tx) seedDetail(tx);
                    navigate(`/activity/${id}`, { replace: true });
                  }}
                  onOpen={openTx}
                  onEdit={editTx}
                  onDelete={deleteTx}
                  keyboard={sheet === null}
                />
              ) : (
                <ActivityList
                  rows={rows}
                  currency={currency}
                  categories={categoryMap}
                  showDay={!isDatePrimarySort(filters.sort)}
                  openRowId={openRowId}
                  onOpenRowChange={setOpenRowId}
                  handlers={handlers}
                />
              )}
            </div>
          )}

          {results.isFetchingNextPage && <ResultsSkeleton table={isDesktop} />}
          {showRows && !results.hasNextPage && results.rows.length > 0 && results.rows.length < results.totalCount && (
            <p className="py-4 text-sm text-muted-foreground">
              Only the first {results.rows.length.toLocaleString()} matches can be listed. Narrow the filters or change the sort to see the rest.
            </p>
          )}
          <LoadMore enabled={showRows && Boolean(results.hasNextPage) && !results.isFetchingNextPage} onLoad={loadMore} />
        </div>

        <AnimatePresence>
          {split && txId && (
            <motion.aside
              key="detail"
              aria-label="Transaction details"
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="surface sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-2xl p-5"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">{editing ? "Edit transaction" : "Transaction"}</h2>
                <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Close details" onClick={closeDetail}>
                  <Icon name="close" size={18} />
                </Button>
              </div>
              <TransactionDetail txId={txId} editing={editing} onEditingChange={setEditing} onClose={closeDetail} onOpen={(id) => navigate(`/activity/${id}`, { replace: true })} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ---- phone detail sheet */}
      {!isDesktop && (
        <ResponsiveDialog open={Boolean(txId)} onOpenChange={(o) => !o && closeDetail()} title={editing ? "Edit transaction" : "Transaction"}>
          {lastTxId.current && (
            <div className="pb-4">
              <TransactionDetail
                txId={lastTxId.current}
                editing={editing}
                onEditingChange={setEditing}
                onClose={closeDetail}
                onOpen={(id) => navigate(`/activity/${id}`, { replace: true })}
              />
            </div>
          )}
        </ResponsiveDialog>
      )}

      <RowActionsSheet tx={menuTx} onClose={() => setMenuTx(null)} onOpen={openTx} onEdit={editTx} onDuplicate={(tx) => void duplicateTx(tx)} onDelete={deleteTx} />

      {/* ---- filter sheets */}
      <CustomRangeSheet
        open={sheet === "custom"}
        onClose={() => setSheet(null)}
        initial={date ? { startDate: date.startDate, endDate: date.endDate } : { startDate: addDaysYmd(today, -6), endDate: today }}
        onApply={(range) => filters.setDate(range)}
        onReset={filters.reset}
      />
      <CategoryFilterSheet open={sheet === "category"} onClose={() => setSheet(null)} options={bookCategories} selected={quick.categoryIds} onChange={filters.setCategories} />
      <AmountFilterSheet open={sheet === "amount"} onClose={() => setSheet(null)} currency={currency} min={quick.amountMinMinor} max={quick.amountMaxMinor} onChange={filters.setAmount} />
      <PaymentFilterSheet open={sheet === "payment"} onClose={() => setSheet(null)} methods={quick.paymentMethods} unspecified={quick.paymentUnspecified} onChange={filters.setPayment} />
      <AdvancedFilterSheet
        open={sheet === "advanced"}
        onClose={() => {
          setSheet(null);
          setProposal(null);
        }}
        onApplied={() => proposal && proposal.sort.length > 0 && filters.setSort(proposal.sort)}
        scope={scope}
        model={filters.modelContext}
        describeContext={describeContext}
        categories={bookCategories}
        initialRoot={proposal?.root ?? null}
        limitationNotice={proposal?.limitation ?? null}
      />
      <DescribeFilterSheet
        open={sheet === "describe"}
        onClose={() => setSheet(null)}
        bookId={bookId}
        currency={currency}
        onProposal={(root, sort, limitation) => {
          setProposal({ root, sort, limitation });
          setSheet("advanced");
        }}
      />
      <SortSheet open={sheet === "sort"} onClose={() => setSheet(null)} scope={scope} />
    </div>
  );
}
