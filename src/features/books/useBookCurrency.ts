import { useBooksStore } from "@/features/books/store";
import { useSettingsStore } from "@/features/settings/store";
import type { CurrencyCode } from "@/shared/types/models";

/**
 * Currency is a property of the book, chosen once when the book is created and
 * immutable afterwards. Every screen must resolve it through here so a single
 * book always renders in one currency.
 *
 * The account-level `primaryCurrency` is only a pre-book fallback (onboarding,
 * or a frame rendered before books have hydrated). It is never user-editable
 * after setup.
 */
export function useBookCurrency(bookId?: string): CurrencyCode {
  const books = useBooksStore((s) => s.books);
  const selectedBookId = useBooksStore((s) => s.selectedBookId);
  const fallback = useSettingsStore((s) => s.primaryCurrency);

  const id = bookId || selectedBookId;
  const book = books.find((b) => b.id === id);
  return (book?.currencyCode ?? fallback) as CurrencyCode;
}
