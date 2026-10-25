import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "@/shared/ui/Icon";
import { useFilterStore, type ScopeKey } from "../filterStore";

/** Shown while a drill-down from Insights is applied. Back re-applies the filter and scroll from before it. */
export function DrillBreadcrumb({ scope }: { scope: ScopeKey }) {
  const drill = useFilterStore((s) => s.drills[scope]);
  const restore = useFilterStore((s) => s.restoreDrill);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {drill && (
        <motion.button
          key="drill"
          type="button"
          onClick={() => restore(scope)}
          initial={reduce ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          aria-label={`Back to previous filter. Viewing ${drill.label}`}
          className="group flex min-h-11 w-full items-center gap-2 rounded-lg text-left"
        >
          <Icon name="chevron-back" size={18} className="text-primary transition-transform group-hover:-translate-x-0.5" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-primary">Back to previous filter</span>
            <span className="block truncate text-xs text-muted-foreground">{drill.label}</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
