import { cn } from "@/lib/utils";

/** The PennyWise mark: a signal-green coin with a single notch, plus the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="10" fill="var(--primary)" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="var(--primary-foreground)" strokeWidth="3" />
      <rect x="14.5" y="4" width="3" height="7" rx="1.5" fill="var(--primary-foreground)" />
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
