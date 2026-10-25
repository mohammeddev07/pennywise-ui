import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A radio group laid out as a grid (icon and color pickers for categories and books). Arrow keys move the
 * choice like native radios; the selection ring slides between cells through a shared layoutId.
 */
export function ChoiceGrid<T extends string>({
  label,
  value,
  options,
  onChange,
  render,
  disabled,
  shape = "rounded-lg",
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  render: (value: T, active: boolean) => ReactNode;
  disabled?: boolean;
  shape?: "rounded-lg" | "rounded-full";
  className?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("grid gap-2", className)}>
      {options.map((o, i) => {
        const active = i === index;
        return (
          <motion.button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            whileTap={reduce ? undefined : { scale: 0.92 }}
            className={cn(
              "relative grid aspect-square min-h-11 place-items-center transition-colors disabled:opacity-50",
              shape,
              active ? "bg-surface-3" : "bg-surface-2 hover:bg-surface-3",
            )}
          >
            {active && (
              <motion.span
                layoutId={`choice-${id}`}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className={cn("absolute inset-0 ring-2 ring-primary ring-inset", shape)}
              />
            )}
            <span className="relative">{render(o.value, active)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
