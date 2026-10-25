/**
 * Phase 1 reconciliation fixture: 288 live ledger rows over 18 months (+ soft-deleted rows) in the
 * signed-in user's book, and a second book that belongs to another user with the same categories,
 * amounts and dates - so any cross-book leak changes a total.
 *
 * Deterministic and anchored to `today`, so every expected figure below is computed by plain array
 * code in the tests, independently of the mock server's filter/analyze engine.
 */
import type { BookResponse, CategoryResponse, TransactionResponse } from "@/shared/types/api";
import { addMonthsYmd, startOfMonthYmd, type Ymd } from "@/shared/utils/ledgerDate";
import { mockBackend } from "@/shared/api/mockAdapter";

export const MONTHS = 18;
export const PER_MONTH = 16;

const CATEGORY_NAMES = [
  ["Food", "EXPENSE"],
  ["Transport", "EXPENSE"],
  ["Shopping", "EXPENSE"],
  ["Rent", "EXPENSE"],
  ["Salary", "INCOME"],
] as const;

export type Fixture = {
  today: Ymd;
  book: BookResponse;
  otherBook: BookResponse;
  cat: Record<"Food" | "Transport" | "Shopping" | "Rent" | "Salary", CategoryResponse>;
  otherCat: Record<string, CategoryResponse>;
  /** Every row in the fixture book, deleted ones included (they must never be counted). */
  rows: TransactionResponse[];
  live: TransactionResponse[];
  otherRows: TransactionResponse[];
};

function makeBook(id: string, name: string): BookResponse {
  return {
    id,
    name,
    currencyCode: "USD",
    timezone: "UTC",
    openingBalanceMinor: 123456,
    version: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
  } as BookResponse;
}

function makeCategories(bookId: string) {
  const out: Record<string, CategoryResponse> = {};
  for (const [name, type] of CATEGORY_NAMES) {
    out[name] = {
      id: `${bookId === "fx-book-A" ? "a" : "b"}0000000-0000-4000-8000-${String(CATEGORY_NAMES.findIndex(([n]) => n === name)).padStart(12, "0")}`,
      bookId,
      type,
      name,
      icon: "cart",
      color: "#22C55E",
      isDisabled: false,
      version: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      deletedAt: null,
    } as CategoryResponse;
  }
  return out;
}

function makeRows(bookId: string, cats: Record<string, CategoryResponse>, today: Ymd, tag: string, withDeleted: boolean) {
  const rows: TransactionResponse[] = [];
  const cycle = ["Food", "Transport", "Shopping", "Rent"];
  const createdBase = Date.parse("2025-01-01T00:00:00Z");
  for (let m = 0; m < MONTHS; m++) {
    const monthStart = startOfMonthYmd(addMonthsYmd(today, -(MONTHS - 1 - m)));
    for (let j = 0; j < PER_MONTH; j++) {
      const i = m * PER_MONTH + j;
      const day = 1 + ((j * 5 + m * 3) % 27);
      const occurredOn = `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
      const income = j === 0;
      const category = cats[income ? "Salary" : cycle[j % 4]];
      const payment = j % 3 === 0 ? "CARD" : j % 3 === 1 ? "CASH" : null;
      rows.push({
        id: `${tag}-${String(i).padStart(4, "0")}`,
        bookId,
        type: category.type,
        // j % 5 === 0 forces many equal amounts, exercising the id tie-breaker.
        amountMinor: j % 5 === 0 ? 2500 : 1500 + ((i * 733) % 9000),
        occurredOn,
        occurredAt: `${occurredOn}T12:00:00.000Z`,
        title: `${tag} ${i}`,
        categoryId: category.id,
        category: { id: category.id, name: category.name, type: category.type },
        categoryName: category.name,
        paymentMethod: payment,
        note: null,
        externalId: null,
        version: 1,
        createdAt: new Date(createdBase + i * 1000).toISOString(),
        updatedAt: new Date(createdBase + i * 1000).toISOString(),
        deletedAt: withDeleted && i % 40 === 7 ? "2025-06-01T00:00:00.000Z" : null,
      } as TransactionResponse);
    }
  }
  return rows;
}

export function buildFixture(today: Ymd): Fixture {
  const book = makeBook("fx-book-A", "Fixture book");
  const otherBook = makeBook("fx-book-B", "Another user's book");
  const cats = makeCategories(book.id);
  const otherCat = makeCategories(otherBook.id);
  const rows = makeRows(book.id, cats, today, "A", true);
  const otherRows = makeRows(otherBook.id, otherCat, today, "B", false);
  return {
    today,
    book,
    otherBook,
    cat: cats as Fixture["cat"],
    otherCat,
    rows,
    live: rows.filter((r) => !r.deletedAt),
    otherRows,
  };
}

const original = {
  books: mockBackend.state.books,
  categories: mockBackend.state.categories,
  transactions: mockBackend.state.transactions,
  budgets: mockBackend.state.budgets,
};

/** Replaces the mock backend's data with the fixture (deep copies: edits in a test never touch the fixture). */
export function installFixture(fx: Fixture) {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  mockBackend.state.books = [fx.book, fx.otherBook].map(clone);
  mockBackend.state.categories = [...Object.values(fx.cat), ...Object.values(fx.otherCat)].map(clone);
  mockBackend.state.transactions = [...fx.rows, ...fx.otherRows].map(clone);
  mockBackend.state.budgets = [];
}

export function restoreBackend() {
  mockBackend.state.books = original.books;
  mockBackend.state.categories = original.categories;
  mockBackend.state.transactions = original.transactions;
  mockBackend.state.budgets = original.budgets;
}
