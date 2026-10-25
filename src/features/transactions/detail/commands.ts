import type { InfiniteData } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store";
import { queryClient } from "@/shared/api/queryClient";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { confirmDestructive } from "@/shared/ui/utils/confirm";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { deleteTransaction, duplicateTransaction } from "../actions";
import { isNotFoundError, type Transaction } from "../model";
import { invalidateTransactionData, txKeys, type SearchPage } from "../queries";

const SEARCH_KEY = ["transactions", "search"] as const;
const scopeOf = (tx: Transaction) => ({ accountId: useAuthStore.getState().user?.id ?? "", bookId: tx.bookId });

/** Lets the detail view paint a row the list already has; it is marked stale so it still refetches. */
export function seedDetail(tx: Transaction) {
  const key = txKeys.detail(scopeOf(tx), tx.id);
  if (!queryClient.getQueryData(key)) queryClient.setQueryData(key, tx, { updatedAt: 0 });
}

/**
 * Confirm, then delete optimistically: the row leaves every cached search page at once and
 * `onRemoved` runs (close the detail). A failed delete puts the pages back and says why; a 404
 * means it is already gone, so the removal stands and the caches refresh.
 */
export function deleteWithConfirm(tx: Transaction, currency: string, onRemoved?: () => void) {
  const what = `${tx.title?.trim() || tx.categoryName}, ${formatCurrency(tx.amountMinor, currency)}`;
  confirmDestructive("Delete this transaction?", `${what} will be removed from your totals and charts. This can't be undone.`, async () => {
    await queryClient.cancelQueries({ queryKey: SEARCH_KEY });
    const snapshot = queryClient.getQueriesData<InfiniteData<SearchPage>>({ queryKey: SEARCH_KEY });
    queryClient.setQueriesData<InfiniteData<SearchPage>>({ queryKey: SEARCH_KEY }, (data) => {
      if (!data || !data.pages.some((p) => p.items.some((i) => i.id === tx.id))) return data;
      return {
        ...data,
        pages: data.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== tx.id), totalCount: Math.max(0, p.totalCount - 1) })),
      };
    });
    onRemoved?.();
    try {
      await deleteTransaction(tx);
    } catch (error) {
      if (isNotFoundError(error)) {
        void invalidateTransactionData(queryClient, tx.bookId, { months: [tx.occurredOn] });
        return;
      }
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      useUndoToastStore.getState().showError(error, "Could not delete transaction.");
    }
  });
}

/** A real create with a fresh idempotency key (see actions.ts). Resolves to the copy, or null. */
export async function duplicate(tx: Transaction): Promise<Transaction | null> {
  try {
    return await duplicateTransaction(tx);
  } catch (error) {
    useUndoToastStore.getState().showError(error, "Could not duplicate transaction.");
    return null;
  }
}
