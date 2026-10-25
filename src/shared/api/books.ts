import { apiClient } from "@/shared/api/client";
import type { BookResponse } from "@/shared/types/api";

export async function listBooks(): Promise<{ items: BookResponse[] }> {
  const { data } = await apiClient.get<{ items: BookResponse[] }>("/v1/books");
  return data;
}

export async function createBook(
  name: string,
  currencyCode: string,
  timezone: string,
  openingBalanceMinor = 0,
  style?: { icon?: string; color?: string }
): Promise<BookResponse> {
  const { data } = await apiClient.post<BookResponse>("/v1/books", {
    name,
    currencyCode,
    timezone,
    openingBalanceMinor,
    ...style,
  });
  return data;
}

export async function patchBook(id: string, version: number, patch: string | { name?: string; icon?: string; color?: string }): Promise<BookResponse> {
  const { data } = await apiClient.patch<BookResponse>(
    `/v1/books/${id}`,
    typeof patch === "string" ? { name: patch } : patch,
    { headers: { "If-Match": `"${version}"` } }
  );
  return data;
}

export async function deleteBook(id: string, version: number): Promise<void> {
  await apiClient.delete(`/v1/books/${id}`, { headers: { "If-Match": `"${version}"` } });
}

export async function reorderBooks(bookIds: string[]): Promise<void> {
  await apiClient.put("/v1/books/order", { bookIds });
}
