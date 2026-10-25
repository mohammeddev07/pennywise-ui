import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { addMonthsYmd, compareYmd, isValidYmd, type Ymd } from "@/shared/utils/ledgerDate";
import { ALL_WINDOW_YEARS_BACK } from "../filterModel";

export type YmdRange = { startDate: Ymd; endDate: Ymd };

/** A range the analyze endpoint accepts: real days, at most 5 years apart. */
export function rangeError(start: Ymd, end: Ymd): string | null {
  if (!isValidYmd(start) || !isValidYmd(end)) return "Pick both dates.";
  const [lo, hi] = compareYmd(start, end) <= 0 ? [start, end] : [end, start];
  if (compareYmd(hi, addMonthsYmd(lo, 12 * ALL_WINDOW_YEARS_BACK)) > 0) return "Choose a range of at most 5 years.";
  return null;
}

/** Custom date range on native date inputs, edited as a draft: Apply, Reset or Cancel. */
export function CustomRangeSheet({
  open,
  onClose,
  initial,
  onApply,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  initial: YmdRange;
  onApply: (range: YmdRange) => void;
  onReset: () => void;
}) {
  const [start, setStart] = useState(initial.startDate);
  const [end, setEnd] = useState(initial.endDate);
  const errorId = useId();

  // Seed once per open, by value.
  useEffect(() => {
    if (!open) return;
    setStart(initial.startDate);
    setEnd(initial.endDate);
  }, [open, initial.startDate, initial.endDate]);

  const error = rangeError(start, end);
  const field = (label: string, value: Ymd, set: (v: Ymd) => void) => (
    <div className="grid gap-2">
      <Label htmlFor={`${errorId}-${label}`}>{label}</Label>
      <Input
        id={`${errorId}-${label}`}
        type="date"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-11 rounded-lg"
      />
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Custom range"
      footer={
        <>
          <Button
            variant="ghost"
            className="h-11 rounded-full px-4"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            Reset
          </Button>
          <Button variant="secondary" className="h-11 rounded-full px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-full px-6 font-semibold"
            disabled={Boolean(error)}
            onClick={() => {
              const [lo, hi] = compareYmd(start, end) <= 0 ? [start, end] : [end, start];
              onApply({ startDate: lo, endDate: hi });
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {field("Start date", start, setStart)}
        {field("End date", end, setEnd)}
      </div>
      {error && (
        <p id={errorId} className="mt-3 text-sm text-expense">
          {error}
        </p>
      )}
    </ResponsiveDialog>
  );
}
