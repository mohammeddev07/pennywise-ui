import { hasBookOperation } from "./operations";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as booksApi from "@/shared/api/books";
import { getApiErrorMessage } from "@/shared/api/errors";
import type { Book } from "@/shared/types/models";
import { useSettingsStore } from "@/features/settings/store";
import {
  getAccountEpoch,
  isCurrentAccountEpoch,
} from "@/shared/session/accountEpoch";
import {
  BOOK_CURRENCIES,
  isBookColor,
  isBookIcon,
  validateBookName,
} from "./constants";
export type { Book };
export type AddBookInput = {
  name: string;
  currencyCode?: string;
  timezone?: string;
  openingBalanceMinor?: number;
  icon?: string;
  color?: string;
};
export type BookPatch = Partial<Pick<Book, "name" | "icon" | "color">>;
type State = {
  books: Book[];
  selectedBookId: string;
  isLoading: boolean;
  error: string | null;
  ready: boolean;
  isManaging: boolean;
  loadBooks: () => Promise<Book[]>;
  ensureBook: (input: AddBookInput) => Promise<string>;
  setSelectedBookId: (id: string) => void;
  addBook: (input: AddBookInput) => Promise<string>;
  updateBook: (id: string, patch: BookPatch) => Promise<void>;
  removeBook: (id: string, expectedVersion?: number) => Promise<boolean>;
  reorderBooks: (ids: string[]) => Promise<void>;
};
export function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
export function normalizeBook(input: any): Book {
  const now = new Date().toISOString();
  return {
    id: String(input.id),
    name: String(input.name ?? "Untitled"),
    currencyCode: String(input.currencyCode ?? "USD"),
    timezone: String(input.timezone ?? deviceTimezone()),
    openingBalanceMinor: Number(input.openingBalanceMinor ?? 0) || 0,
    version: Number(input.version ?? 0) || 0,
    createdAt: String(input.createdAt ?? now),
    updatedAt: String(input.updatedAt ?? input.createdAt ?? now),
    icon: input.icon ?? "book",
    color: input.color ?? "green",
    sortOrder: input.sortOrder ?? 0,
    // An absent balance is unknown, not the opening balance (transactions may exist).
    balanceMinor:
      typeof input.balanceMinor === "number" ? input.balanceMinor : undefined,
  };
}
export function selectedOrFirst(books: Book[], id?: string) {
  return books.some((b) => b.id === id) ? id! : (books[0]?.id ?? "");
}
let ensureInFlight: { epoch: number; promise: Promise<string> } | null = null;
let loadInFlight: { epoch: number; promise: Promise<Book[]> } | null = null;
let managementEpoch: number | null = null;
let reconciling = false;
async function manage<T>(work: (epoch: number) => Promise<T>): Promise<T> {
  const epoch = getAccountEpoch();
  if (hasBookOperation())
    throw new Error("Wait for the current operation before managing books.");
  if (managementEpoch === epoch)
    throw new Error("Please wait for the current book operation.");
  managementEpoch = epoch;
  useBooksStore.setState({ isManaging: true });
  try {
    // Finish pending list reads before changing the same state. A failed or
    // uncertain load must be reconciled before accepting another mutation.
    reconciling = true;
    if (loadInFlight?.epoch === epoch) await loadInFlight.promise;
    if (!useBooksStore.getState().ready)
      await useBooksStore.getState().loadBooks();
    if (!isCurrentAccountEpoch(epoch))
      throw new Error("Your account changed. Please try again.");
    reconciling = false;
    return await work(epoch);
  } catch (error) {
    if (isCurrentAccountEpoch(epoch)) {
      if (loadInFlight?.epoch === epoch)
        await loadInFlight.promise.catch(() => {});
      reconciling = true;
      // A timeout may occur after the server committed. Reconcile before another write.
      try {
        await useBooksStore.getState().loadBooks();
      } catch {
        useBooksStore.setState({ ready: false });
      }
    }
    throw error;
  } finally {
    // Reads started during the write cannot replace its result with an older list.
    if (loadInFlight?.epoch === epoch)
      await loadInFlight.promise.catch(() => {});
    if (managementEpoch === epoch) {
      managementEpoch = null;
      reconciling = false;
    }
    if (isCurrentAccountEpoch(epoch))
      useBooksStore.setState({ isManaging: false });
  }
}
export const useBooksStore = create<State>()(
  persist(
    (set, get) => ({
      books: [],
      selectedBookId: "",
      isLoading: false,
      error: null,
      ready: false,
      isManaging: false,
      loadBooks: () => {
        const epoch = getAccountEpoch();
        if (loadInFlight?.epoch === epoch) return loadInFlight.promise;
        set({ isLoading: true, error: null });
        const promise = (async () => {
          try {
            if (!useBooksStore.persist.hasHydrated())
              await useBooksStore.persist.rehydrate();
            const res = await booksApi.listBooks();
            const books = res.items.map(normalizeBook);
            if (!isCurrentAccountEpoch(epoch)) return [];
            if (managementEpoch === epoch && !reconciling) {
              set({ isLoading: false });
              return get().books;
            }
            set({
              books,
              selectedBookId: selectedOrFirst(books, get().selectedBookId),
              isLoading: false,
              error: null,
              ready: true,
            });
            return books;
          } catch (error) {
            if (isCurrentAccountEpoch(epoch))
              set({
                isLoading: false,
                error: getApiErrorMessage(error, "Could not load books"),
              });
            throw error;
          } finally {
            if (loadInFlight?.epoch === epoch) loadInFlight = null;
          }
        })();
        loadInFlight = { epoch, promise };
        return promise;
      },
      ensureBook: async (input) => {
        const epoch = getAccountEpoch();
        if (ensureInFlight?.epoch === epoch) return ensureInFlight.promise;
        const promise = (async () => {
          const books = await get().loadBooks();
          if (!isCurrentAccountEpoch(epoch)) return "";
          return books.length
            ? selectedOrFirst(books, get().selectedBookId)
            : get().addBook(input);
        })();
        ensureInFlight = { epoch, promise };
        try {
          return await promise;
        } finally {
          if (ensureInFlight?.promise === promise) ensureInFlight = null;
        }
      },
      setSelectedBookId: (id) =>
        set({ selectedBookId: selectedOrFirst(get().books, id) }),
      addBook: (input) =>
        manage(async (epoch) => {
          const name = validateBookName(input.name);
          const currency =
            input.currencyCode ??
            useSettingsStore.getState().primaryCurrency ??
            "USD";
          if (!(BOOK_CURRENCIES as readonly string[]).includes(currency))
            throw new Error("Choose a supported currency.");
          const opening = input.openingBalanceMinor ?? 0;
          if (!Number.isSafeInteger(opening))
            throw new Error(
              "Opening balance must be a safe integer in minor units.",
            );
          if (input.icon !== undefined && !isBookIcon(input.icon))
            throw new Error("Choose a valid icon.");
          if (input.color !== undefined && !isBookColor(input.color))
            throw new Error("Choose a valid color.");
          const book = normalizeBook(
            await booksApi.createBook(
              name,
              currency,
              input.timezone ?? deviceTimezone(),
              opening,
              { icon: input.icon, color: input.color },
            ),
          );
          if (!isCurrentAccountEpoch(epoch)) return "";
          set((s) => ({
            books: [...s.books.filter((b) => b.id !== book.id), book],
            selectedBookId: book.id,
            ready: true,
          }));
          return book.id;
        }),
      updateBook: (id, input) =>
        manage(async (epoch) => {
          const current = get().books.find((b) => b.id === id);
          if (!current) throw new Error("This book is no longer available.");
          const patch: BookPatch = {};
          if (input.name !== undefined) {
            const name = validateBookName(input.name);
            if (name !== current.name) patch.name = name;
          }
          if (input.icon !== undefined) {
            if (!isBookIcon(input.icon))
              throw new Error("Choose a valid icon.");
            if (input.icon !== current.icon) patch.icon = input.icon;
          }
          if (input.color !== undefined) {
            if (!isBookColor(input.color))
              throw new Error("Choose a valid color.");
            if (input.color !== current.color) patch.color = input.color;
          }
          if (!Object.keys(patch).length) return;
          const book = normalizeBook(
            await booksApi.patchBook(
              id,
              current.version,
              patch,
            ),
          );
          if (isCurrentAccountEpoch(epoch))
            set((s) => ({
              books: s.books.map((b) => (b.id === id ? book : b)),
            }));
        }),
      removeBook: (id, expectedVersion) =>
        manage(async (epoch) => {
          const current = get().books.find((b) => b.id === id);
          if (!current) throw new Error("This book is no longer available.");
          if (get().books.length <= 1)
            throw new Error("Keep at least one cash book.");
          if (
            expectedVersion !== undefined &&
            current.version !== expectedVersion
          )
            throw new Error(
              "This book changed. Review it and confirm deletion again.",
            );
          await booksApi.deleteBook(id, current.version);
          if (!isCurrentAccountEpoch(epoch)) return false;
          set((s) => {
            const books = s.books.filter((b) => b.id !== id);
            return {
              books,
              selectedBookId: selectedOrFirst(books, s.selectedBookId),
            };
          });
          return true;
        }),
      reorderBooks: (ids) =>
        manage(async (epoch) => {
          const before = get().books;
          if (
            ids.length !== before.length ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !before.some((b) => b.id === id))
          )
            throw new Error("The book list changed. Reload it and try again.");
          set({
            books: ids.map((id, sortOrder) => ({
              ...before.find((b) => b.id === id)!,
              sortOrder,
            })),
          });
          try {
            await booksApi.reorderBooks(ids);
          } catch (error) {
            if (isCurrentAccountEpoch(epoch)) set({ books: before });
            throw error;
          }
        }),
    }),
    {
      name: "pennywise_books_v1",
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ books: s.books, selectedBookId: s.selectedBookId }),
      migrate: (persisted: any) => {
        const books = Array.isArray(persisted?.books)
          ? persisted.books
              .filter(
                (b: any) =>
                  typeof b?.currencyCode === "string" &&
                  typeof b?.version === "number",
              )
              .map(normalizeBook)
          : [];
        return {
          books,
          selectedBookId: selectedOrFirst(books, persisted?.selectedBookId),
        };
      },
    },
  ),
);
