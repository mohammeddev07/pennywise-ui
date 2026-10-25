import { apiClient } from "@/shared/api/client";
import type { FilterProposalRequest, FilterProposalResponse } from "@/shared/types/aiFilter";

/** The provider request keeps its warm timeout; a cold startup must not extend AI work. */
export async function proposeFilter(
  bookId: string,
  text: string,
  signal?: AbortSignal
): Promise<FilterProposalResponse> {
  const body: FilterProposalRequest = { text };
  const { data } = await apiClient.post<FilterProposalResponse>(
    `/v1/books/${bookId}/filter-proposals`,
    body,
    { signal, _skipColdStartTimeout: true }
  );
  return data;
}
