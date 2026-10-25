import { apiClient } from "@/shared/api/client";
import type { BalanceResponse, MonthlySummaryResponse, RangeSummaryResponse } from "@/shared/types/api";

export async function getBalance(bookId: string): Promise<BalanceResponse> {
  const { data } = await apiClient.get<BalanceResponse>(`/v1/books/${bookId}/balance`);
  return data;
}

export async function getMonthlySummary(bookId: string, month: string): Promise<MonthlySummaryResponse> {
  const { data } = await apiClient.get<MonthlySummaryResponse>(`/v1/books/${bookId}/summary/monthly`, {
    params: { month },
  });
  return data;
}

export async function getRangeSummary(
  bookId: string,
  startDate: string,
  endDate: string
): Promise<RangeSummaryResponse> {
  const { data } = await apiClient.get<RangeSummaryResponse>(`/v1/books/${bookId}/summary/range`, {
    params: { startDate, endDate },
  });
  return data;
}
