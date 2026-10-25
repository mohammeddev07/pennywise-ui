import { useReducedMotion } from "motion/react";
import { Bar, BarChart, Brush, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/features/transactions/insights";
import { currencySymbol, minorToMajor } from "@/shared/utils/formatCurrency";
import { AXIS_TICK, ChartTip } from "./ChartTip";

const GLOW = "drop-shadow(0 4px 12px color-mix(in srgb, var(--primary) 45%, transparent))";
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const countText = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}`;

/**
 * Totals per period. One series, so one color: every bar is primary until one is selected, then the
 * selection keeps primary + glow and the rest step back. Partial periods are striped with a dashed
 * edge and starred on the axis. The column (not just the painted bar) is the click target, so a
 * zero or tiny period is still selectable. `brush` adds a range handle to zoom and pan the periods.
 */
export function PeriodChart({
  points,
  currency,
  selectedKey,
  onSelect,
  brush,
  height,
}: {
  points: SeriesPoint[];
  currency: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  brush: boolean;
  height: number;
}) {
  const reduce = useReducedMotion();
  const byKey = new Map(points.map((p) => [p.key, p]));
  const tick = (key: string) => {
    const p = byKey.get(key);
    return p ? `${p.label}${p.partial ? "*" : ""}` : key;
  };
  const symbol = currencySymbol(currency);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          barCategoryGap="22%"
          className="cursor-pointer"
          onClick={(state) => {
            const key = typeof state?.activeLabel === "string" ? state.activeLabel : null;
            if (key) onSelect(key === selectedKey ? null : key);
          }}
        >
          <defs>
            <pattern id="pw-partial" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--primary)" fillOpacity={0.2} />
              <rect width="2.5" height="6" fill="var(--primary)" fillOpacity={0.8} />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="key" tickFormatter={tick} axisLine={false} tickLine={false} tick={AXIS_TICK} tickMargin={8} minTickGap={2} />
          <YAxis
            width={52}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            allowDecimals={false}
            tickFormatter={(v: number) => (v === 0 ? "0" : `${symbol}${COMPACT.format(minorToMajor(v, currency))}`)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as SeriesPoint | undefined;
              return active && p ? (
                <ChartTip
                  amountMinor={p.valueMinor}
                  currency={currency}
                  title={p.longLabel}
                  detail={`${countText(p.count)}${p.partial ? ", partial period" : ""}`}
                />
              ) : null;
            }}
          />
          <Bar dataKey="valueMinor" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reduce} animationDuration={600}>
            {points.map((p) => {
              const active = p.key === selectedKey;
              const dim = selectedKey !== null && !active;
              return (
                <Cell
                  key={p.key}
                  fill={p.partial ? "url(#pw-partial)" : dim ? "var(--muted-foreground)" : "var(--primary)"}
                  fillOpacity={dim ? 0.35 : active ? 1 : 0.85}
                  stroke={p.partial ? "var(--primary)" : undefined}
                  strokeDasharray={p.partial ? "3 2" : undefined}
                  strokeOpacity={dim ? 0.5 : 1}
                  style={active ? { filter: GLOW } : undefined}
                />
              );
            })}
          </Bar>
          {brush && (
            <Brush
              dataKey="key"
              tickFormatter={tick}
              height={24}
              travellerWidth={10}
              stroke="var(--border-strong)"
              fill="var(--surface-2)"
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
