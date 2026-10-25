import { apiClient, BASE_URL } from "@/shared/api/client";
import type {
  ImportResponse,
  TransactionCreatePayload,
  TransactionListParams,
  TransactionListResponse,
  TransactionResponse,
  TransactionUpdatePayload,
} from "@/shared/types/api";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  SearchRequest,
  SearchResponse,
  TransactionQuery,
} from "@/shared/types/transactionQuery";

export async function listTransactions(
  bookId: string,
  params?: TransactionListParams
): Promise<TransactionListResponse> {
  const { data } = await apiClient.get<TransactionListResponse>(`/v1/books/${bookId}/transactions`, { params });
  return data;
}

/** Full-ledger, server-sorted, offset-paged search (P1.2). `signal` cancels an obsolete request. */
export async function searchTransactions(
  bookId: string,
  body: SearchRequest,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const { data } = await apiClient.post<SearchResponse>(`/v1/books/${bookId}/transactions/search`, body, { signal });
  return data;
}

/** Totals, category and bucket aggregates over every matching row (P1.3). */
export async function analyzeTransactions(
  bookId: string,
  body: AnalyzeRequest,
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  const { data } = await apiClient.post<AnalyzeResponse>(`/v1/books/${bookId}/transactions/analyze`, body, { signal });
  return data;
}

/** One transaction by id, independent of whether any list has it loaded. */
export async function getTransaction(bookId: string, txId: string, signal?: AbortSignal): Promise<TransactionResponse> {
  const { data } = await apiClient.get<TransactionResponse>(`/v1/books/${bookId}/transactions/${txId}`, { signal });
  return data;
}

export function exportQueryUrl(bookId: string): string {
  return `${BASE_URL}/v1/books/${bookId}/transactions/export/query`;
}

/** An `arraybuffer` response hides the server's JSON error body; decode it so messages like "narrow the filter" surface. */
function decodeErrorBody(data: unknown): unknown {
  if (!(data instanceof ArrayBuffer)) return data;
  try {
    const bytes = new Uint8Array(data);
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return JSON.parse(decodeURIComponent(escape(text)));
  } catch {
    return undefined;
  }
}

/** XLSX of every row matching the exact filter + sort (P1.3). */
export async function exportQuery(bookId: string, query: TransactionQuery): Promise<ArrayBuffer> {
  try {
    const { data } = await apiClient.post<ArrayBuffer>(`/v1/books/${bookId}/transactions/export/query`, query, {
      responseType: "arraybuffer",
      timeout: 60_000,
    });
    return data;
  } catch (error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (response) response.data = decodeErrorBody(response.data);
    throw error;
  }
}

export async function createTransaction(
  bookId: string,
  idempotencyKey: string,
  payload: TransactionCreatePayload
): Promise<TransactionResponse> {
  const { data } = await apiClient.post<TransactionResponse>(`/v1/books/${bookId}/transactions`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return data;
}

export async function patchTransaction(
  bookId: string,
  txId: string,
  version: number,
  patch: TransactionUpdatePayload
): Promise<TransactionResponse> {
  const { data } = await apiClient.patch<TransactionResponse>(
    `/v1/books/${bookId}/transactions/${txId}`,
    patch,
    { headers: { "If-Match": `"${version}"` } }
  );
  return data;
}

export async function deleteTransaction(bookId: string, txId: string, version: number): Promise<void> {
  await apiClient.delete(`/v1/books/${bookId}/transactions/${txId}`, {
    headers: { "If-Match": `"${version}"` },
  });
}

export async function importTransactions(
  bookId: string,
  file: { uri: string; name: string; mimeType: string }
): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);

  const { data } = await apiClient.post<ImportResponse>(`/v1/books/${bookId}/transactions/import`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });
  return data;
}

export function exportTransactionsUrl(bookId: string): string {
  return `${BASE_URL}/v1/books/${bookId}/transactions/export`;
}
