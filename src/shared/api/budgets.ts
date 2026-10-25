import { apiClient } from "@/shared/api/client";
import type { BudgetResponse } from "@/shared/types/api";

export async function listBudgets(bookId: string, month: string): Promise<{ items: BudgetResponse[] }> {
  const { data } = await apiClient.get<{ items: BudgetResponse[] }>(`/v1/books/${bookId}/budgets`, {
    params: { month },
  });
  return data;
}

export async function upsertBudget(
  bookId: string,
  categoryId: string,
  month: string,
  amountMinor: number,
  version?: number
): Promise<BudgetResponse> {
  const { data } = await apiClient.put<BudgetResponse>(
    `/v1/books/${bookId}/budgets/${categoryId}`,
    { amountMinor },
    {
      params: { month },
      headers: version !== undefined ? { "If-Match": `"${version}"` } : undefined,
    }
  );
  return data;
}

export async function deleteBudget(
  bookId: string,
  categoryId: string,
  month: string,
  version: number
): Promise<void> {
  await apiClient.delete(`/v1/books/${bookId}/budgets/${categoryId}`, {
    params: { month },
    headers: { "If-Match": `"${version}"` },
  });
}
