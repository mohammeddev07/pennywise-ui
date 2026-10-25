import { apiClient } from "@/shared/api/client";
import type { CategoryResponse, CategoryUpdateRequest, TransactionType } from "@/shared/types/api";

export async function listCategories(bookId: string): Promise<{ items: CategoryResponse[] }> {
  const { data } = await apiClient.get<{ items: CategoryResponse[] }>(`/v1/books/${bookId}/categories`);
  return data;
}

export async function createCategory(
  bookId: string,
  type: TransactionType,
  name: string,
  icon?: string,
  color?: string
): Promise<CategoryResponse> {
  const { data } = await apiClient.post<CategoryResponse>(`/v1/books/${bookId}/categories`, {
    type,
    name,
    icon,
    color,
  });
  return data;
}

export async function patchCategory(
  bookId: string,
  categoryId: string,
  version: number,
  patch: CategoryUpdateRequest
): Promise<CategoryResponse> {
  const { data } = await apiClient.patch<CategoryResponse>(
    `/v1/books/${bookId}/categories/${categoryId}`,
    patch,
    { headers: { "If-Match": `"${version}"` } }
  );
  return data;
}

export async function deleteCategory(bookId: string, categoryId: string, version: number): Promise<void> {
  await apiClient.delete(`/v1/books/${bookId}/categories/${categoryId}`, {
    headers: { "If-Match": `"${version}"` },
  });
}
