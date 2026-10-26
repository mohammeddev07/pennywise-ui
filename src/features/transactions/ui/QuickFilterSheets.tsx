import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/features/categories/store";
import { CategoryIcon } from "@/shared/ui/Icon";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import type { PaymentMethod } from "@/shared/types/transactionQuery";
import { currencyMinorUnitDigits, currencySymbol, parseAmountToMinor } from "@/shared/utils/formatCurrency";
import { PAYMENT_OPTIONS, minorToDecimalText } from "../filterModel";
import { Chip } from "./Chip";
import { TEXT_DEBOUNCE_MS } from "./useDebouncedText";

type SheetProps = { open: boolean; onClose: () => void };

function Footer({ onClear, clearDisabled, onDone }: { onClear: () => void; clearDisabled: boolean; onDone: () => void }) {
  return (
    <>
      <Button variant="secondary" className="h-11 rounded-full px-5" onClick={onClear} disabled={clearDisabled}>
        Clear
      </Button>
      <Button className="h-11 rounded-full px-6 font-semibold" onClick={onDone}>
        Done
      </Button>
    </>
  );
}

/** Discrete choices apply the moment they are tapped; the sheet is just where they live. */
export function CategoryFilterSheet({
  open,
  onClose,
  options,
  selected,
  onChange,
}: SheetProps & { options: Category[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const groups = [
    { title: "Expense", items: options.filter((o) => o.type === "EXPENSE") },
    { title: "Income", items: options.filter((o) => o.type === "INCOME") },
  ].filter((g) => g.items.length > 0);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Categories"
      footer={<Footer onClear={() => onChange([])} clearDisabled={selected.length === 0} onDone={onClose} />}
    >
      {options.length === 0 && <p className="text-sm text-muted-foreground">No categories in this book yet.</p>}
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">{g.title}</h3>
            <div className="flex flex-wrap gap-2">
              {g.items.map((c) => (
                <Chip key={c.id} active={selected.includes(c.id)} onClick={() => toggle(c.id)} className="pl-1.5">
                  <span className="inline-flex items-center gap-2">
                    <CategoryIcon icon={c.icon} color={c.color} size={26} />
                    {c.name}
                  </span>
                </Chip>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ResponsiveDialog>
  );
}

export function PaymentFilterSheet({
  open,
  onClose,
  methods,
  unspecified,
  onChange,
}: SheetProps & {
  methods: PaymentMethod[];
  unspecified: boolean;
  onChange: (methods: PaymentMethod[], unspecified: boolean) => void;
}) {
  const toggle = (m: PaymentMethod) => onChange(methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m], unspecified);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Payment method"
      footer={<Footer onClear={() => onChange([], false)} clearDisabled={methods.length === 0 && !unspecified} onDone={onClose} />}
    >
      <div className="flex flex-wrap gap-2">
        {PAYMENT_OPTIONS.map((o) => (
          <Chip key={o.value} active={methods.includes(o.value)} onClick={() => toggle(o.value)}>
            {o.label}
          </Chip>
        ))}
        <Chip active={unspecified} onClick={() => onChange(methods, !unspecified)}>
          Not specified
        </Chip>
      </div>
    </ResponsiveDialog>
  );
}

const amountText = (minor: number | null, currency: string) => (minor === null ? "" : minorToDecimalText(minor, currency));

/**
 * Amount range. Text is parsed exactly into minor units (no floats, no rounding); an invalid or
 * reversed pair is explained and never applied. A valid pair applies 300 ms after typing stops.
 */
export function AmountFilterSheet({
  open,
  onClose,
  currency,
  min,
  max,
  onChange,
}: SheetProps & { currency: string; min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void }) {
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const applied = useRef({ min, max });
  applied.current = { min, max };
  const errorId = useId();

  // Seed once per open; later commits must not rewrite "5." to "5.00" under the cursor.
  useEffect(() => {
    if (!open) return;
    setMinText(amountText(applied.current.min, currency));
    setMaxText(amountText(applied.current.max, currency));
  }, [open, currency]);

  const parsed = useMemo(() => {
    const parse = (text: string) => {
      if (text.trim() === "") return { ok: true as const, value: null };
      const v = parseAmountToMinor(text, currency);
      return v === null ? { ok: false as const, value: null } : { ok: true as const, value: v };
    };
    const a = parse(minText);
    const b = parse(maxText);
    const digits = currencyMinorUnitDigits(currency);
    const error =
      !a.ok || !b.ok
        ? `Enter a plain amount${digits > 0 ? ` with at most ${digits} decimals` : " without decimals"}.`
        : a.value !== null && b.value !== null && a.value > b.value
          ? "The minimum must not be more than the maximum."
          : null;
    return { min: a.value, max: b.value, error };
  }, [minText, maxText, currency]);

  useEffect(() => {
    if (!open || parsed.error) return;
    if (parsed.min === applied.current.min && parsed.max === applied.current.max) return;
    const t = setTimeout(() => onChangeRef.current(parsed.min, parsed.max), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, parsed]);

  const field = (label: string, value: string, set: (t: string) => void) => {
    const id = `${errorId}-${label}`;
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative">
          <span className="money pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            id={id}
            value={value}
            onChange={(e) => set(e.target.value)}
            inputMode={currencyMinorUnitDigits(currency) > 0 ? "decimal" : "numeric"}
            placeholder="Any"
            autoComplete="off"
            aria-invalid={Boolean(parsed.error)}
            aria-describedby={errorId}
            className="money h-11 rounded-lg pl-8"
          />
        </div>
      </div>
    );
  };

  // Closing within the debounce window still applies what was typed.
  const close = () => {
    if (!parsed.error && (parsed.min !== applied.current.min || parsed.max !== applied.current.max)) {
      onChangeRef.current(parsed.min, parsed.max);
    }
    onClose();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Amount"
      footer={
        <Footer
          onClear={() => {
            setMinText("");
            setMaxText("");
            onChange(null, null);
          }}
          clearDisabled={min === null && max === null && !minText && !maxText}
          onDone={close}
        />
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {field("Minimum", minText, setMinText)}
        {field("Maximum", maxText, setMaxText)}
      </div>
      <p id={errorId} className={parsed.error ? "mt-3 text-sm text-expense" : "mt-3 text-sm text-muted-foreground"}>
        {parsed.error ?? "Both ends are inclusive. Leave one empty for no limit."}
      </p>
    </ResponsiveDialog>
  );
}
