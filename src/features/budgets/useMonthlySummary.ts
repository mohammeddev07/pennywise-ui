import { useQuery } from "@tanstack/react-query";
import { useBooksStore } from "@/features/books/store";
import { guardEpoch } from "@/features/transactions/queries";
import { getMonthlySummary } from "@/shared/api/summary";
import { todayInTimeZone } from "@/shared/utils/ledgerDate";

/** The selected book and its current `YYYY-MM`, read in the book's own time zone. */
export function useBookMonth() {
  const bookId = useBooksStore((s) => s.selectedBookId);
  const book = useBooksStore((s) => s.books.find((b) => b.id === s.selectedBookId));
  return { bookId, book, month: todayInTimeZone(book?.timezone).slice(0, 7) };
}

/**
 * Same key as Home (and mobile), so both screens share one cache entry. `["summary", bookId, ...]` is what
 * `invalidateTransactionData` and the book coordinator refresh and drop; logout clears the whole cache.
 */
export function useMonthlySummary(bookId: string, month: string) {
  return useQuery({
    queryKey: ["summary", bookId, month],
    queryFn: () => guardEpoch(() => getMonthlySummary(bookId, month)),
    enabled: Boolean(bookId && month),
  });
}
