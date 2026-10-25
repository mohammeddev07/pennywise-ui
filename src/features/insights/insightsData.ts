import type { CategoryTotal } from "@/shared/types/transactionQuery";

export const OTHER_ID = "__other";
/** Part-to-whole stays readable up to ~6 segments; the tail folds into "Other". */
export const DONUT_SLICES = 5;

export type Slice = { id: string; name: string; value: number; color: string };

/**
 * Donut segments: the biggest `max` categories in their own (persisted) color, the rest as one
 * "Other" slice. Color follows the category, never its rank, so filtering never repaints a slice.
 */
export function donutSlices(rows: CategoryTotal[], colorOf: (id: string) => string, max = DONUT_SLICES): Slice[] {
  const positive = rows.filter((r) => r.totalMinor > 0);
  const head = positive.slice(0, max).map((r) => ({ id: r.categoryId, name: r.categoryName, value: r.totalMinor, color: colorOf(r.categoryId) }));
  const rest = positive.slice(max).reduce((sum, r) => sum + r.totalMinor, 0);
  return rest > 0 ? [...head, { id: OTHER_ID, name: "Other", value: rest, color: "var(--subtle)" }] : head;
}

/** Which donut slice a category row lights up: its own, or "Other" for the folded tail. */
export function sliceIdFor(slices: Slice[], categoryId: string) {
  return slices.some((s) => s.id === categoryId) ? categoryId : OTHER_ID;
}
