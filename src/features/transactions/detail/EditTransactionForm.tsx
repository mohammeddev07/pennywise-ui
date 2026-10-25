import type { QueryObserverResult } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCategoriesStore } from "@/features/categories/store";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/shared/api/errors";
import { CategoryIcon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { Segmented } from "@/shared/ui/Segmented";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { currencyMinorUnitDigits, currencySymbol, parseAmountToMinor } from "@/shared/utils/formatCurrency";
import { isValidYmd } from "@/shared/utils/ledgerDate";
import { updateTransaction } from "../actions";
import { buildEditPatch } from "../editPatch";
import { PAYMENT_OPTIONS, minorToDecimalText, zonedToIso } from "../filterModel";
import { isNotFoundError, isStaleVersionError, type PaymentMethod, type Transaction, type TransactionKind } from "../model";
import { Chip } from "../ui/Chip";
import { zonedParts } from "./zonedTime";

const TITLE_MAX = 120;
const NOTE_MAX = 280;

type Form = {
  kind: TransactionKind;
  amount: string;
  title: string;
  categoryId: string;
  categoryName: string;
  note: string;
  paymentMethod: PaymentMethod | null;
  date: string;
  time: string;
  version: number;
};

function seed(tx: Transaction, currency: string, timezone: string): Form {
  const { ymd, hhmm } = zonedParts(tx.occurredAt, timezone);
  return {
    kind: tx.type,
    amount: minorToDecimalText(tx.amountMinor, currency),
    title: tx.title ?? "",
    categoryId: tx.categoryId,
    categoryName: tx.categoryName,
    note: tx.note ?? "",
    paymentMethod: tx.paymentMethod,
    date: ymd,
    time: hhmm,
    version: tx.version,
  };
}

/**
 * Inline edit, seeded once from the row. Only changed fields are sent (buildEditPatch) with
 * If-Match = the version the user started from. A 412 shows the conflict card; the form keeps
 * everything typed on any failure.
 */
export function EditTransactionForm({
  tx,
  currency,
  timezone,
  refetch,
  onDone,
}: {
  tx: Transaction;
  currency: string;
  timezone: string;
  refetch: () => Promise<QueryObserverResult<Transaction>>;
  onDone: () => void;
}) {
  const categories = useCategoriesStore((s) => s.categories);
  const [form, setForm] = useState(() => seed(tx, currency, timezone));
  const [origin, setOrigin] = useState(() => ({ tx, date: form.date, time: form.time }));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState("");
  const id = useId();
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const digits = currencyMinorUnitDigits(currency);
  const amountMinor = parseAmountToMinor(form.amount, currency);
  const amountValid = amountMinor !== null && amountMinor > 0;
  const whenValid = isValidYmd(form.date) && /^\d{2}:\d{2}$/.test(form.time);

  const options = useMemo(() => {
    const list = categories.filter((c) => c.bookId === tx.bookId && c.type === form.kind && !c.isDisabled);
    if (form.categoryId && !list.some((c) => c.id === form.categoryId)) {
      list.unshift({ id: form.categoryId, name: form.categoryName, type: form.kind, icon: "", color: "", bookId: tx.bookId, isDisabled: false, version: 0, createdAt: "" });
    }
    return list;
  }, [categories, tx.bookId, form.kind, form.categoryId, form.categoryName]);

  const reload = async (mode: "discard" | "keep") => {
    setReloading(true);
    try {
      const fresh = await refetch();
      if (!fresh.data) {
        if (fresh.error && isNotFoundError(fresh.error)) setConflict(false);
        else useUndoToastStore.getState().showError(fresh.error, "Could not reload this transaction.");
        return;
      }
      if (mode === "discard") {
        const next = seed(fresh.data, currency, timezone);
        setForm(next);
        setOrigin({ tx: fresh.data, date: next.date, time: next.time });
      } else {
        set({ version: fresh.data.version });
        setOrigin((o) => ({ ...o, tx: fresh.data }));
      }
      setConflict(false);
      setSaveError("");
    } finally {
      setReloading(false);
    }
  };

  const save = async () => {
    setAttempted(true);
    if (!amountValid || !form.categoryId || !whenValid || saving) return;
    // An untouched date and time keep the original instant (seconds included), so it is not resent.
    const occurredAt =
      form.date === origin.date && form.time === origin.time ? new Date(origin.tx.occurredAt) : new Date(zonedToIso(form.date, form.time, timezone, false));
    const patch = buildEditPatch(origin.tx, {
      kind: form.kind,
      amountMinor: amountMinor!,
      title: form.title,
      categoryId: form.categoryId,
      note: form.note,
      paymentMethod: form.paymentMethod,
      occurredAt,
    });
    if (Object.keys(patch).length === 0) return onDone();
    setSaving(true);
    setSaveError("");
    try {
      const saved = await updateTransaction({ id: tx.id, bookId: tx.bookId, version: form.version }, patch, origin.tx.occurredOn);
      if (saved) onDone();
    } catch (error) {
      if (isStaleVersionError(error)) setConflict(true);
      else setSaveError(getApiErrorMessage(error, "Could not update transaction."));
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string, show: boolean, message: string) =>
    show ? (
      <p id={`${id}-${key}-error`} className="text-sm text-expense">
        {message}
      </p>
    ) : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {conflict && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning-soft p-4">
          <p className="font-semibold">This transaction was changed while you were editing</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Another device or session saved a newer version, so your save was not applied. Your edits are still here. "Reload latest" replaces them with
            the newer version; "Keep my changes" keeps them so you can save over it.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" className="h-11 rounded-full" disabled={reloading} onClick={() => void reload("discard")}>
              Reload latest
            </Button>
            <Button type="button" className="h-11 rounded-full" disabled={reloading} onClick={() => void reload("keep")}>
              Keep my changes
            </Button>
          </div>
        </div>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-expense">
          {saveError}
        </p>
      )}

      <Segmented<TransactionKind>
        label="Type"
        className="w-full"
        value={form.kind}
        tone={(v) => (v === "EXPENSE" ? "expense" : "income")}
        options={[
          { value: "EXPENSE", label: "Expense" },
          { value: "INCOME", label: "Income" },
        ]}
        // Categories are type-scoped, so the old pick no longer applies.
        onChange={(kind) => kind !== form.kind && set({ kind, categoryId: "", categoryName: "Uncategorized" })}
      />

      <div className="grid gap-2">
        <Label htmlFor={`${id}-amount`}>Amount</Label>
        <div className="relative">
          <span className="money pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-xl text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            id={`${id}-amount`}
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
            inputMode={digits > 0 ? "decimal" : "numeric"}
            autoComplete="off"
            aria-invalid={attempted && !amountValid}
            aria-describedby={`${id}-amount-error`}
            className={cn("money h-14 rounded-lg pl-10 text-2xl md:text-2xl", form.kind === "EXPENSE" ? "text-expense" : "text-income")}
          />
        </div>
        {err(
          "amount",
          attempted && !amountValid,
          `Enter an amount greater than zero${digits > 0 ? ` with at most ${digits} decimals` : " without decimals"}.`,
        ) ??
          (amountMinor !== null && (
            <p className="text-xs text-muted-foreground">
              Saved as <Money amountMinor={amountMinor} currency={currency} kind={form.kind === "EXPENSE" ? "expense" : "income"} />
            </p>
          ))}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          value={form.title}
          maxLength={TITLE_MAX}
          placeholder={form.categoryName || "Transaction"}
          onChange={(e) => set({ title: e.target.value })}
          className="h-11 rounded-lg"
        />
      </div>

      <fieldset className="grid gap-2" aria-describedby={`${id}-category-error`}>
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((c) => (
            <Chip key={c.id} active={c.id === form.categoryId} onClick={() => set({ categoryId: c.id, categoryName: c.name })} className="pl-1.5">
              <span className="inline-flex items-center gap-2">
                <CategoryIcon icon={c.icon} color={c.color} size={26} />
                {c.name}
              </span>
            </Chip>
          ))}
          {options.length === 0 && <p className="text-sm text-muted-foreground">No {form.kind === "EXPENSE" ? "expense" : "income"} categories in this book.</p>}
        </div>
        {err("category", attempted && !form.categoryId, "Choose a category that matches the type.")}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">
          Payment <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_OPTIONS.map((o) => (
            <Chip key={o.value} active={form.paymentMethod === o.value} onClick={() => set({ paymentMethod: form.paymentMethod === o.value ? null : o.value })}>
              {o.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea
          id={`${id}-note`}
          value={form.note}
          maxLength={NOTE_MAX}
          placeholder="Add details"
          onChange={(e) => set({ note: e.target.value })}
          aria-describedby={`${id}-note-count`}
          className="rounded-lg"
        />
        <p id={`${id}-note-count`} className="money text-right text-xs text-muted-foreground">
          {form.note.length}/{NOTE_MAX}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-date`}>Date</Label>
          <Input id={`${id}-date`} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} aria-invalid={attempted && !whenValid} className="h-11 rounded-lg" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-time`}>Time</Label>
          <Input id={`${id}-time`} type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} aria-invalid={attempted && !whenValid} className="h-11 rounded-lg" />
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">In the book's time zone, {timezone}.</p>
        <div className="col-span-2">{err("when", attempted && !whenValid, "Pick a date and a time.")}</div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="h-11 flex-1 rounded-full" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="glow h-11 flex-[2] rounded-full font-semibold" disabled={saving || reloading}>
          {saving ? "Saving" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
