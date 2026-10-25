import { useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Money } from "@/shared/ui/Money";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { OTHER_ID, type Slice } from "./insightsData";

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : "0%");

/**
 * Part-to-whole at a glance. The highlighted slice (hovered here or on its row) stays solid while the
 * rest step back, and the center reads out that slice; the rows below carry exact amounts.
 */
export function CategoryDonut({
  slices,
  total,
  currency,
  label,
  activeId,
  onHover,
  onSelect,
}: {
  slices: Slice[];
  total: number;
  currency: string;
  label: string;
  activeId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const focus = slices.find((s) => s.id === activeId) ?? null;
  return (
    <figure className="relative mx-auto aspect-square w-full max-w-[230px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="70%"
            outerRadius="96%"
            startAngle={90}
            endAngle={-270}
            cornerRadius={4}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={!reduce}
            animationDuration={700}
            onMouseEnter={(_, i) => onHover(slices[i]?.id ?? null)}
            onMouseLeave={() => onHover(null)}
            onClick={(_, i) => {
              const id = slices[i]?.id;
              if (id && id !== OTHER_ID) onSelect(id);
            }}
          >
            {slices.map((s) => (
              <Cell
                key={s.id}
                fill={s.color}
                fillOpacity={!focus || focus.id === s.id ? 1 : 0.3}
                className={s.id === OTHER_ID ? undefined : "cursor-pointer"}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div aria-hidden className="pointer-events-none absolute inset-[22%] grid place-content-center text-center">
        <span className="truncate text-xs text-muted-foreground">{focus ? focus.name : label}</span>
        <Money amountMinor={focus ? focus.value : total} currency={currency} className="text-lg font-semibold" />
        {focus && <span className="text-xs text-muted-foreground">{pct(focus.value, total)}</span>}
      </div>
      <figcaption className="sr-only">
        {label}: {slices.map((s) => `${s.name} ${formatCurrency(s.value, currency)}, ${pct(s.value, total)}`).join("; ")}
      </figcaption>
    </figure>
  );
}
