/** Maps an AI filter-proposal response onto the same expression tree the advanced builder edits. */
import { makeCondition, makeGroup, type FilterNodeLocal, type FilterRoot, type SortState } from "./filterModel";
import type { FilterNode } from "@/shared/types/transactionQuery";
import type { FilterProposalSortKey } from "@/shared/types/aiFilter";

function fromWireNode(node: FilterNode): FilterNodeLocal {
  if (node.kind === "group") return makeGroup(node.op, node.children.map(fromWireNode));
  return makeCondition(node.field, node.operator, node.value);
}

/** The server always returns a top-level group; wrap defensively if that ever changes. */
export function fromWireFilter(node: FilterNode): FilterRoot {
  const local = fromWireNode(node);
  return local.kind === "group" ? local : makeGroup("AND", [local]);
}

export function fromWireSort(sort: FilterProposalSortKey[] | null | undefined): SortState {
  return (sort ?? []).map((s) => ({ field: s.field, direction: s.direction }));
}
