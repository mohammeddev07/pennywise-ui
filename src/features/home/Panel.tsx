import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** Mount reveal for a dashboard cell, staggered by `i` so the grid settles in reading order. */
export function Reveal({ i, className, children }: { i: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30, delay: Math.min(i, 12) * 0.04 }}
    >
      {children}
    </motion.div>
  );
}

/** A titled dashboard card. */
export function Panel({
  i,
  title,
  action,
  className,
  children,
}: {
  i: number;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Reveal i={i} className={cn("surface min-w-0 rounded-xl p-4 lg:p-5", className)}>
      <section>
        <div className="mb-3 flex min-h-8 items-center justify-between gap-3 px-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {action}
        </div>
        {children}
      </section>
    </Reveal>
  );
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-my-2 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
    >
      {children}
    </Link>
  );
}
