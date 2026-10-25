import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/shared/ui/Icon";

/**
 * Pill toggle used by every Activity filter. `tone` tints the active state for the
 * Expenses / Income chips; `onRemove` turns it into an applied-filter chip with an x.
 */
export function Chip({
  active = false,
  onClick,
  icon,
  tone,
  onRemove,
  className,
  children,
  ...aria
}: {
  active?: boolean;
  onClick?: () => void;
  icon?: IconName;
  tone?: "income" | "expense";
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const body = (
    <>
      {icon && <Icon name={icon} size={16} weight={active ? "fill" : "regular"} />}
      <span className="truncate">{children}</span>
      {onRemove && <Icon name="close" size={14} className="opacity-70" />}
    </>
  );
  return (
    <button
      type="button"
      aria-pressed={onRemove ? undefined : active}
      aria-label={aria["aria-label"] ?? (onRemove && typeof children === "string" ? `Remove filter ${children}` : undefined)}
      onClick={onRemove ?? onClick}
      className={cn(
        "inline-flex h-11 max-w-[18rem] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[0.97] md:h-9",
        active
          ? tone === "expense"
            ? "border-expense/30 bg-expense-soft text-expense"
            : tone === "income"
              ? "border-income/30 bg-income-soft text-income"
              : "border-primary/30 bg-primary-soft text-foreground"
          : "border-border text-muted-foreground hover:border-border-strong hover:bg-surface-2 hover:text-foreground",
        className,
      )}
    >
      {body}
    </button>
  );
}

/** Native select styled as a pill: the platform picker on phones, keyboard-friendly everywhere. */
export function PillSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; group?: string }>;
  label: string;
  className?: string;
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const render = (list: typeof options) =>
    list.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ));
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-11 w-full appearance-none rounded-full border border-border bg-surface-2 pr-9 pl-4 text-sm font-medium text-foreground transition-colors hover:border-border-strong md:h-9"
      >
        {groups.length > 1
          ? groups.map((g) => (
              <optgroup key={g} label={g}>
                {render(options.filter((o) => (o.group ?? "") === g))}
              </optgroup>
            ))
          : render(options)}
      </select>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

/** A horizontally scrolling chip row that bleeds to the screen edge on phones. */
export function ChipRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
