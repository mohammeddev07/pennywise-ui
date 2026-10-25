/** Contract for POST /v1/books/{bookId}/filter-proposals ("Describe your filter"). */

import type { FilterNode, QueryField } from "@/shared/types/transactionQuery";

export type FilterProposalStatus = "PROPOSAL" | "CLARIFY" | "UNSUPPORTED";

export interface FilterProposalSortKey {
  field: QueryField;
  direction: "ASC" | "DESC";
}

export interface FilterProposalRequest {
  /** <= 500 characters. */
  text: string;
}

export interface FilterProposalResponse {
  status: FilterProposalStatus;
  /** Set only for PROPOSAL. Same wire shape as any other filter - the advanced builder renders it as-is. */
  filter: FilterNode | null;
  sort: FilterProposalSortKey[] | null;
  /** Server-generated from the validated filter, never model prose. */
  summary: string | null;
  /** Set only for CLARIFY: a one-sentence ask to rephrase. */
  clarification: string | null;
  /** Set for UNSUPPORTED, or as a side note on a PROPOSAL (e.g. a partial limitation). */
  limitation: string | null;
}
