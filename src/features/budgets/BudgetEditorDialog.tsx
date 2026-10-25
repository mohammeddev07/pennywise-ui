import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategoriesStore } from "@/features/categories/store";
import { getApiErrorMessage } from "@/shared/api/errors";
import { queryClient } from "@/shared/api/queryClient";
import { CategoryIcon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { EmptyState } from "@/shared/ui/states";
import { currencyMinorUnitDigits, minorToMajor, parseAmountToMinor } from "@/shared/utils/formatCurrency";
import { formatMonthYmd } from "@/shared/utils/ledgerDate";
import { useBudgetsStore } from "./store";
import { useBookMonth, useMonthlySummary } from "./useMonthlySummary";

export function BudgetEditorDialog({
  open,
  onOpenChange,
  categoryId,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  month: string;
}) {
  const fieldId = useId();
  const reduce = useReducedMotion();
  const { bookId, book } = useBookMonth();
  const currency = book?.currencyCode ?? "USD";
  const category = useCategoriesStore((s) => s.categories.find((c) => c.id === categoryId && c.bookId === bookId));
  const existing = useBudgetsStore((s) =>
    s.budgets.find((b) => b.bookId === bookId && b.categoryId === categoryId && b.month === month),
  );
  const summary = useMonthlySummary(bookId, month);
  const spent =
    summary.data?.byCategory.find((c) => c.categoryId === categoryId && c.type === "EXPENSE")?.totalMinor ??
    existing?.spentMinor ??
    null;

  const digits = currencyMinorUnitDigits(currency);
  const [value, setValue] = useState(existing ? minorToMajor(existing.amountMinor, currency).toFixed(digits) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (bookId && month) void useBudgetsStore.getState().loadBudgets(bookId, month).catch(() => {});
  }, [bookId, month]);
  // The list can land after open; fill the field once if the user hasn't typed.
  useEffect(() => {
    if (existing) setValue((v) => v || minorToMajor(existing.amountMinor, currency).toFixed(digits));
  }, [existing, currency, digits]);

  const minor = parseAmountToMinor(value, currency);
  const invalid = value.trim() !== "" && (minor === null || minor === 0);
  const canSave = category?.type === "EXPENSE" && minor !== null && minor > 0 && !saving;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["summary", bookId, month] }),
      queryClient.invalidateQueries({ queryKey: ["budgets", bookId] }),
    ]);

  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setSaving(true);
    setError("");
    try {
      await work();
      void refresh();
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
    } finally {
      setSaving(false);
    }
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSave || minor === null) return;
    void run(() => useBudgetsStore.getState().upsertBudget(bookId, categoryId, month, minor, existing?.version), "Couldn't save this budget.");
  };
  const reset = () => {
    if (!existing || saving) return;
    void run(() => useBudgetsStore.getState().deleteBudget(bookId, categoryId, month, existing.version), "Couldn't reset this budget.");
  };

  const monthLabel = formatMonthYmd(`${month}-01`);
  const usable = category?.type === "EXPENSE";
  const progress = existing && spent !== null ? Math.min(1, spent / Math.max(1, existing.amountMinor)) : 0;
  const over = existing && spent !== null && spent > existing.amountMinor;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? `${category.name} budget` : "Budget"}
      description={`Monthly target for ${monthLabel}.`}
      footer={
        usable ? (
          <>
            {existing && (
              <Button type="button" variant="outline" className="h-11 rounded-full px-5" disabled={saving} onClick={reset}>
                Reset budget
              </Button>
            )}
            <Button type="submit" form={fieldId} disabled={!canSave} className="glow h-11 rounded-full px-6 font-semibold active:scale-[0.98]">
              {saving ? "Saving" : "Save budget"}
            </Button>
          </>
        ) : undefined
      }
    >
      {!category ? (
        <EmptyState icon="pie-chart-outline" title="Category not found" body="Open a budget from a category on the Budgets page." />
      ) : !usable ? (
        <EmptyState icon="pie-chart-outline" title="Budgets are for expenses" body="Income categories don't have a spending budget." />
      ) : (
        <form id={fieldId} onSubmit={save} className="space-y-6 pb-2">
          <div className="surface rounded-xl p-4">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={category.icon} color={category.color} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{category.name}</p>
                <p className="text-sm text-muted-foreground">{monthLabel}</p>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {spent === null ? "Spending unavailable" : <><Money amountMinor={spent} currency={currency} className="font-semibold text-foreground" /> spent</>}
              </span>
              <span className="text-muted-foreground">
                {existing ? <>of <Money amountMinor={existing.amountMinor} currency={currency} /></> : "No budget set"}
              </span>
            </div>
            {existing && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={over ? "h-full origin-left rounded-full bg-expense" : "h-full origin-left rounded-full bg-primary"}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: progress }}
                  transition={{ type: "spring", stiffness: 120, damping: 24 }}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-amount`}>Monthly budget ({currency})</Label>
            <Input
              id={`${fieldId}-amount`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode={digits === 0 ? "numeric" : "decimal"}
              placeholder={digits === 0 ? "0" : `0.${"0".repeat(digits)}`}
              autoComplete="off"
              autoFocus
              aria-invalid={invalid}
              aria-describedby={`${fieldId}-hint`}
              className="money h-12 rounded-lg px-3 text-lg"
            />
            <p id={`${fieldId}-hint`} className={invalid ? "text-sm text-expense" : "text-sm text-muted-foreground"}>
              {invalid ? `Enter an amount above zero in ${currency}${digits === 0 ? ", without decimals" : ""}.` : "Drives budget progress and over-spend warnings."}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
        </form>
      )}
    </ResponsiveDialog>
  );
}
