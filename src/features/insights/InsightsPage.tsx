import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/app/overlays";
import { useBookCurrency } from "@/features/books/useBookCurrency";
import { useCategoriesStore } from "@/features/categories/store";
import { Panel, Reveal } from "@/features/home/Panel";
import { getActivityScroll } from "@/features/transactions/activityScroll";
import { buildQuery, drillRoot, setQuickDate } from "@/features/transactions/filterModel";
import { useFilterStore } from "@/features/transactions/filterStore";
import { bucketLabel, categoryRows, insightsWindow, series, type InsightsBucket, type SeriesPoint } from "@/features/transactions/insights";
import { mapTransactionResponse } from "@/features/transactions/model";
import { useAnalysis } from "@/features/transactions/queries";
import { useActivityFilters } from "@/features/transactions/useActivityFilters";
import { getApiErrorMessage } from "@/shared/api/errors";
import { useIsDesktop } from "@/shared/hooks/useMediaQuery";
import type { CategoryTotal, TransactionType } from "@/shared/types/transactionQuery";
import { Icon } from "@/shared/ui/Icon";
import { AnimatedMoney, Money } from "@/shared/ui/Money";
import { Segmented } from "@/shared/ui/Segmented";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/states";
import { formatYmd } from "@/shared/utils/ledgerDate";
import { BreakdownRow } from "./BreakdownRow";
import { CategoryDonut } from "./CategoryDonut";
import { donutSlices, sliceIdFor } from "./insightsData";
import { PeriodChart } from "./PeriodChart";

const FALLBACK_COLOR = "#A8B0BC";
const countText = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}`;

function InsightsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <Skeleton className="col-span-2 h-28 rounded-xl lg:col-span-1" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

function StatTile({ i, label, amountMinor, currency, kind, className, note }: {
  i: number;
  label: string;
  amountMinor: number;
  currency: string;
  kind: "balance" | "income" | "expense";
  className?: string;
  note?: string;
}) {
  return (
    <Reveal i={i} className={cn("surface min-w-0 rounded-xl p-4 lg:p-5", className)}>
      <p className="text-sm text-muted-foreground">
        {label}
        {note && <span className="text-subtle">, {note}</span>}
      </p>
      <AnimatedMoney
        amountMinor={amountMinor}
        currency={currency}
        kind={kind}
        className={cn("mt-1 block font-semibold", kind === "balance" ? "text-3xl lg:text-4xl" : "text-xl lg:text-2xl")}
      />
    </Reveal>
  );
}

export function InsightsPage() {
  const navigate = useNavigate();
  const filters = useActivityFilters();
  const bookCurrency = useBookCurrency();
  const categories = useCategoriesStore((s) => s.categories);
  const drill = useFilterStore((s) => s.drills[filters.scope]);
  const isDesktop = useIsDesktop();

  const [bucket, setBucket] = useState<InsightsBucket>("MONTH");
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [bucketKey, setBucketKey] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  // One request: the shared applied filter, with Activity's date replaced by Insights' own window.
  const span = useMemo(() => insightsWindow(bucket, filters.today), [bucket, filters.today]);
  const query = useMemo(
    () => (filters.ready && filters.revision > 0 ? buildQuery(setQuickDate(filters.root, span), [], filters.today) : null),
    [filters.ready, filters.revision, filters.root, span, filters.today]
  );
  const analysisQuery = useAnalysis(query, bucket);
  // Previous figures stay on screen dimmed while a new window loads; never shown as the answer after an error.
  const analysis = analysisQuery.isPlaceholderData && analysisQuery.isError ? null : (analysisQuery.data ?? null);
  const updating = analysisQuery.isPlaceholderData || (analysisQuery.isFetching && !analysisQuery.isPending);

  const currency = analysis?.currencyCode ?? bookCurrency;
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const colorOf = (id: string) => categoryById.get(id)?.color || FALLBACK_COLOR;

  const rows = useMemo(() => (analysis ? categoryRows(analysis, type) : []), [analysis, type]);
  const selectedCategory = rows.find((r) => r.categoryId === categoryId) ?? null;
  const points = useMemo(
    () => (analysis ? series(analysis, type, selectedCategory?.categoryId ?? null) : []),
    [analysis, type, selectedCategory]
  );
  const selectedPoint = points.find((p) => p.key === bucketKey) ?? null;
  const slices = useMemo(() => donutSlices(rows, (id) => categoryById.get(id)?.color || FALLBACK_COLOR), [rows, categoryById]);

  const total = analysis ? (type === "EXPENSE" ? analysis.expenseTotalMinor : analysis.incomeTotalMinor) : 0;
  const largest = analysis?.largestExpense ? mapTransactionResponse(analysis.largestExpense) : null;
  const windowText = `${formatYmd(span.startDate)} - ${formatYmd(span.endDate)}`;
  const dateChipId = filters.root.children.find((c) => c.kind === "condition" && c.field === "occurredOn" && c.operator === "BETWEEN")?.id;
  const sharedChips = filters.chips.filter((c) => c.id !== dateChipId);
  const filtered = sharedChips.length > 0;
  const kindWord = type === "EXPENSE" ? "Spending" : "Income";
  const per = bucket === "MONTH" ? "month" : "year";
  const activeSlice = hoverId ?? (categoryId ? sliceIdFor(slices, categoryId) : null);

  /** Opens Activity on AND(shared filter, this window or period, category, type): the rows the figure counted. */
  const drillTo = (category: CategoryTotal | null, point: SeriesPoint | null) => {
    if (!analysis) return;
    const next = drillRoot(filters.root, {
      window: point ? { startDate: point.start, endDate: point.end } : analysis.window,
      categoryId: category?.categoryId ?? null,
      type,
    });
    if (!next) {
      useUndoToastStore.getState().showError(new Error("filter too deep"), "This filter is too nested to drill into. Simplify it in Activity first.");
      return;
    }
    const label = `${category?.categoryName ?? (type === "EXPENSE" ? "All spending" : "All income")} · ${point?.longLabel ?? windowText}`;
    useFilterStore.getState().drillInto(filters.scope, next, label, getActivityScroll(filters.scope));
    navigate("/activity");
  };

  const toggleCategory = (id: string) => setCategoryId((cur) => (cur === id ? null : id));

  const hasActivity = Boolean(analysis && analysis.matchedCount > 0);

  return (
    <div className="space-y-5">
      <Reveal i={0} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {windowText}, {bucket === "MONTH" ? "monthly" : "yearly"} in {currency}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Segmented
            label="Period"
            value={bucket}
            onChange={(v) => {
              setBucket(v);
              setBucketKey(null);
            }}
            options={[
              { value: "MONTH", label: "Months" },
              { value: "YEAR", label: "Years" },
            ]}
          />
          <Segmented
            label="Type"
            value={type}
            tone={(v) => (v === "EXPENSE" ? "expense" : "income")}
            onChange={(v) => {
              setType(v);
              setCategoryId(null);
              setBucketKey(null);
            }}
            options={[
              { value: "EXPENSE", label: "Spending" },
              { value: "INCOME", label: "Income" },
            ]}
          />
        </div>
      </Reveal>

      {drill && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <Icon name="filter" size={16} className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">Filtered from {drill.label}</span>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => useFilterStore.getState().restoreDrill(filters.scope)}>
            <Icon name="arrow-back" size={14} /> Back to previous filter
          </Button>
        </div>
      )}

      {filtered && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {sharedChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => filters.removeChip(chip.id)}
                aria-label={`Remove filter ${chip.label}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
              >
                {chip.label}
                <Icon name="close" size={14} />
              </button>
            ))}
          </div>
          <p className="text-xs text-subtle">Filters are shared with Activity. Insights uses its own date window.</p>
        </div>
      )}

      {analysis && analysisQuery.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">Showing saved figures.</span>{" "}
            <span className="text-muted-foreground">{getApiErrorMessage(analysisQuery.error, "Couldn't refresh.")}</span>
          </span>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => void analysisQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!analysis ? (
        analysisQuery.isError ? (
          <ErrorState error={analysisQuery.error} title="Couldn't load insights" onRetry={() => void analysisQuery.refetch()} />
        ) : (
          <InsightsSkeleton />
        )
      ) : !hasActivity ? (
        <EmptyState
          icon="stats-chart-outline"
          title={filtered ? "No matching transactions" : "Not enough activity yet"}
          body={filtered ? `Nothing in ${windowText} matches the shared filters.` : `No transactions fall inside ${windowText}.`}
          action={
            filtered ? (
              <Button variant="outline" className="rounded-full" onClick={filters.clearAll}>
                Clear filters
              </Button>
            ) : (
              <Button className="glow rounded-full" onClick={() => useOverlay.getState().show({ kind: "add-transaction" })}>
                <Icon name="add" size={16} weight="bold" /> Add transaction
              </Button>
            )
          }
        />
      ) : (
        <div className={cn("space-y-4 transition-opacity", updating && "opacity-60")} aria-busy={updating}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr] lg:gap-4">
            <StatTile
              i={1}
              className="col-span-2 lg:col-span-1"
              label="Net"
              note={updating ? "updating" : countText(analysis.matchedCount)}
              amountMinor={analysis.netMinor}
              currency={currency}
              kind="balance"
            />
            <StatTile i={2} label="Income" amountMinor={analysis.incomeTotalMinor} currency={currency} kind="income" />
            <StatTile i={3} label="Spent" amountMinor={analysis.expenseTotalMinor} currency={currency} kind="expense" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
            <Panel
              i={4}
              title={`${kindWord} by ${per}`}
              action={
                selectedCategory ? (
                  <button
                    type="button"
                    onClick={() => setCategoryId(null)}
                    className="-my-2 inline-flex min-h-11 max-w-[55%] items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    aria-label={`Showing ${selectedCategory.categoryName}. Show all categories`}
                  >
                    <span className="truncate">{selectedCategory.categoryName}</span>
                    <Icon name="close" size={14} />
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">All categories</span>
                )
              }
            >
              <PeriodChart
                key={`${bucket}|${type}|${selectedCategory?.categoryId ?? ""}`}
                points={points}
                currency={currency}
                selectedKey={bucketKey}
                onSelect={setBucketKey}
                brush={isDesktop && points.length > 6}
                height={isDesktop ? 300 : 220}
              />
              <p className="mt-2 px-1 text-xs text-subtle">
                Bars start at 0, in {currency}.{points.some((p) => p.partial) && " * Partial period: only part of it is inside the window."}
              </p>

              <div className="mt-4 rounded-lg bg-surface-2 px-4 py-3" aria-live="polite">
                {selectedPoint ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {selectedPoint.longLabel}
                        {selectedPoint.partial && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            (partial, {formatYmd(selectedPoint.start)} - {formatYmd(selectedPoint.end)})
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <Money amountMinor={selectedPoint.valueMinor} currency={currency} className="font-semibold text-foreground" />, {countText(selectedPoint.count)}
                      </p>
                    </div>
                    {selectedPoint.count > 0 ? (
                      <Button size="sm" className="rounded-full" onClick={() => drillTo(selectedCategory, selectedPoint)}>
                        View {selectedPoint.count} in Activity
                      </Button>
                    ) : (
                      <span className="text-sm text-subtle">Nothing in this period.</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a bar for its exact amount and transactions.</p>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {(selectedPoint || selectedCategory) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-muted-foreground"
                    onClick={() => {
                      setBucketKey(null);
                      setCategoryId(null);
                    }}
                  >
                    Clear selection
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
                  <Icon name="table" size={15} /> {showTable ? "Hide table" : "Show as table"}
                </Button>
              </div>

              {showTable && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Totals by {per} for every category, in {currency}. A star marks a partial period.</caption>
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th scope="col" className="px-2 py-2 font-medium">Period</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Spent</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Income</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Net</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {analysis.buckets.map((b) => (
                        <tr key={b.key} className={cn(b.key === bucketKey && "bg-surface-2")}>
                          <th scope="row" className="px-2 py-2 text-left font-medium whitespace-nowrap">
                            {/* The keyboard path to a period: chart bars only respond to pointer input. */}
                            <button
                              type="button"
                              aria-pressed={b.key === bucketKey}
                              onClick={() => setBucketKey(b.key === bucketKey ? null : b.key)}
                              className="rounded-md px-1 -mx-1 hover:text-primary"
                            >
                              {bucketLabel(b.key, true)}
                              {b.partial && "*"}
                            </button>
                          </th>
                          <td className="px-2 py-2 text-right"><Money amountMinor={b.expenseTotalMinor} currency={currency} /></td>
                          <td className="px-2 py-2 text-right"><Money amountMinor={b.incomeTotalMinor} currency={currency} /></td>
                          <td className="px-2 py-2 text-right"><Money amountMinor={b.netMinor} currency={currency} kind="balance" /></td>
                          <td className="money px-2 py-2 text-right">{b.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="grid min-w-0 gap-4">
              <Panel
                i={5}
                title={type === "EXPENSE" ? "Where it went" : "Where it came from"}
                action={<Money amountMinor={total} currency={currency} className="text-sm font-semibold" />}
              >
                {rows.length === 0 ? (
                  <p className="px-1 py-6 text-sm text-muted-foreground">
                    {type === "EXPENSE" ? "No spending" : "No income"} in this window{filtered ? " with these filters" : ""}.
                  </p>
                ) : (
                  <>
                    <CategoryDonut
                      slices={slices}
                      total={total}
                      currency={currency}
                      label={kindWord}
                      activeId={activeSlice}
                      onHover={setHoverId}
                      onSelect={toggleCategory}
                    />
                    <p className="mt-3 px-1 text-xs text-subtle">Select a category to plot it, then open its transactions.</p>
                    <div className="mt-2 space-y-1">
                      {rows.map((row) => {
                        const selected = row.categoryId === selectedCategory?.categoryId;
                        const sliceId = sliceIdFor(slices, row.categoryId);
                        return (
                          <BreakdownRow
                            key={`${row.categoryId}|${row.type}`}
                            name={row.categoryName}
                            icon={categoryById.get(row.categoryId)?.icon}
                            color={colorOf(row.categoryId)}
                            amountMinor={row.totalMinor}
                            currency={currency}
                            count={row.count}
                            share={total > 0 ? row.totalMinor / total : null}
                            shareLabel={type === "EXPENSE" ? "of filtered spending" : "of filtered income"}
                            selected={selected}
                            highlighted={hoverId === sliceId}
                            onClick={() => toggleCategory(row.categoryId)}
                            onHover={(on) => setHoverId(on ? sliceId : null)}
                            footer={
                              selected && (
                                <div className="px-3 pt-1 pb-2">
                                  <Button size="sm" className="rounded-full" onClick={() => drillTo(row, null)}>
                                    View {row.count} in Activity
                                  </Button>
                                </div>
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </Panel>

              {largest && (
                <Reveal i={6}>
                  <Link
                    to={`/activity/${largest.id}`}
                    aria-label={`Largest expense, ${largest.title || "Untitled"}. Open details`}
                    className="surface flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-surface-2 lg:p-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-muted-foreground">Largest expense</span>
                      <Money amountMinor={largest.amountMinor} currency={currency} kind="expense" className="mt-1 block text-2xl font-semibold" />
                      <span className="mt-1 block truncate text-sm">
                        {largest.title || "Untitled"} <span className="text-muted-foreground">on {formatYmd(largest.occurredOn)}</span>
                      </span>
                    </span>
                    <Icon name="chevron-forward" size={18} className="text-muted-foreground" />
                  </Link>
                </Reveal>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
