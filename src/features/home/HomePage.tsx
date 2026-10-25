import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/app/overlays";
import { useAuthStore } from "@/features/auth/store";
import { useBooksStore } from "@/features/books/store";
import { useBookCurrency } from "@/features/books/useBookCurrency";
import { useBudgetsStore } from "@/features/budgets/store";
import { useCategoriesStore } from "@/features/categories/store";
import { useHomeSnapshot, useSaveHomeSnapshot } from "@/features/home-snapshot/useHomeSnapshot";
import { BreakdownRow } from "@/features/insights/BreakdownRow";
import { useSettingsStore } from "@/features/settings/store";
import { getActivityScroll } from "@/features/transactions/activityScroll";
import { drillRoot, emptyRoot } from "@/features/transactions/filterModel";
import { makeScope, useFilterStore } from "@/features/transactions/filterStore";
import { useAccountScope, useRecentTransactions, useWindowAnalysis } from "@/features/transactions/queries";
import * as summaryApi from "@/shared/api/summary";
import { Icon } from "@/shared/ui/Icon";
import { AnimatedMoney, Money } from "@/shared/ui/Money";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/states";
import { addDaysYmd, endOfMonthYmd, formatMonthYmd, todayInTimeZone } from "@/shared/utils/ledgerDate";
import { budgetItems, greeting, monthKey, topSpending, weekSpend, type BudgetItem } from "./homeData";
import { Panel, PanelLink, Reveal } from "./Panel";
import { TransactionRow } from "./TransactionRow";
import { WeekChart } from "./WeekChart";

const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short" });

function RowSkeletons({ n }: { n: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** This month's money in or out; the arrow icon means color is never the only cue. */
function FlowStat({ kind, label, amountMinor, currency }: { kind: "income" | "expense"; label: string; amountMinor: number; currency: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", kind === "income" ? "bg-income-soft text-income" : "bg-expense-soft text-expense")}>
        <Icon name={kind === "income" ? "trending-up" : "trending-down"} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <Money amountMinor={amountMinor} currency={currency} kind={kind} className="font-semibold" />
      </span>
    </div>
  );
}

/** How much of this month's income is already spent: one bar, one sentence. */
function SpendShare({ spent, income }: { spent: number; income: number }) {
  const reduce = useReducedMotion();
  const share = spent / income;
  const over = share > 1;
  return (
    <div className="mt-5">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <motion.div
          className={cn("h-full origin-left rounded-full", over ? "bg-expense" : share > 0.8 ? "bg-warning" : "bg-primary")}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: Math.min(1, share) }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.15 }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {over ? `Spent ${Math.round((share - 1) * 100)}% more than you earned this month` : `${Math.round(share * 100)}% of this month's income spent`}
      </p>
    </div>
  );
}

function BudgetTile({ item, currency, onOpen }: { item: BudgetItem; currency: string; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const remaining = item.budgetMinor - item.spentMinor;
  const over = remaining < 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Edit ${item.categoryName} budget`}
      className="min-w-0 rounded-lg bg-surface-2 p-4 text-left ring-1 ring-transparent transition hover:-translate-y-0.5 hover:ring-border-strong active:scale-[0.98]"
    >
      <span className="block truncate text-sm font-semibold">{item.categoryName}</span>
      <span className="mt-1 flex items-baseline gap-1 text-xs text-muted-foreground">
        <Money amountMinor={item.spentMinor} currency={currency} className="text-sm" /> spent
      </span>
      <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-background">
        <motion.span
          className={cn("block h-full origin-left rounded-full", over ? "bg-expense" : "bg-primary")}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: Math.min(1, item.spentMinor / Math.max(1, item.budgetMinor)) }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </span>
      <span className="mt-3 flex items-baseline gap-1 text-sm">
        <Money amountMinor={Math.abs(remaining)} currency={currency} />
        <span className={over ? "font-semibold text-expense" : "text-muted-foreground"}>{over ? "over" : "left"}</span>
      </span>
    </button>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const show = useOverlay((s) => s.show);
  const email = useAuthStore((s) => s.user?.email);
  const savedName = useSettingsStore((s) => s.displayName);
  const { accountId, bookId } = useAccountScope();
  const book = useBooksStore((s) => s.books.find((b) => b.id === s.selectedBookId));
  const budgets = useBudgetsStore((s) => s.budgets);
  const categories = useCategoriesStore((s) => s.categories);
  const bookCurrency = useBookCurrency();

  const month = useMemo(() => monthKey(), []);
  const today = todayInTimeZone(book?.timezone);
  const week = useMemo(() => ({ startDate: addDaysYmd(today, -6), endDate: today }), [today]);

  // The last data seen for exactly this account, book, month and week paints at once; the queries
  // still refetch and keep it on screen if the server is slow or asleep.
  const ctx = { accountId, bookId, month, weekStart: week.startDate, weekEnd: week.endDate };
  const snap = useHomeSnapshot(ctx);
  const seed = <T,>(data: T | undefined) => (snap && data ? { data, updatedAt: snap.savedAt } : undefined);

  const balance = useQuery({
    queryKey: ["balance", bookId],
    queryFn: () => summaryApi.getBalance(bookId),
    initialData: snap?.balance,
    initialDataUpdatedAt: snap?.savedAt,
    enabled: Boolean(bookId),
  });
  const summary = useQuery({
    queryKey: ["summary", bookId, month],
    queryFn: () => summaryApi.getMonthlySummary(bookId, month),
    initialData: snap?.summary,
    initialDataUpdatedAt: snap?.savedAt,
    enabled: Boolean(bookId),
  });
  const weekQuery = useWindowAnalysis(week, "DAY", undefined, seed(snap?.weekAnalysis));
  const recent = useRecentTransactions(4, undefined, seed(snap?.recent));

  useSaveHomeSnapshot(ctx, { balance: balance.data, summary: summary.data, weekAnalysis: weekQuery.data, recent: recent.data });

  const currency = balance.data?.currencyCode ?? summary.data?.currencyCode ?? bookCurrency;
  const days = useMemo(() => weekSpend(weekQuery.data, week.startDate), [weekQuery.data, week.startDate]);
  const weekTotal = days.reduce((sum, d) => sum + d.value, 0);
  const top = useMemo(() => topSpending(summary.data), [summary.data]);
  const budgetRows = useMemo(() => budgetItems(summary.data, budgets, bookId, month).slice(0, 6), [summary.data, budgets, bookId, month]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // "avery.lindqvist@..." greets "Avery", not "Avery.lindqvist".
  const prefix = email?.split("@")[0]?.split(/[._+-]/)[0]?.trim();
  const name = savedName || (prefix ? prefix[0].toUpperCase() + prefix.slice(1) : book?.name ?? "");
  const monthShort = MONTH_SHORT.format(new Date());

  /** Opens Activity on this month's expenses in one category: the rows behind the figure. */
  const drillCategory = (categoryId: string, categoryName: string) => {
    const start = `${month}-01`;
    const next = drillRoot(emptyRoot(), { window: { startDate: start, endDate: endOfMonthYmd(start) }, categoryId, type: "EXPENSE" });
    if (!next) return;
    const scope = makeScope(accountId, bookId);
    useFilterStore.getState().drillInto(scope, next, `${categoryName} · ${formatMonthYmd(start)}`, getActivityScroll(scope));
    navigate("/activity");
  };

  const showTop = summary.isPending || (summary.isError && !summary.data) || top.rows.length > 0;
  const income = summary.data?.incomeTotalMinor;
  const spent = summary.data?.expenseTotalMinor;

  return (
    <div className="space-y-6">
      <Reveal i={0}>
        <p className="text-sm text-muted-foreground">{greeting(new Date().getHours())},</p>
        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{name}</h1>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Balance: the single strongest element on the screen. */}
        <Reveal i={1} className="min-w-0 lg:col-span-7">
          {balance.isPending ? (
            <Skeleton className="h-72 rounded-2xl" />
          ) : !balance.data ? (
            <div className="surface rounded-2xl">
              <ErrorState
                error={balance.error}
                title="Couldn't load your balance"
                onRetry={() => {
                  void balance.refetch();
                  void summary.refetch();
                }}
              />
            </div>
          ) : (
            <section
              aria-label="Balance"
              className="surface h-full rounded-2xl p-6 lg:p-8"
              style={{ backgroundImage: "radial-gradient(120% 140% at 0% 0%, var(--primary-soft), transparent 62%)" }}
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Total balance
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">{currency}</span>
              </div>
              <AnimatedMoney
                amountMinor={balance.data.balanceMinor}
                currency={currency}
                kind="balance"
                className="mt-2 block text-[clamp(2.25rem,9vw,3.75rem)] leading-tight font-semibold"
              />
              <div className="my-6 h-px bg-border" />
              {income === undefined || spent === undefined ? (
                <Skeleton className="h-11" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FlowStat kind="income" label={`Income in ${monthShort}`} amountMinor={income} currency={currency} />
                    <FlowStat kind="expense" label={`Spent in ${monthShort}`} amountMinor={spent} currency={currency} />
                  </div>
                  {income > 0 && <SpendShare spent={spent} income={income} />}
                </>
              )}
            </section>
          )}
        </Reveal>

        <Panel
          i={2}
          className="lg:col-span-5"
          title="This week"
          action={
            weekQuery.data && (
              <span className="text-sm text-muted-foreground">
                <Money amountMinor={weekTotal} currency={currency} className="font-semibold text-foreground" /> spent
              </span>
            )
          }
        >
          {weekQuery.isPending ? (
            <Skeleton className="h-44" />
          ) : !weekQuery.data ? (
            <ErrorState error={weekQuery.error} onRetry={() => void weekQuery.refetch()} />
          ) : (
            <WeekChart data={days} currency={currency} />
          )}
        </Panel>

        {showTop && (
          <Panel i={3} className="lg:col-span-5" title="Top spending" action={<PanelLink to="/insights">Insights</PanelLink>}>
            {summary.isPending ? (
              <RowSkeletons n={4} />
            ) : !summary.data ? (
              <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
            ) : (
              <div className="space-y-1">
                {top.rows.map((row) => {
                  const cat = categoryById.get(row.categoryId);
                  return (
                    <BreakdownRow
                      key={row.categoryId}
                      name={row.categoryName}
                      icon={cat?.icon}
                      color={cat?.color ?? "#A8B0BC"}
                      amountMinor={row.totalMinor}
                      currency={currency}
                      share={top.total > 0 ? row.totalMinor / top.total : 0}
                      onClick={() => drillCategory(row.categoryId, row.categoryName)}
                    />
                  );
                })}
              </div>
            )}
          </Panel>
        )}

        <Panel i={4} className={showTop ? "lg:col-span-7" : "lg:col-span-12"} title="Recent" action={<PanelLink to="/activity">View all</PanelLink>}>
          {recent.isPending ? (
            <RowSkeletons n={4} />
          ) : !recent.data ? (
            <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
          ) : recent.data.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              body="Your transactions will appear here."
              action={
                <Button className="glow rounded-full" onClick={() => show({ kind: "add-transaction" })}>
                  <Icon name="add" size={16} weight="bold" /> Add transaction
                </Button>
              }
            />
          ) : (
            <div className="space-y-1">
              {recent.data.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} currency={currency} today={today} />
              ))}
            </div>
          )}
        </Panel>

        {budgetRows.length > 0 && (
          <Panel i={5} className="lg:col-span-12" title="Budgets" action={<PanelLink to="/budgets">Manage</PanelLink>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {budgetRows.map((item) => (
                <BudgetTile
                  key={item.categoryId}
                  item={item}
                  currency={currency}
                  onOpen={() => show({ kind: "budget-editor", categoryId: item.categoryId, month })}
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
