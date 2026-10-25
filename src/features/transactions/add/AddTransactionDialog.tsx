import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useBooksStore } from "@/features/books/store";
import { CategoryEditorDialog } from "@/features/categories/CategoryEditorDialog";
import { useCategoriesStore } from "@/features/categories/store";
import { useSettingsStore } from "@/features/settings/store";
import { createTransaction } from "@/features/transactions/actions";
import { useAddTransactionDraftStore, type DraftKind } from "@/features/transactions/addDraftStore";
import { PAYMENT_OPTIONS } from "@/features/transactions/filterModel";
import { getApiErrorMessage } from "@/shared/api/errors";
import { useIsWide } from "@/shared/hooks/useMediaQuery";
import type { Category, PaymentMethod } from "@/shared/types/models";
import { CategoryIcon, Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { Segmented } from "@/shared/ui/Segmented";
import { EmptyState } from "@/shared/ui/states";
import { currencyMinorUnitDigits, parseAmountToMinor } from "@/shared/utils/formatCurrency";
import { AmountDisplay, Keypad, SuccessCheck } from "./AmountPad";
import { amountParts, applyAmountKey, fromZonedInputs, toZonedInputs, whenLabel } from "./draftHelpers";

const TITLE_MAX = 120;
const NOTE_MAX = 280;
type Step = "amount" | "details" | "categories" | "success";
const ORDER: Record<Step, number> = { amount: 0, details: 1, categories: 2, success: 3 };
const KINDS: { value: DraftKind; label: string }[] = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
];
const PAYMENTS: { value: PaymentMethod | null; label: string }[] = [{ value: null, label: "Not specified" }, ...PAYMENT_OPTIONS];
const DESCRIPTION: Record<Step, string> = {
  amount: "Amount, step 1 of 2",
  details: "Details, step 2 of 2",
  categories: "Choose a category",
  success: "Saved",
};

type Receipt = { kind: DraftKind; amountMinor: number; currency: string; title: string; category: string; when: string; book: string };

const slide = {
  enter: (d: number) => ({ x: d * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -48, opacity: 0 }),
};

function Chip({ active, onClick, children, role = "radio" }: { active?: boolean; onClick: () => void; children: ReactNode; role?: "radio" | "button" }) {
  return (
    <motion.button
      type="button"
      role={role}
      aria-checked={role === "radio" ? active : undefined}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
        active ? "border-primary/60 bg-primary-soft text-foreground" : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </motion.button>
  );
}

export function AddTransactionDialog({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: "EXPENSE" | "INCOME";
}) {
  const ids = useId();
  const wide = useIsWide();
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  const selectedBookId = useBooksStore((s) => s.selectedBookId);
  const books = useBooksStore((s) => s.books);
  const draft = useAddTransactionDraftStore();
  const categories = useCategoriesStore((s) => s.categories);
  const lastCreated = useCategoriesStore((s) => s.lastCreatedCategoryId);
  const fallbackCurrency = useSettingsStore((s) => s.primaryCurrency);

  const bookId = draft.bookId || selectedBookId;
  const book = books.find((b) => b.id === bookId);
  const currency = book?.currencyCode ?? fallbackCurrency;
  const timeZone = book?.timezone;
  const kind = draft.kind;
  const amountMinor = parseAmountToMinor(draft.amount, currency);

  const [step, setStep] = useState<Step>("amount");
  const [dir, setDir] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingKey, setCreatingKey] = useState(0);
  const [query, setQuery] = useState("");

  const go = (next: Step) => {
    setDir(ORDER[next] >= ORDER[step] ? 1 : -1);
    setStep(next);
  };

  const fresh = (preset?: DraftKind) => {
    const d = useAddTransactionDraftStore.getState();
    d.reset();
    d.setBookId(useBooksStore.getState().selectedBookId);
    if (preset) d.setKind(preset);
    setAttempted(false);
    setSubmitError("");
    setQuery("");
  };

  // Every open starts a fresh draft (and a fresh idempotency key) for the current book, preset to `type`.
  useEffect(() => {
    if (!open) return;
    fresh(type);
    setReceipt(null);
    setStep("amount");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bookId) void useCategoriesStore.getState().loadCategories(bookId).catch(() => {});
  }, [bookId]);

  const options = useMemo(
    () => categories.filter((c) => c.bookId === bookId && c.type === kind && !c.isDisabled),
    [categories, bookId, kind],
  );
  // The picked chip is pulled to the front if it sits outside the first eight.
  const chips = useMemo(() => {
    const head = options.slice(0, 8);
    const picked = options.find((c) => c.id === draft.categoryId);
    return picked && !head.includes(picked) ? [picked, ...head.slice(0, 7)] : head;
  }, [options, draft.categoryId]);

  // A category created from this flow (nested editor) is selected here once the store has it.
  useEffect(() => {
    if (!lastCreated) return;
    const created = categories.find((c) => c.id === lastCreated);
    if (!created) return;
    useCategoriesStore.getState().consumeLastCreatedCategoryId();
    if (created.type === useAddTransactionDraftStore.getState().kind) useAddTransactionDraftStore.getState().setCategory(created.id, created.name);
    if (step === "categories") go("details");
  }, [lastCreated, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (o: boolean) => {
    if (o) return;
    useAddTransactionDraftStore.getState().reset();
    onOpenChange(false);
  };

  const canNext = amountMinor !== null && amountMinor > 0 && Boolean(book);
  const reject = () => {
    if (!reduce && scope.current) void animate(scope.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.36 });
  };
  const press = (key: string) => {
    const amount = useAddTransactionDraftStore.getState().amount;
    const next = applyAmountKey(amount, key, currency);
    if (next === amount && key !== "back") reject();
    draft.setAmount(next);
  };
  const toDetails = () => (canNext ? go("details") : reject());

  // Desktop: type the amount straight from the keyboard while step 1 is up.
  useEffect(() => {
    if (!open || step !== "amount" || creating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "Enter") {
        if (target?.closest("button")) return;
        e.preventDefault();
        toDetails();
        return;
      }
      const key = /^\d$/.test(e.key) ? e.key : e.key === "." || e.key === "," ? "." : e.key === "Backspace" ? "back" : null;
      if (!key) return;
      e.preventDefault();
      press(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const zoned = toZonedInputs(draft.occurredAt, timeZone);
  const setWhen = (date: string, time: string) => {
    const iso = fromZonedInputs(date, time, timeZone);
    if (iso) draft.setOccurredAt(iso);
  };
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const canSave = canNext && Boolean(draft.categoryId);

  const save = async () => {
    if (saving) return;
    if (!canSave || amountMinor === null) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    setSubmitError("");
    const d = useAddTransactionDraftStore.getState();
    try {
      // The draft's idempotency key makes a retry or double submit a replay, never a second row.
      const created = await createTransaction(bookId, d.idempotencyKey, {
        type: d.kind,
        amountMinor,
        categoryId: d.categoryId as string,
        title: d.title.trim() || undefined,
        note: d.note.trim() || undefined,
        paymentMethod: d.paymentMethod ?? undefined,
        occurredAt: d.occurredAt,
      });
      if (!created) return; // the account or book changed mid-flight; the result isn't ours to show
      setReceipt({
        kind: d.kind,
        amountMinor: created.amountMinor,
        currency,
        title: created.title ?? "",
        category: d.categoryName,
        when: whenLabel(created.occurredAt, timeZone),
        book: book?.name ?? "your cash book",
      });
      fresh(d.kind);
      go("success");
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, "Couldn't save this transaction."));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setCreatingKey((k) => k + 1);
    setCreating(true);
  };

  const tone = kind === "EXPENSE" ? "bg-expense text-white hover:bg-expense/90" : "glow";
  const footer = !book ? undefined : step === "amount" ? (
    <Button onClick={toDetails} disabled={!canNext} className={cn("h-12 w-full rounded-full text-base font-semibold active:scale-[0.98]", tone)}>
      Next
    </Button>
  ) : step === "details" ? (
    <Button onClick={() => void save()} disabled={saving} className={cn("h-12 w-full rounded-full text-base font-semibold active:scale-[0.98]", tone)}>
      {saving ? "Saving" : "Save transaction"}
    </Button>
  ) : step === "success" ? (
    <>
      <Button variant="outline" className="h-12 flex-1 rounded-full text-base" onClick={() => go("amount")}>
        Add another
      </Button>
      <Button className="h-12 flex-1 rounded-full text-base font-semibold" onClick={() => close(false)}>
        Done
      </Button>
    </>
  ) : undefined;

  const filtered = options
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pickCategory = (c: Category) => {
    draft.setCategory(c.id, c.name);
    if (step === "categories") go("details");
  };

  const body = !book ? (
    <EmptyState icon="book-outline" title="Cash book unavailable" body="Try again once your books have loaded." />
  ) : step === "amount" ? (
    <div className="flex flex-col items-center gap-5 pt-1 pb-3">
      <Segmented
        label="Transaction type"
        value={kind}
        onChange={draft.setKind}
        options={KINDS}
        tone={(v) => (v === "EXPENSE" ? "expense" : "income")}
        className="w-full max-w-xs"
      />
      <div ref={scope} className="grid min-h-32 w-full place-items-center md:min-h-40">
        <AmountDisplay raw={draft.amount} currency={currency} kind={kind} />
      </div>
      <p className="text-sm text-muted-foreground">
        {currency} {kind === "EXPENSE" ? "expense" : "income"}
      </p>
      {wide ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Type the amount, then <Kbd>Enter</Kbd>
        </p>
      ) : (
        <Keypad onKey={press} decimal={currencyMinorUnitDigits(currency) > 0} decimalChar={amountParts("0", currency).decimal} />
      )}
    </div>
  ) : step === "details" ? (
    <div className="space-y-6 pb-3">
      <button
        type="button"
        onClick={() => go("amount")}
        aria-label="Edit amount"
        className={cn(
          "flex w-full items-center rounded-lg border p-4 text-left transition-transform active:scale-[0.99]",
          kind === "EXPENSE" ? "border-expense/25 bg-expense-soft" : "border-income/25 bg-income-soft",
        )}
      >
        <span className="flex-1">
          <span className={cn("block text-xs font-semibold", kind === "EXPENSE" ? "text-expense" : "text-income")}>
            {kind === "EXPENSE" ? "Expense" : "Income"}
          </span>
          <Money amountMinor={amountMinor ?? 0} currency={currency} kind={kind === "EXPENSE" ? "expense" : "income"} className="text-2xl font-semibold" />
        </span>
        <Icon name="pencil" size={18} className={kind === "EXPENSE" ? "text-expense" : "text-income"} />
      </button>

      <div className="space-y-2">
        <Label htmlFor={`${ids}-title`}>Title</Label>
        <Input
          id={`${ids}-title`}
          value={draft.title}
          onChange={(e) => draft.setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Light bill, Coffee, Rent"
          autoComplete="off"
          className="h-11 rounded-lg px-3"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span id={`${ids}-cat`} className="text-sm font-medium">
            Category
          </span>
          {options.length > 0 && (
            <button type="button" onClick={() => go("categories")} className="min-h-10 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary-soft">
              View all
            </button>
          )}
        </div>
        <div role="radiogroup" aria-labelledby={`${ids}-cat`} aria-describedby={attempted && !draft.categoryId ? `${ids}-cat-error` : undefined} className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Chip key={c.id} active={c.id === draft.categoryId} onClick={() => pickCategory(c)}>
              <CategoryIcon icon={c.icon} color={c.color} size={22} />
              {c.name}
            </Chip>
          ))}
          <Chip role="button" onClick={openCreate}>
            <Icon name="add" size={16} /> New category
          </Chip>
        </div>
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">No {kind === "EXPENSE" ? "expense" : "income"} categories yet. Create one to continue.</p>
        )}
        {attempted && !draft.categoryId && (
          <p id={`${ids}-cat-error`} className="text-sm text-expense">
            Choose a category before saving.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <span id={`${ids}-pay`} className="text-sm font-medium">
          Payment <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <div role="radiogroup" aria-labelledby={`${ids}-pay`} className="flex flex-wrap gap-2">
          {PAYMENTS.map((p) => (
            <Chip key={p.label} active={draft.paymentMethod === p.value} onClick={() => draft.setPaymentMethod(p.value)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${ids}-date`}>Date</Label>
            <Input id={`${ids}-date`} type="date" value={zoned.date} onChange={(e) => setWhen(e.target.value, zoned.time)} className="h-11 rounded-lg px-3" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${ids}-time`}>Time</Label>
            <Input id={`${ids}-time`} type="time" value={zoned.time} onChange={(e) => setWhen(zoned.date, e.target.value)} className="h-11 rounded-lg px-3" />
          </div>
        </div>
        {timeZone && timeZone !== deviceZone && <p className="text-sm text-muted-foreground">In {timeZone}, this book's time zone.</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${ids}-note`}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <span className="text-xs text-muted-foreground">
            {draft.note.length}/{NOTE_MAX}
          </span>
        </div>
        <Textarea
          id={`${ids}-note`}
          value={draft.note}
          onChange={(e) => draft.setNote(e.target.value.slice(0, NOTE_MAX))}
          maxLength={NOTE_MAX}
          rows={3}
          placeholder="Add a note"
          className="rounded-lg px-3"
        />
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-expense">
          {submitError} Your entries are kept. Try again.
        </p>
      )}
    </div>
  ) : step === "categories" ? (
    <div className="space-y-4 pb-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go("details")}
          aria-label="Back to details"
          className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2"
        >
          <Icon name="chevron-back" size={18} />
        </button>
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            autoFocus={wide}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories"
            aria-label="Search categories"
            className="h-11 rounded-full pr-4 pl-10"
          />
        </div>
      </div>
      <div role="radiogroup" aria-label="Categories" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-24 flex-col items-start justify-between rounded-lg border border-dashed border-border-strong p-3 text-left text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
        >
          <Icon name="add" size={20} /> New category
        </button>
        {filtered.map((c, i) => {
          const active = c.id === draft.categoryId;
          return (
            <motion.button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pickCategory(c)}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30, delay: Math.min(i, 12) * 0.03 }}
              className={cn(
                "flex min-h-24 flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors",
                active ? "border-primary/60 bg-primary-soft" : "border-border bg-surface-2 hover:bg-surface-3",
              )}
            >
              <span className="flex w-full items-start justify-between">
                <CategoryIcon icon={c.icon} color={c.color} size={34} />
                {active && <Icon name="checkmark" size={16} className="text-primary" />}
              </span>
              <span className="w-full truncate text-sm font-semibold">{c.name}</span>
            </motion.button>
          );
        })}
      </div>
      {filtered.length === 0 && query.trim() && <p className="text-center text-sm text-muted-foreground">No categories match "{query.trim()}".</p>}
    </div>
  ) : receipt ? (
    <div className="flex flex-col items-center pt-2 pb-4 text-center">
      <SuccessCheck />
      <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, type: "spring", stiffness: 300, damping: 30 }}>
        <p className="mt-5 text-2xl font-semibold tracking-tight">Logged</p>
        <p className="mt-1 text-sm text-muted-foreground">Saved to {receipt.book}. Totals are up to date.</p>
      </motion.div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, type: "spring", stiffness: 300, damping: 30 }}
        className="surface mt-6 w-full rounded-xl p-5 text-left"
      >
        <p className={cn("text-xs font-semibold", receipt.kind === "EXPENSE" ? "text-expense" : "text-income")}>
          {receipt.kind === "EXPENSE" ? "Expense" : "Income"}
        </p>
        <Money amountMinor={receipt.amountMinor} currency={receipt.currency} kind={receipt.kind === "EXPENSE" ? "expense" : "income"} className="mt-1 block text-3xl font-semibold" />
        <div className="my-4 h-px bg-border" />
        <p className="truncate font-semibold">{receipt.title || receipt.category}</p>
        <p className="truncate text-sm text-muted-foreground">
          {receipt.category}, {receipt.when}
        </p>
      </motion.div>
    </div>
  ) : null;

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={close} title="New transaction" description={DESCRIPTION[step]} footer={footer} className="md:max-w-md">
        {/* The surface carries the mode: a soft wash in the expense or income tone. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 overflow-hidden rounded-t-[inherit]">
          <motion.div className="absolute inset-0 bg-linear-to-b from-expense-soft to-transparent" animate={{ opacity: kind === "EXPENSE" ? 1 : 0 }} transition={{ duration: 0.3 }} />
          <motion.div className="absolute inset-0 bg-linear-to-b from-income-soft to-transparent" animate={{ opacity: kind === "INCOME" ? 1 : 0 }} transition={{ duration: 0.3 }} />
        </div>
        <div className="overflow-x-clip">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={reduce ? undefined : slide}
              initial={reduce ? { opacity: 0 } : "enter"}
              animate={reduce ? { opacity: 1 } : "center"}
              exit={reduce ? { opacity: 0 } : "exit"}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </div>
      </ResponsiveDialog>
      {open && (
        <CategoryEditorDialog key={creatingKey} open={creating} onOpenChange={setCreating} type={kind} origin="add-transaction" />
      )}
    </>
  );
}
