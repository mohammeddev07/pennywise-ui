import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/shared/ui/Icon";

/** A titled group of rows on one surface, separated by hairlines. */
export function SettingsGroup({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {title && <h2 className="px-1 text-sm font-semibold text-muted-foreground">{title}</h2>}
      <div className="surface divide-y divide-border overflow-hidden rounded-xl">{children}</div>
    </section>
  );
}

type RowProps = {
  icon?: IconName;
  label: string;
  value?: ReactNode;
  trailing?: ReactNode;
  locked?: boolean;
  disabled?: boolean;
  tone?: "expense";
  /** One of these makes the row a button, an in-app link or an external link. */
  onClick?: () => void;
  to?: string;
  href?: string;
};

/** One settings row: icon tile, label, secondary value, and a chevron when it navigates or acts. */
export function SettingsRow(props: RowProps) {
  const { icon, label, value, trailing, locked, disabled, tone, onClick, to, href } = props;
  const interactive = Boolean(onClick || to || href);
  const content = (
    <>
      {icon && (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2", tone === "expense" ? "text-expense" : "text-foreground")}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium", tone === "expense" && "text-expense")}>{label}</span>
        {value !== undefined && <span className="block truncate text-sm text-muted-foreground">{value}</span>}
      </span>
      {trailing}
      {locked && <Icon name="lock-closed-outline" size={16} className="text-muted-foreground" label="Can't be changed" />}
      {interactive && !trailing && <Icon name="chevron-forward" size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
    </>
  );
  const cls = cn(
    "group flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left",
    interactive && "transition-colors hover:bg-surface-2 active:bg-surface-3 disabled:pointer-events-none disabled:opacity-60",
  );
  if (to) return <Link to={to} className={cls}>{content}</Link>;
  if (href) return <a href={href} className={cls}>{content}</a>;
  if (onClick)
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {content}
      </button>
    );
  return <div className={cls}>{content}</div>;
}
