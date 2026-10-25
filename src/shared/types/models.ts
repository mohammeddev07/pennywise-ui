export type BookId = string;

export type Book = {
  /** Optional for older servers/caches. Unknown keys are preserved, never written back. */
  icon?: string;
  color?: string;
  sortOrder?: number;
  balanceMinor?: number;
  id: BookId;
  name: string;
  currencyCode: string;
  timezone: string;
  openingBalanceMinor: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Canonical currency codes used across the app.
 * Keep this aligned with onboarding currency selection + settings.
 */
export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "INR";

export type TransactionKind = "INCOME" | "EXPENSE";
export type TransactionType = TransactionKind;

/**
 * Canonical payment methods used for persistence + UI labels.
 */
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "WALLET" | "OTHER";

export type Category = {
  id: string;
  bookId: string;
  type: TransactionType;
  name: string;
  icon: string;
  color: string;
  isDisabled: boolean;
  version: number;
  createdAt: string;
};

export type Transaction = {
  id: string;

  bookId: BookId;

  type: TransactionType;
  amountMinor: number;

  /** What the user typed. null when there is none - lists fall back to the category name. */
  title: string | null;
  categoryId: string;
  categoryName: string;
  note?: string;

  /** null = not specified. Display "Not specified"; never substitute CASH. */
  paymentMethod: PaymentMethod | null;

  /** Event instant (ISO, UTC). */
  occurredAt: string;
  /** Canonical book-local ledger date (YYYY-MM-DD). */
  occurredOn: string;

  /** Read-only import identifier. */
  externalId: string | null;

  /** Record creation instant (ISO). Immutable; not the transaction date. */
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type Budget = {
  id: string;
  bookId: string;
  categoryId: string;
  categoryName: string;
  month: string;
  amountMinor: number;
  spentMinor: number;
  remainingMinor: number;
  currencyCode: string;
  version: number;
};
