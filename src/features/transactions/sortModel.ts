// Pure sort helpers from pennywise-mobile's ActivityTable.tsx / SortSheet.tsx, kept out of the web UI files.
import type { QueryField, SortKey } from "@/shared/types/transactionQuery";
import { DEFAULT_SORT, SORT_FIELD_LABELS, fieldMeta, sanitizeSort, type SortState } from "./filterModel";

/**
 * Header click -> the next sort. Same column flips direction, a new column starts at its natural
 * direction; date is the tie-breaker so equal values keep a stable, newest-first order.
 */
export function nextSort(sort: SortState, field: QueryField, first: "ASC" | "DESC"): SortState {
  const cur = sort[0] ?? { field: "occurredOn" as const, direction: "DESC" as const };
  const direction = cur.field === field ? (cur.direction === "ASC" ? "DESC" : "ASC") : first;
  return sanitizeSort([
    { field, direction },
    ...(field === "occurredOn" ? [] : [{ field: "occurredOn" as const, direction: "DESC" as const }]),
  ]);
}

export function directionLabels(field: QueryField): { ASC: string; DESC: string } {
  const kind = fieldMeta(field).kind;
  if (kind === "DATE" || kind === "TIMESTAMP") return { ASC: "Oldest first", DESC: "Newest first" };
  if (kind === "NUMBER") return { ASC: "Lowest first", DESC: "Highest first" };
  return { ASC: "A to Z", DESC: "Z to A" };
}

/** The whole order reversed - every key flips, so ties reverse too. Empty means the server default. */
export function reverseSort(sort: SortKey[]): SortKey[] {
  return (sort.length ? sort : DEFAULT_SORT).map((s) => ({ ...s, direction: s.direction === "ASC" ? "DESC" : "ASC" }));
}

/** "Date (newest first), then Amount (highest first)" - the server's order, in words. */
export function describeSort(sort: SortKey[]) {
  if (sort.length === 0) return "Date (newest first)";
  return sort.map((s) => `${SORT_FIELD_LABELS[s.field]} (${directionLabels(s.field)[s.direction].toLowerCase()})`).join(", then ");
}
