import { useReducedMotion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartTip } from "@/features/insights/ChartTip";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import type { DayPoint } from "./homeData";

/**
 * The week's spending as one line: a line reads a week's shape better than seven bars. No y-axis;
 * the crosshair tooltip carries the exact figure and the hidden table carries every value.
 */
export function WeekChart({ data, currency }: { data: DayPoint[]; currency: string }) {
  const reduce = useReducedMotion();
  return (
    <figure>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="pw-week-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--primary)" stopOpacity={0.22} />
                <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} interval={0} tickMargin={8} />
            <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as DayPoint | undefined;
                return active && p ? <ChartTip amountMinor={p.value} currency={currency} title={`Spent ${p.longLabel}`} /> : null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#pw-week-fill)"
              dot={false}
              activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={!reduce}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Spending over the last seven days: {data.map((d) => `${d.longLabel} ${formatCurrency(d.value, currency)}`).join(", ")}
      </figcaption>
    </figure>
  );
}
