import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/shared/api/errors";
import { Icon, type IconName } from "./Icon";

/** Shimmering placeholder shaped like the content it replaces. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-lg", className)} />;
}

export function EmptyState({
  icon = "receipt-outline",
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Icon name={icon} size={26} weight="duotone" />
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {body && <p className="mx-auto max-w-[38ch] text-sm text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  title = "Couldn't load this",
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-expense-soft text-expense">
        <Icon name="alert-circle-outline" size={24} />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="mx-auto max-w-[42ch] text-sm text-muted-foreground">{getApiErrorMessage(error, "Something went wrong.")}</p>
      </div>
      {onRetry && (
        <Button variant="outline" className="rounded-full" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </Button>
      )}
    </div>
  );
}
