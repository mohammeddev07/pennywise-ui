import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Icon } from "@/shared/ui/Icon";
import { formatCurrency, parseAmountToMinor } from "@/shared/utils/formatCurrency";
import { amountParts } from "./draftHelpers";

const digitSpring = { type: "spring", stiffness: 420, damping: 30 } as const;

/** The hero amount. Each glyph is keyed by slot + value, so a changed digit rolls out and the new one springs in. */
export function AmountDisplay({ raw, currency, kind }: { raw: string; currency: string; kind: "EXPENSE" | "INCOME" }) {
  const reduce = useReducedMotion();
  const p = amountParts(raw, currency);
  const minor = parseAmountToMinor(raw, currency) ?? 0;
  const glyphs = [...p.int].map((ch) => ({ ch, minor: false }));
  if (p.frac !== null) glyphs.push({ ch: p.decimal, minor: true }, ...[...p.frac].map((ch) => ({ ch, minor: true })));
  const length = glyphs.length + p.pad;
  const size = length <= 6 ? "text-6xl md:text-7xl" : length <= 9 ? "text-5xl md:text-6xl" : length <= 12 ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl";

  return (
    <p className={cn("money flex items-baseline justify-center font-semibold whitespace-nowrap", size, minor === 0 ? "text-muted-foreground" : kind === "EXPENSE" ? "text-expense" : "text-income")}>
      <span className="sr-only" aria-live="polite">
        {formatCurrency(minor, currency)}
      </span>
      <span aria-hidden className="mr-1 self-start pt-[0.2em] text-[0.45em] text-muted-foreground">
        {p.symbol}
      </span>
      <span aria-hidden className="inline-flex items-baseline overflow-hidden py-[0.05em]">
        <AnimatePresence initial={false} mode="popLayout">
          {glyphs.map((g, i) => (
            <motion.span
              key={`${i}:${g.ch}`}
              layout={reduce ? false : "position"}
              initial={reduce ? false : { y: "0.6em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? undefined : { y: "-0.6em", opacity: 0 }}
              transition={digitSpring}
              className={cn("inline-block", g.minor && "text-[0.55em]")}
            >
              {g.ch}
            </motion.span>
          ))}
        </AnimatePresence>
        {p.pad > 0 && <span className="text-[0.55em] opacity-30">{"0".repeat(p.pad)}</span>}
      </span>
    </p>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/** On-screen keypad for phones; 56px keys, and the decimal key disappears for zero-minor-digit currencies. */
export function Keypad({ onKey, decimal, decimalChar }: { onKey: (key: string) => void; decimal: boolean; decimalChar: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid w-full grid-cols-3 gap-2" role="group" aria-label="Amount keypad">
      {KEYS.map((k) =>
        k === "." && !decimal ? (
          <span key={k} />
        ) : (
          <motion.button
            key={k}
            type="button"
            onClick={() => onKey(k)}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            aria-label={k === "back" ? "Delete last digit" : k === "." ? "Decimal point" : undefined}
            className="money grid h-14 place-items-center rounded-full text-2xl font-medium transition-colors hover:bg-surface-2 active:bg-surface-3"
          >
            {k === "back" ? <Icon name="backspace-outline" size={24} /> : k === "." ? decimalChar : k}
          </motion.button>
        ),
      )}
    </div>
  );
}

/** Spring-scaled disc with the check path drawing itself in, and one ring that bursts once. */
export function SuccessCheck({ size = 76 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 76 76"
      aria-hidden
      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.06 }}
      className="overflow-visible"
    >
      {!reduce && (
        <motion.circle
          cx="38"
          cy="38"
          r="36"
          fill="none"
          strokeWidth="2"
          className="stroke-income"
          style={{ transformOrigin: "38px 38px" }}
          initial={{ scale: 0.7, opacity: 0.6 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <circle cx="38" cy="38" r="36" className="fill-income-soft" />
      <motion.path
        d="M24 39.5 L33.5 49 L53 28"
        fill="none"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-income"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.2, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.svg>
  );
}
