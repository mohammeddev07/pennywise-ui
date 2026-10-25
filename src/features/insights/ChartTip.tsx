import type { ReactNode } from "react";
import { Money } from "@/shared/ui/Money";

/** Recharts tooltip body: the value leads, the period and detail follow in muted text. */
export function ChartTip({ amountMinor, currency, title, detail }: { amountMinor: number; currency: string; title: string; detail?: ReactNode }) {
  return (
    <div className="glass rounded-lg px-3 py-2 text-sm">
      <Money amountMinor={amountMinor} currency={currency} className="text-base font-semibold" />
      <p className="text-muted-foreground">{title}</p>
      {detail && <p className="text-xs text-subtle">{detail}</p>}
    </div>
  );
}

/** Axis text in the recessive ink, never a series color. */
export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
