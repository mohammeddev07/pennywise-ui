export type CurrencyCode = string;

export type TransactionType = "INCOME" | "EXPENSE";

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "WALLET" | "OTHER";

export type ApiErrorResponse = {
  status?: number;
  error?:
    | string
    | {
        code?: string;
        message?: string;
        details?: unknown;
        requestId?: string;
      };
  message?: string;
  requestId?: string;
};

export type MeResponse = {
  id: string;
  email: string | null;
  defaultCurrencyCode: string | null;
  createdAt: string;
};

export type MeUpdateRequest = {
  defaultCurrencyCode?: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: MeResponse;
};

export type BookResponse = {
  /** Optional for older servers/caches. Unknown keys are preserved, never written back. */
  icon?: string;
  color?: string;
  sortOrder?: number;
  balanceMinor?: number;
  id: string;
  name: string;
  currencyCode: string;
  timezone: string;
  openingBalanceMinor: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type CategoryResponse = {
  id: string;
  bookId: string;
  type: TransactionType;
  name: string;
  icon: string;
  color: string;
  isDisabled: boolean;
  version: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type CategoryUpdateRequest = {
  name?: string;
  icon?: string;
  color?: string;
  isDisabled?: boolean;
};

export type TransactionCategoryResponse = {
  id: string;
  name: string;
  type: TransactionType;
};

export type TransactionResponse = {
  id: string;
  bookId: string;
  type: TransactionType;
  amountMinor: number;
  /** Canonical book-local ledger date (YYYY-MM-DD). Lists and summaries group by this. */
  occurredOn: string;
  /** Event instant (ISO, UTC). */
  occurredAt: string;
  title: string | null;
  categoryId: string;
  category?: TransactionCategoryResponse | null;
  categoryName?: string;
  /** null = not specified. Never defaulted to CASH by the server or the client. */
  paymentMethod: PaymentMethod | null;
  note?: string | null;
  /** Import identifier. Read-only; never sent in requests. */
  externalId?: string | null;
  version: number;
  /** Record creation instant. Immutable; distinct from occurredAt. */
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type TransactionListParams = {
  from?: string;
  to?: string;
  type?: TransactionType;
  categoryId?: string;
  q?: string;
  limit?: number;
  cursor?: string;
};

export type TransactionListResponse = {
  page: {
    items: TransactionResponse[];
    nextCursor?: string | null;
  };
};

export type TransactionCreatePayload = {
  type: TransactionType;
  amountMinor: number;
  categoryId: string;
  title?: string | null;
  note?: string | null;
  /** Omit or send null for "not specified". */
  paymentMethod?: PaymentMethod | null;
  occurredAt?: string;
  occurredOn?: string;
};

/**
 * PATCH body. Omitted = unchanged. `title`/`note`/`paymentMethod` accept an
 * explicit `null` to clear (a blank string clears title/note too). The other
 * fields reject `null`. Audit fields (id, createdAt, updatedAt, version,
 * externalId) are rejected by the server and must never be sent.
 */
export type TransactionUpdatePayload = {
  type?: TransactionType;
  amountMinor?: number;
  categoryId?: string;
  title?: string | null;
  note?: string | null;
  paymentMethod?: PaymentMethod | null;
  occurredAt?: string;
  occurredOn?: string;
};

export type BudgetResponse = {
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
  createdAt?: string;
  updatedAt?: string;
};

export type BalanceResponse = {
  bookId: string;
  currencyCode: string;
  balanceMinor: number;
};

export type MonthlySummaryCategory = {
  categoryId: string;
  categoryName: string;
  type: TransactionType;
  totalMinor: number;
  budgetMinor?: number | null;
  transactionCount: number;
};

export type MonthlySummaryResponse = {
  bookId: string;
  month: string;
  currencyCode: string;
  incomeTotalMinor: number;
  expenseTotalMinor: number;
  byCategory: MonthlySummaryCategory[];
};

export type ImportRowError = {
  rowNumber: number;
  code: string;
  message: string;
};

export type ImportResponse = {
  totalRows: number;
  importedCount: number;
  skippedBlankCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  categoriesCreated: string[];
  errors: ImportRowError[];
};

export type RangeSummaryDailyItem = {
  date: string;
  incomeTotalMinor: number;
  expenseTotalMinor: number;
};

export type RangeSummaryResponse = {
  bookId: string;
  startDate: string;
  endDate: string;
  currencyCode: string;
  incomeTotalMinor: number;
  expenseTotalMinor: number;
  transactionCount: number;
  byCategory: MonthlySummaryCategory[];
  byDay: RangeSummaryDailyItem[];
};
