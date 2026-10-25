import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/shared/utils/formatCurrency";

export type MoneyKind = "income" | "expense" | "neutral" | "balance";

/**
 * Every money figure renders through here, keeping mobile's three rules together: amounts are Sora with tabular
 * figures; income is green, expense red, a neutral balance is body text (red only when negative); and a signed
 * amount always prints its sign, so it reads without color.
 */
function parts(amountMinor: number, currency: string, kind: MoneyKind) {
  const negative = kind === "expense" || ((kind === "balance" || kind === "neutral") && amountMinor < 0);
  const sign = kind === "income" ? "+" : negative ? "−" : "";
  const color =
    kind === "income" ? "text-income" : kind === "expense" || (kind === "balance" && amountMinor < 0) ? "text-expense" : "";
  return { text: `${sign}${formatCurrency(Math.abs(amountMinor), currency)}`, color };
}

export function Money({
  amountMinor,
  currency,
  kind = "neutral",
  className,
}: {
  amountMinor: number;
  currency: string;
  kind?: MoneyKind;
  className?: string;
}) {
  const { text, color } = parts(amountMinor, currency, kind);
  return <span className={cn("money whitespace-nowrap", color, className)}>{text}</span>;
}

/** Counts up from the previous value with a spring-like ease; static under reduced motion. */
export function AnimatedMoney({
  amountMinor,
  currency,
  kind = "balance",
  className,
}: {
  amountMinor: number;
  currency: string;
  kind?: MoneyKind;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? amountMinor : 0);
  const text = useTransform(value, (v) => parts(Math.round(v), currency, kind).text);
  useEffect(() => {
    if (reduce) {
      value.set(amountMinor);
      return;
    }
    const controls = animate(value, amountMinor, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [amountMinor, reduce, value]);
  const { color } = parts(amountMinor, currency, kind);
  return (
    <span className={cn("money whitespace-nowrap", color, className)}>
      <span className="sr-only">{parts(amountMinor, currency, kind).text}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}
