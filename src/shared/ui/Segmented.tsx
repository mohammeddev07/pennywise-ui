import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Pill segmented control; the active thumb slides between options via a shared layoutId. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  tone,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
  /** Tints the thumb for the expense/income toggle. */
  tone?: (value: T) => "income" | "expense" | undefined;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const t = tone?.(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative min-h-9 flex-1 rounded-full px-4 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={cn(
                  "absolute inset-0 rounded-full bg-card shadow-[inset_0_1px_0_var(--edge)] ring-1 ring-border",
                  t === "expense" && "bg-expense-soft ring-expense/30",
                  t === "income" && "bg-income-soft ring-income/30",
                )}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
