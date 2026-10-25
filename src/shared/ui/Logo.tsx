import { cn } from "@/lib/utils";

/** The PennyWise mark: a "P" whose bowl is a coin, on a signal-green tile, plus the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <rect x="9.4" y="7.75" width="3.6" height="16.75" rx="1.8" fill="var(--primary-foreground)" />
      <circle cx="16.75" cy="14.1" r="5.5" fill="none" stroke="var(--primary-foreground)" strokeWidth="3.6" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">PennyWise</span>
    </span>
  );
}
