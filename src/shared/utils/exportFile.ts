import { duringBookOperation } from "@/features/books/operations";
import { apiClient, USE_MOCK_API } from "@/shared/api/client";
import { exportQuery, exportTransactionsUrl } from "@/shared/api/transactions";
import type { TransactionQuery } from "@/shared/types/transactionQuery";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class MockModeUnsupportedError extends Error {
  constructor() {
    super("Export needs a real backend - not available while VITE_MOCK_API=true.");
    this.name = "MockModeUnsupportedError";
  }
}

function download(bytes: BlobPart, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName };
}

/** Downloads the book's whole transactions export. A plain link can't carry the bearer token, so fetch it. */
async function exportTransactionsToDeviceImpl(bookId: string): Promise<{ fileName: string }> {
  if (USE_MOCK_API) throw new MockModeUnsupportedError();
  const res = await apiClient.get<ArrayBuffer>(exportTransactionsUrl(bookId), { responseType: "arraybuffer", timeout: 60_000 });
  return download(res.data, `pennywise-export-${bookId}-${Date.now()}.xlsx`);
}

/** Exports every row matching the exact applied filter + sort, not the visible page. */
async function exportQueryToDeviceImpl(bookId: string, query: TransactionQuery): Promise<{ fileName: string }> {
  if (USE_MOCK_API) throw new MockModeUnsupportedError();
  return download(await exportQuery(bookId, query), `pennywise-export-filtered-${bookId}-${Date.now()}.xlsx`);
}

export function exportTransactionsToDevice(...args: Parameters<typeof exportTransactionsToDeviceImpl>) {
  return duringBookOperation(() => exportTransactionsToDeviceImpl(...args));
}

export function exportQueryToDevice(...args: Parameters<typeof exportQueryToDeviceImpl>) {
  return duringBookOperation(() => exportQueryToDeviceImpl(...args));
}
