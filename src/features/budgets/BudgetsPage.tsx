import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/app/overlays";
import { useCategoriesStore } from "@/features/categories/store";
import type { TransactionType } from "@/shared/types/models";
import { CategoryIcon, Icon } from "@/shared/ui/Icon";
import { AnimatedMoney, Money } from "@/shared/ui/Money";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/states";
import { formatMonthYmd } from "@/shared/utils/ledgerDate";
import { useBudgetsStore } from "./store";
import { useBookMonth, useMonthlySummary } from "./useMonthlySummary";

type Tile = {
  key: string;
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  spent: number | null;
  budget: number;
  ghost?: boolean;
};

const spring = { type: "spring", stiffness: 120, damping: 24 } as const;

/** The budget ring: stroke-dashoffset (via pathLength) springs to the share used. */
function Ring({ progress, over }: { progress: number; over: boolean }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 120 120" className="size-28 -rotate-90 md:size-32" aria-hidden>
      <circle cx="60" cy="60" r="50" fill="none" strokeWidth="12" className="stroke-surface-2" />
      <motion.circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        className={over ? "stroke-expense" : "stroke-primary"}
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: Math.max(0.001, progress) }}
        transition={spring}
      />
    </svg>
  );
}

function Hero({ budget, spent, currency, month, onRetry }: { budget: number; spent: number | null; currency: string; month: string; onRetry?: () => void }) {
  const progress = spent !== null && budget > 0 ? spent / budget : 0;
  const over = spent !== null && budget > 0 && spent > budget;
  return (
    <section aria-labelledby="budget-total" className="surface grid gap-5 rounded-2xl p-5 md:grid-cols-[minmax(0,1fr)_auto] md:p-7">
      <div className="min-w-0">
        <h2 id="budget-total" className="text-sm text-muted-foreground">Total monthly budget</h2>
        <AnimatedMoney amountMinor={budget} currency={currency} kind="neutral" className="mt-2 block text-4xl font-semibold md:text-5xl" />
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon name="calendar-outline" size={16} className="text-primary" /> {formatMonthYmd(`${month}-01`)}
        </p>
        <dl className="mt-5 grid max-w-md grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="text-xs text-muted-foreground">Spent</dt>
            <dd className="mt-1 font-semibold">{spent === null ? "Unavailable" : <AnimatedMoney amountMinor={spent} currency={currency} kind="neutral" />}</dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className={over ? "text-xs text-expense" : "text-xs text-muted-foreground"}>{over ? "Over budget" : "Remaining"}</dt>
            <dd className="mt-1 font-semibold">
              {spent === null ? "Unavailable" : <AnimatedMoney amountMinor={Math.abs(budget - spent)} currency={currency} kind="neutral" />}
            </dd>
          </div>
        </dl>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4 h-9 rounded-full px-4" onClick={onRetry}>
            <Icon name="refresh" size={14} /> Retry monthly totals
          </Button>
        )}
      </div>
      <div className="relative grid place-items-center justify-self-start md:justify-self-end" role="img" aria-label={spent === null ? "Budget use unavailable" : `${Math.round(Math.min(1, progress) * 100)}% of budget used`}>
        <Ring progress={Math.min(1, progress)} over={over} />
        <span className="absolute text-center">
          <span className="money block text-xl font-semibold">{spent === null || budget === 0 ? "--" : `${Math.round(progress * 100)}%`}</span>
          <span className="block text-xs text-muted-foreground">used</span>
        </span>
      </div>
    </section>
  );
}

function TileCard({ tile, currency, index, month }: { tile: Tile; currency: string; index: number; month: string }) {
  const reduce = useReducedMotion();
  const show = useOverlay((s) => s.show);
  const canBudget = tile.type === "EXPENSE";
  const hasBudget = tile.budget > 0;
  const spent = tile.spent ?? 0;
  const left = tile.budget - spent;
  const over = hasBudget && tile.spent !== null && left < 0;
  const ratio = hasBudget && tile.spent !== null ? spent / tile.budget : 0;
  const tone = over ? "bg-expense" : ratio >= 0.85 ? "bg-warning" : "bg-primary";

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 30, delay: Math.min(index, 12) * 0.035 }}
      className="surface flex flex-col rounded-xl transition-transform duration-200 lg:hover:-translate-y-1"
    >
      <button
        type="button"
        onClick={() => show(tile.ghost ? { kind: "category-editor", type: "EXPENSE" } : { kind: "category-editor", id: tile.categoryId })}
        aria-label={tile.ghost ? `Create a category for ${tile.name}` : `Edit ${tile.name}`}
        className="flex flex-1 flex-col rounded-xl p-4 text-left"
      >
        <span className="flex items-center justify-between">
          <CategoryIcon icon={tile.icon} color={tile.color} size={40} />
          <Icon name="create-outline" size={16} className="text-muted-foreground" />
        </span>
        <span className="mt-4 truncate font-semibold">{tile.name}</span>
        {!canBudget ? (
          <span className="mt-1 text-sm text-muted-foreground">Income category</span>
        ) : (
          <>
            <span className="mt-1 text-sm text-muted-foreground">
              {tile.spent === null ? "Spending unavailable" : <><Money amountMinor={spent} currency={currency} className="text-foreground" /> spent</>}
            </span>
            <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.span
                className={cn("block h-full origin-left rounded-full", tone)}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: Math.min(1, ratio) }}
                transition={spring}
              />
            </span>
            <span className="mt-3 text-sm">
              {hasBudget && tile.spent !== null ? (
                <>
                  <Money amountMinor={Math.abs(left)} currency={currency} className="font-semibold" />{" "}
                  <span className={over ? "text-expense" : ratio >= 0.85 ? "text-warning" : "text-primary"}>{over ? "over" : "left"}</span>
                </>
              ) : hasBudget ? (
                <>
                  <Money amountMinor={tile.budget} currency={currency} className="font-semibold" /> <span className="text-muted-foreground">budget</span>
                </>
              ) : (
                <span className="text-muted-foreground">No budget set</span>
              )}
            </span>
          </>
        )}
      </button>
      {canBudget && (
        <button
          type="button"
          onClick={() => show({ kind: "budget-editor", categoryId: tile.categoryId, month })}
          className="mx-2 mb-2 flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-primary transition-colors hover:bg-primary-soft active:scale-[0.98]"
        >
          <Icon name={hasBudget ? "create-outline" : "add"} size={16} /> {hasBudget ? "Edit budget" : "Set budget"}
        </button>
      )}
    </motion.li>
  );
}

export function BudgetsPage() {
  const show = useOverlay((s) => s.show);
  const { bookId, book, month } = useBookMonth();
  const categories = useCategoriesStore((s) => s.categories);
  const catsLoading = useCategoriesStore((s) => s.isLoading);
  const catsError = useCategoriesStore((s) => s.error);
  const budgets = useBudgetsStore((s) => s.budgets);
  const summary = useMonthlySummary(bookId, month);
  const [query, setQuery] = useState("");
  const currency = summary.data?.currencyCode ?? book?.currencyCode ?? "USD";

  const reload = () => {
    if (!bookId) return;
    void useCategoriesStore.getState().loadCategories(bookId).catch(() => {});
    void useBudgetsStore.getState().loadBudgets(bookId, month).catch(() => {});
  };
  useEffect(reload, [bookId, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthBudgets = useMemo(() => budgets.filter((b) => b.bookId === bookId && b.month === month), [budgets, bookId, month]);

  const tiles = useMemo(() => {
    const budgetBy = new Map(monthBudgets.map((b) => [b.categoryId, b]));
    const spentBy = new Map(
      (summary.data?.byCategory ?? []).filter((c) => c.type === "EXPENSE").map((c) => [c.categoryId, c]),
    );
    const spentOf = (id: string) => (summary.data ? (spentBy.get(id)?.totalMinor ?? 0) : null);
    const own = categories.filter((c) => c.bookId === bookId);
    const out: Tile[] = own.map((c) => ({
      key: c.id,
      categoryId: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
      spent: c.type === "EXPENSE" ? spentOf(c.id) : null,
      budget: budgetBy.get(c.id)?.amountMinor ?? 0,
    }));
    // Spend or a budget for a category the list doesn't have (deleted, or not loaded yet): still counted, shown as a ghost.
    for (const id of new Set([...spentBy.keys(), ...budgetBy.keys()])) {
      if (own.some((c) => c.id === id)) continue;
      out.push({
        key: `ghost_${id}`,
        categoryId: id,
        name: budgetBy.get(id)?.categoryName ?? spentBy.get(id)?.categoryName ?? "Uncategorized",
        icon: "pricetag-outline",
        color: "#A8B0BC",
        type: "EXPENSE",
        spent: spentOf(id),
        budget: budgetBy.get(id)?.amountMinor ?? 0,
        ghost: true,
      });
    }
    const q = query.trim().toLowerCase();
    return (q ? out.filter((t) => t.name.toLowerCase().includes(q)) : out).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, bookId, monthBudgets, summary.data, query]);

  const totalBudget = monthBudgets.reduce((sum, b) => sum + b.amountMinor, 0);
  const totalSpent = summary.data?.expenseTotalMinor ?? null;
  const hasAny = categories.some((c) => c.bookId === bookId);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Categories & budgets</h1>
        <Button onClick={() => show({ kind: "category-editor" })} className="h-10 rounded-full px-4 font-semibold active:scale-[0.98]">
          <Icon name="add" size={16} weight="bold" /> New category
        </Button>
      </header>

      {summary.isPending && !summary.data && summary.fetchStatus !== "idle" ? (
        <Skeleton className="h-56 w-full rounded-2xl" />
      ) : (
        <Hero
          budget={totalBudget}
          spent={totalSpent}
          currency={currency}
          month={month}
          onRetry={summary.isError ? () => void summary.refetch() : undefined}
        />
      )}

      <div className="relative max-w-md">
        <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          aria-label="Search categories"
          className="h-11 rounded-full pr-4 pl-10"
        />
      </div>

      {!hasAny && catsLoading ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-48 rounded-xl" />
            </li>
          ))}
        </ul>
      ) : !hasAny && catsError && tiles.length === 0 ? (
        <ErrorState error={catsError} title="Couldn't load categories" onRetry={reload} />
      ) : tiles.length === 0 ? (
        <EmptyState
          icon="grid-outline"
          title={query.trim() ? "No categories match" : "No categories yet"}
          body={query.trim() ? "Try a different search." : "Create a category to start tracking spending against a budget."}
          action={
            query.trim() ? undefined : (
              <Button className="rounded-full" onClick={() => show({ kind: "category-editor" })}>
                Create category
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <TileCard key={t.key} tile={t} currency={currency} index={i} month={month} />
          ))}
        </ul>
      )}
    </div>
  );
}
