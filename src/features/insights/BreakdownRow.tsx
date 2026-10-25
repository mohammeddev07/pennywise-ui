import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";

/**
 * A category's share as a horizontal bar (Home's top spending, Insights' breakdown). Bars compare
 * directly and label without a legend; the donut on Insights is the glance view next to them.
 */
export function BreakdownRow({
  name,
  amountMinor,
  currency,
  share,
  color,
  icon,
  count,
  shareLabel = "of spending",
  selected = false,
  highlighted = false,
  onClick,
  onHover,
  footer,
}: {
  name: string;
  amountMinor: number;
  currency: string;
  /** 0..1, or null when there is no share to show (no bar, no percentage). */
  share: number | null;
  color: string;
  icon?: string | null;
  count?: number;
  shareLabel?: string;
  selected?: boolean;
  /** Hovered here or on the matching donut slice. */
  highlighted?: boolean;
  onClick?: () => void;
  onHover?: (hovering: boolean) => void;
  footer?: ReactNode;
}) {
  const raw = share === null ? null : share * 100;
  // A real but tiny share must not read as 0%.
  const pct = raw === null ? null : raw > 0 && raw < 1 ? "<1%" : `${Math.round(raw)}%`;
  const detail = [pct && `${pct} ${shareLabel}`, count !== undefined && `${count} ${count === 1 ? "transaction" : "transactions"}`]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <span className="flex items-center gap-3">
      <CategoryIcon icon={icon} color={color} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold">{name}</span>
          <Money amountMinor={amountMinor} currency={currency} className="font-semibold" />
        </span>
        {raw !== null && (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
            {raw > 0 && <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, raw))}%`, background: color }} />}
          </span>
        )}
        {detail && <span className="mt-1.5 block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </span>
  );

  const surface = cn(
    "block w-full rounded-lg px-3 py-3 text-left transition-colors",
    (highlighted || selected) && "bg-surface-2",
    selected && "ring-1 ring-border-strong",
  );

  return (
    <div onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      {onClick ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onClick}
          onFocus={() => onHover?.(true)}
          onBlur={() => onHover?.(false)}
          className={cn(surface, "hover:bg-surface-2")}
        >
          {body}
        </button>
      ) : (
        <div className={surface}>{body}</div>
      )}
      {footer}
    </div>
  );
}
