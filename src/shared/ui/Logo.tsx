import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The PennyWise "Coin P" mark: a P whose bowl holds a gold coin, on a deep-green tile, plus the wordmark.
 * Same artwork as public/app-icon.svg. Gradient ids come from useId: the mark renders more than once per page,
 * and a duplicate id defined inside a hidden (display: none) copy would leave the visible copies unpainted.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 512 512" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#23664F" />
          <stop offset="1" stopColor="#123B30" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F9C95C" />
          <stop offset="1" stopColor="#E9A23B" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill={`url(#${id}t)`} />
      <g transform="translate(73.6 64.8) scale(3.68)">
        <circle cx="50" cy="40" r="26" fill="none" stroke="#FFFFFF" strokeWidth="16" />
        <path d="M16 40H32V83L16 95Z" fill="#FFFFFF" />
        <circle cx="50" cy="40" r="14" fill={`url(#${id}c)`} />
      </g>
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
