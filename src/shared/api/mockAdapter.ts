import { BOOK_LIMIT, BOOK_NAME_MAX, isBookIcon, isBookColor } from '@/features/books/constants';
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type {
  AuthResponse,
  BalanceResponse,
  BookResponse,
  BudgetResponse,
  CategoryResponse,
  MeResponse,
  MonthlySummaryCategory,
  MonthlySummaryResponse,
  RangeSummaryDailyItem,
  RangeSummaryResponse,
  TransactionResponse,
} from "@/shared/types/api";
import type { AnalyzeRequest, SearchRequest, TransactionQuery } from "@/shared/types/transactionQuery";
import { MockQueryError, mockAnalyze, mockExportCsv, mockSearch } from "@/shared/api/mockQuery";

/**
 * In-memory fake backend used when EXPO_PUBLIC_MOCK_API=true. Lets the app
 * run on a device/simulator with no network access to a real API server.
 */

const TX_WRITABLE_FIELDS = new Set([
  "type",
  "amountMinor",
  "categoryId",
  "title",
  "note",
  "paymentMethod",
  "occurredAt",
  "occurredOn",
]);
const TX_NULLABLE_FIELDS = new Set(["title", "note", "paymentMethod"]);

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function mockJwt() {
  const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  return `${b64url({ alg: "none" })}.${b64url({ sub: "mock", exp })}.mock`;
}

function nowIso() {
  return new Date().toISOString();
}

function currentMonth() {
  return nowIso().slice(0, 7);
}

const state = {
  user: {
    id: "mock-user-1",
    email: "demo@pennywise.local",
    defaultCurrencyCode: "USD",
    createdAt: nowIso(),
  } as MeResponse,
  bookOwners: {} as Record<string, string>,
  books: [] as BookResponse[],
  categories: [] as CategoryResponse[],
  transactions: [] as TransactionResponse[],
  budgets: [] as BudgetResponse[],
};

function seed() {
  const bookId = uid("book");
  state.bookOwners[bookId] = state.user.id;
  state.books.push({
    id: bookId,
    name: "Personal",
    icon: "book", color: "green", sortOrder: 0,
    currencyCode: "USD",
    timezone: "America/New_York",
    openingBalanceMinor: 500000,
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  });

  const categorySeeds: Array<{ type: CategoryResponse["type"]; name: string; icon: string; color: string }> = [
    { type: "INCOME", name: "Salary", icon: "cash", color: "#22C55E" },
    { type: "INCOME", name: "Freelance", icon: "laptop", color: "#3B82F6" },
    { type: "EXPENSE", name: "Groceries", icon: "cart", color: "#F59E0B" },
    { type: "EXPENSE", name: "Rent", icon: "home", color: "#EF4444" },
    { type: "EXPENSE", name: "Transport", icon: "car", color: "#8B5CF6" },
    { type: "EXPENSE", name: "Dining Out", icon: "restaurant", color: "#EC4899" },
    { type: "EXPENSE", name: "Utilities", icon: "flash", color: "#14B8A6" },
  ];

  const categories = categorySeeds.map((c) => ({
    id: uid("cat"),
    bookId,
    type: c.type,
    name: c.name,
    icon: c.icon,
    color: c.color,
    isDisabled: false,
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  }));
  state.categories.push(...categories);

  const byName = (name: string) => categories.find((c) => c.name === name)!;
  const month = currentMonth();
  const day = (n: number) => `${month}-${String(n).padStart(2, "0")}`;

  const txSeeds: Array<{
    category: CategoryResponse;
    amountMinor: number;
    title: string;
    dayOfMonth: number;
  }> = [
    { category: byName("Salary"), amountMinor: 450000, title: "Monthly salary", dayOfMonth: 1 },
    { category: byName("Rent"), amountMinor: 150000, title: "Rent", dayOfMonth: 2 },
    { category: byName("Groceries"), amountMinor: 6200, title: "Whole Foods", dayOfMonth: 4 },
    { category: byName("Transport"), amountMinor: 2500, title: "Gas", dayOfMonth: 5 },
    { category: byName("Dining Out"), amountMinor: 3400, title: "Dinner with friends", dayOfMonth: 7 },
    { category: byName("Groceries"), amountMinor: 5400, title: "Trader Joe's", dayOfMonth: 10 },
    { category: byName("Utilities"), amountMinor: 8900, title: "Electric bill", dayOfMonth: 12 },
    { category: byName("Freelance"), amountMinor: 30000, title: "Side project", dayOfMonth: 15 },
    { category: byName("Dining Out"), amountMinor: 1800, title: "Coffee", dayOfMonth: 16 },
    { category: byName("Transport"), amountMinor: 4000, title: "Rideshare", dayOfMonth: 18 },
  ];

  for (const t of txSeeds) {
    const occurredOn = day(t.dayOfMonth);
    state.transactions.push({
      id: uid("tx"),
      bookId,
      type: t.category.type,
      amountMinor: t.amountMinor,
      occurredOn,
      occurredAt: `${occurredOn}T12:00:00.000Z`,
      title: t.title,
      categoryId: t.category.id,
      category: { id: t.category.id, name: t.category.name, type: t.category.type },
      categoryName: t.category.name,
      // Alternate rows leave the payment method unspecified so the UI's "Not
      // specified" path is exercised in mock mode.
      paymentMethod: t.dayOfMonth % 2 === 0 ? "CARD" : null,
      note: null,
      externalId: null,
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    });
  }

  const budgetSeeds: Array<{ category: CategoryResponse; amountMinor: number }> = [
    { category: byName("Groceries"), amountMinor: 40000 },
    { category: byName("Dining Out"), amountMinor: 15000 },
    { category: byName("Transport"), amountMinor: 10000 },
  ];

  for (const b of budgetSeeds) {
    state.budgets.push({
      id: uid("budget"),
      bookId,
      categoryId: b.category.id,
      categoryName: b.category.name,
      month,
      amountMinor: b.amountMinor,
      spentMinor: 0,
      remainingMinor: b.amountMinor,
      currencyCode: "USD",
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

seed();

function ownedBook(id: string) {
  return state.books.find(b => b.id === id && !b.deletedAt && (state.bookOwners[b.id] ?? 'mock-user-1') === state.user.id);
}
function ownedBooks() {
  return state.books.filter(b => ownedBook(b.id)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
function bookResponse(book: BookResponse): BookResponse {
  return { ...book, icon: book.icon ?? 'book', color: book.color ?? 'green', sortOrder: book.sortOrder ?? 0,
    balanceMinor: book.openingBalanceMinor + bookRows(book.id).reduce((sum, t) => sum + (t.type === 'INCOME' ? t.amountMinor : -t.amountMinor), 0) };
}

function bookRows(bookId: string) {
  return state.transactions.filter((t) => t.bookId === bookId && !t.deletedAt);
}

/** Test/dev hooks: the mock backend's state, plus a bulk seeder for paging scenarios. */
export const mockBackend = {
  state,
  /** QA/test switch: every request fails like a dropped connection (no response), to exercise offline/stale UI. */
  offline: false,
  /** Adds `count` deterministic expense rows spread over consecutive days ending `endDate`. */
  seedTransactions(bookId: string, count: number, endDate: string) {
    const category = state.categories.find((c) => c.bookId === bookId && c.type === "EXPENSE")!;
    const base = new Date(`${endDate}T00:00:00Z`).getTime();
    for (let i = 0; i < count; i++) {
      const occurredOn = new Date(base - Math.floor(i / 3) * 86_400_000).toISOString().slice(0, 10);
      state.transactions.push({
        id: `bulk_${String(i).padStart(5, "0")}`,
        bookId,
        type: "EXPENSE",
        amountMinor: 100 + i,
        occurredOn,
        occurredAt: `${occurredOn}T12:00:00.000Z`,
        title: `Bulk ${i}`,
        categoryId: category.id,
        category: { id: category.id, name: category.name, type: category.type },
        categoryName: category.name,
        paymentMethod: i % 2 === 0 ? "CARD" : null,
        note: null,
        externalId: null,
        version: 1,
        createdAt: new Date(base + i).toISOString(),
        updatedAt: new Date(base + i).toISOString(),
        deletedAt: null,
      });
    }
  },
};

function spentForCategoryMonth(bookId: string, categoryId: string, month: string) {
  return state.transactions
    .filter(
      (t) =>
        t.bookId === bookId &&
        t.categoryId === categoryId &&
        t.type === "EXPENSE" &&
        !t.deletedAt &&
        t.occurredOn.startsWith(month)
    )
    .reduce((sum, t) => sum + t.amountMinor, 0);
}

function ok<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: "OK",
    headers: {},
    config,
    request: {},
  };
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string, code?: string): Promise<never> {
  const error = Object.assign(new Error(message), {
    isAxiosError: true,
    config,
    response: {
      data: code ? { error: { code, message }, message } : { message },
      status,
      statusText: message,
      headers: {},
      config,
    },
    toJSON: () => ({ message }),
  });
  return Promise.reject(error);
}

function parseBody(config: AxiosRequestConfig): Record<string, unknown> {
  if (!config.data) return {};
  if (typeof config.data === "string") {
    try {
      return JSON.parse(config.data);
    } catch {
      return {};
    }
  }
  return config.data as Record<string, unknown>;
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("?")[0].split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/** Parses `If-Match: "3"` the way the server does; null when absent or malformed. */
function ifMatchVersion(config: AxiosRequestConfig): number | null {
  const headers = (config.headers ?? {}) as Record<string, unknown> & { get?: (name: string) => unknown };
  const raw = (typeof headers.get === "function" ? headers.get("If-Match") : undefined) ?? headers["If-Match"];
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/"/g, ""));
  return Number.isInteger(n) ? n : null;
}

function abortedError(config: InternalAxiosRequestConfig) {
  return Object.assign(new Error("canceled"), { name: "CanceledError", code: "ERR_CANCELED", isAxiosError: true, config });
}

export const mockAdapter: AxiosAdapter = async (config) => {
  if (config.signal?.aborted) throw abortedError(config);
  if (mockBackend.offline) {
    throw Object.assign(new Error("Network Error"), { isAxiosError: true, config, code: "ERR_NETWORK", toJSON: () => ({}) });
  }
  const result = await handle(config);
  // A request cancelled while "in flight" must not deliver a response.
  if (config.signal?.aborted) throw abortedError(config);
  return result;
};

async function handle(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method ?? "get").toUpperCase();
  const url = config.url ?? "";
  const params = (config.params ?? {}) as Record<string, unknown>;
  const body = parseBody(config);

  const route = (pattern: string, verb: string) => {
    if (verb !== method) return null;
    return matchPath(pattern, url);
  };

  let m: Record<string, string> | null;

  // Auth
  if ((m = route("/v1/auth/signup", "POST"))) {
    const { email, defaultCurrencyCode } = body as { email?: string; defaultCurrencyCode?: string };
    state.user = {
      ...state.user,
      email: email ?? state.user.email,
      defaultCurrencyCode: defaultCurrencyCode ?? state.user.defaultCurrencyCode,
    };
    const res: AuthResponse = {
      accessToken: mockJwt(),
      tokenType: "Bearer",
      expiresInSeconds: 3600,
      user: state.user,
    };
    return ok(config, res, 201);
  }

  if ((m = route("/v1/auth/google", "POST"))) {
    const res: AuthResponse = {
      accessToken: mockJwt(),
      tokenType: "Bearer",
      expiresInSeconds: 3600,
      user: state.user,
    };
    return ok(config, res);
  }

  if ((m = route("/v1/auth/google/link", "POST"))) {
    return ok(config, state.user);
  }

  if ((m = route("/v1/auth/login", "POST"))) {
    const { email } = body as { email?: string };
    if (email) state.user = { ...state.user, email };
    const res: AuthResponse = {
      accessToken: mockJwt(),
      tokenType: "Bearer",
      expiresInSeconds: 3600,
      user: state.user,
    };
    return ok(config, res);
  }

  if ((m = route("/v1/me", "GET"))) {
    return ok(config, state.user);
  }

  if ((m = route("/v1/me", "PATCH"))) {
    state.user = { ...state.user, ...body };
    return ok(config, state.user);
  }

  if ((m = route("/v1/support/contact", "POST"))) {
    const { subject, message } = body as { subject?: string; message?: string };
    if (!subject?.trim() || !message?.trim() || subject.length > 120 || message.length > 5000) {
      return fail(config, 400, "Subject and message are required.", "VALIDATION_ERROR");
    }
    return ok(config, null, 204);
  }

  // One ownership/deletion gate for every route nested under a book.
  const scopedId = /^\/v1\/books\/([^/?]+)(?:\/|$)/.exec(url)?.[1];
  if (scopedId && scopedId !== 'order' && !ownedBook(decodeURIComponent(scopedId))) {
    return fail(config, 404, 'Book not found', 'NOT_FOUND');
  }
  if ((m = route('/v1/books', 'GET'))) {
    return ok(config, { items: ownedBooks().map(bookResponse) });
  }
  if ((m = route('/v1/books', 'POST'))) {
    if (ownedBooks().length >= BOOK_LIMIT) return fail(config, 409, 'You can have up to 10 active cash books.', 'BOOK_LIMIT_REACHED');
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > BOOK_NAME_MAX ||
        typeof body.currencyCode !== 'string' || body.currencyCode.length !== 3 ||
        typeof body.timezone !== 'string' || !body.timezone ||
        (body.openingBalanceMinor !== undefined && !Number.isSafeInteger(body.openingBalanceMinor)) ||
        (body.icon !== undefined && !isBookIcon(body.icon)) || (body.color !== undefined && !isBookColor(body.color))) {
      return fail(config, 400, 'Invalid book name, currency, timezone, opening balance, icon or color.', 'VALIDATION_ERROR');
    }
    const book: BookResponse = {
      id: uid('book'), name: body.name, currencyCode: body.currencyCode, timezone: body.timezone,
      openingBalanceMinor: Number(body.openingBalanceMinor ?? 0), icon: String(body.icon ?? 'book'), color: String(body.color ?? 'green'),
      sortOrder: ownedBooks().length, version: 1, createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null,
    };
    state.bookOwners[book.id] = state.user.id;
    state.books.push(book);
    // Explicit creation seeds categories, never transactions for the opening balance.
    for (const [type, name, icon] of [['INCOME', 'Salary', 'cash-outline'], ['EXPENSE', 'Groceries', 'cart-outline'], ['EXPENSE', 'Other', 'pricetag-outline']] as const) {
      state.categories.push({ id: uid('cat'), bookId: book.id, type, name, icon, color: '#9BD881', isDisabled: false, version: 1, createdAt: nowIso(), deletedAt: null });
    }
    return ok(config, bookResponse(book), 201);
  }
  if ((m = route('/v1/books/order', 'PUT'))) {
    const ids = body.bookIds;
    const active = ownedBooks();
    if (!Array.isArray(ids) || ids.length !== active.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !active.some(b => b.id === id))) {
      return fail(config, 400, 'Order must contain every active cash book exactly once.', 'VALIDATION_ERROR');
    }
    ids.forEach((id, sortOrder) => { ownedBook(id)!.sortOrder = sortOrder; });
    return ok(config, undefined, 204);
  }
  if ((m = route('/v1/books/:id', 'PATCH'))) {
    const book = ownedBook(m.id)!;
    const expected = ifMatchVersion(config);
    if (expected === null) return fail(config, 400, 'If-Match header is required', 'MISSING_IF_MATCH');
    if (expected !== book.version) return fail(config, 412, 'This book changed. Reload it before saving.', 'ETAG_MISMATCH');
    const patch = Object.fromEntries(Object.entries(body).filter(([, value]) => value != null));
    if (!Object.keys(patch).length || Object.keys(body).some(key => !['name', 'icon', 'color'].includes(key)) ||
        (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > BOOK_NAME_MAX)) ||
        (patch.icon !== undefined && !isBookIcon(patch.icon)) || (patch.color !== undefined && !isBookColor(patch.color))) {
      return fail(config, 400, 'Provide a valid changed name, icon or color.', 'VALIDATION_ERROR');
    }
    Object.assign(book, patch); book.version += 1; book.updatedAt = nowIso();
    return ok(config, bookResponse(book));
  }
  if ((m = route('/v1/books/:id', 'DELETE'))) {
    const book = ownedBook(m.id)!;
    const expected = ifMatchVersion(config);
    if (expected === null) return fail(config, 400, 'If-Match header is required', 'MISSING_IF_MATCH');
    if (expected !== book.version) return fail(config, 412, 'This book changed. Review it before deleting.', 'ETAG_MISMATCH');
    if (ownedBooks().length <= 1) return fail(config, 409, 'Keep at least one cash book.', 'LAST_BOOK_REQUIRED');
    book.deletedAt = nowIso();
    return ok(config, undefined, 204);
  }

  // Categories
  if ((m = route("/v1/books/:bookId/categories", "GET"))) {
    return ok(config, {
      items: state.categories.filter((c) => c.bookId === m!.bookId && !c.deletedAt),
    });
  }

  if ((m = route("/v1/books/:bookId/categories", "POST"))) {
    const { type, name, icon, color } = body as Partial<CategoryResponse>;
    const category: CategoryResponse = {
      id: uid("cat"),
      bookId: m!.bookId,
      type: type ?? "EXPENSE",
      name: name ?? "New Category",
      icon: icon ?? "pricetag",
      color: color ?? "#64748B",
      isDisabled: false,
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    };
    state.categories.push(category);
    return ok(config, category, 201);
  }

  if ((m = route("/v1/books/:bookId/categories/:categoryId", "PATCH"))) {
    const category = state.categories.find((c) => c.id === m!.categoryId && c.bookId === m!.bookId);
    if (!category) return fail(config, 404, "Category not found");
    Object.assign(category, body);
    category.version += 1;
    category.updatedAt = nowIso();
    // The server joins the category name in, so a rename shows on every transaction.
    for (const t of state.transactions) {
      if (t.categoryId === category.id) {
        t.category = { id: category.id, name: category.name, type: category.type };
        t.categoryName = category.name;
      }
    }
    return ok(config, category);
  }

  if ((m = route("/v1/books/:bookId/categories/:categoryId", "DELETE"))) {
    const category = state.categories.find((c) => c.id === m!.categoryId && c.bookId === m!.bookId);
    if (!category) return fail(config, 404, "Category not found");
    category.deletedAt = nowIso();
    return ok(config, undefined, 204);
  }

  // Transactions
  if ((m = route("/v1/books/:bookId/transactions", "GET"))) {
    let items = state.transactions.filter((t) => t.bookId === m!.bookId && !t.deletedAt);
    const { from, to, type, categoryId, q, limit } = params as {
      from?: string;
      to?: string;
      type?: string;
      categoryId?: string;
      q?: string;
      limit?: number;
    };
    if (from) items = items.filter((t) => t.occurredOn >= from);
    if (to) items = items.filter((t) => t.occurredOn <= to);
    if (type) items = items.filter((t) => t.type === type);
    if (categoryId) items = items.filter((t) => t.categoryId === categoryId);
    if (q) items = items.filter((t) => (t.title ?? "").toLowerCase().includes(String(q).toLowerCase()));
    items = [...items].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    if (limit) items = items.slice(0, Number(limit));
    return ok(config, { page: { items, nextCursor: null } });
  }

  if ((m = route("/v1/books/:bookId/transactions", "POST"))) {
    const payload = body as Record<string, unknown>;
    const unknownCreateField = Object.keys(payload).find((k) => !TX_WRITABLE_FIELDS.has(k));
    if (unknownCreateField) return fail(config, 400, `Unknown field: ${unknownCreateField}`);
    const category = state.categories.find((c) => c.id === payload.categoryId && c.bookId === m!.bookId && !c.deletedAt);
    if (!category) return fail(config, 404, "Category not found", "NOT_FOUND");
    const occurredOn = (payload.occurredOn as string) ?? nowIso().slice(0, 10);
    const tx: TransactionResponse = {
      id: uid("tx"),
      bookId: m!.bookId,
      type: (payload.type as TransactionResponse["type"]) ?? "EXPENSE",
      amountMinor: Number(payload.amountMinor) || 0,
      occurredOn,
      occurredAt: (payload.occurredAt as string) ?? `${occurredOn}T12:00:00.000Z`,
      title: (payload.title as string) ?? null,
      categoryId: payload.categoryId as string,
      category: category ? { id: category.id, name: category.name, type: category.type } : null,
      categoryName: category?.name,
      paymentMethod: (payload.paymentMethod as TransactionResponse["paymentMethod"]) ?? null,
      note: (payload.note as string) ?? null,
      externalId: null,
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    };
    state.transactions.push(tx);
    return ok(config, tx, 201);
  }

  if ((m = route("/v1/books/:bookId/transactions/search", "POST"))) {
    if (!state.books.some((b) => b.id === m!.bookId && !b.deletedAt)) return fail(config, 404, "Book not found", "NOT_FOUND");
    try {
      return ok(config, mockSearch(bookRows(m.bookId), body as SearchRequest));
    } catch (e) {
      if (e instanceof MockQueryError) return fail(config, e.status, e.message, e.code);
      throw e;
    }
  }

  if ((m = route("/v1/books/:bookId/transactions/analyze", "POST"))) {
    const book = state.books.find((b) => b.id === m!.bookId && !b.deletedAt);
    if (!book) return fail(config, 404, "Book not found", "NOT_FOUND");
    try {
      return ok(config, mockAnalyze(bookRows(m.bookId), state.categories.filter((c) => c.bookId === m!.bookId), body as unknown as AnalyzeRequest, book, state.budgets.filter((b) => b.bookId === m!.bookId)));
    } catch (e) {
      if (e instanceof MockQueryError) return fail(config, e.status, e.message, e.code);
      throw e;
    }
  }

  if ((m = route("/v1/books/:bookId/transactions/export/query", "POST"))) {
    if (!state.books.some((b) => b.id === m!.bookId && !b.deletedAt)) return fail(config, 404, "Book not found", "NOT_FOUND");
    try {
      const csv = mockExportCsv(bookRows(m.bookId), body as TransactionQuery);
      return ok(config, new TextEncoder().encode(csv).buffer);
    } catch (e) {
      if (e instanceof MockQueryError) return fail(config, e.status, e.message, e.code);
      throw e;
    }
  }

  if ((m = route("/v1/books/:bookId/transactions/:txId", "GET"))) {
    if (m.txId === "export") return fail(config, 501, "Export needs a real backend - not available while EXPO_PUBLIC_MOCK_API=true.");
    const tx = state.transactions.find((t) => t.id === m!.txId && t.bookId === m!.bookId && !t.deletedAt);
    if (!tx) return fail(config, 404, "Transaction not found", "NOT_FOUND");
    return ok(config, { ...tx });
  }

  if ((m = route("/v1/books/:bookId/transactions/:txId", "PATCH"))) {
    const tx = state.transactions.find((t) => t.id === m!.txId && t.bookId === m!.bookId && !t.deletedAt);
    if (!tx) return fail(config, 404, "Transaction not found", "NOT_FOUND");
    const expected = ifMatchVersion(config);
    if (expected === null) return fail(config, 400, "If-Match header is required", "MISSING_IF_MATCH");
    if (expected !== tx.version) return fail(config, 412, "Resource was modified. Re-fetch and retry.", "ETAG_MISMATCH");
    const patch = body as Record<string, unknown>;
    // Mirror the server's PATCH contract: unknown/audit fields are rejected, explicit null
    // clears only title/note/paymentMethod, required fields reject null, createdAt and id
    // never change, and a no-op leaves version/updatedAt alone.
    const unknownField = Object.keys(patch).find((k) => !TX_WRITABLE_FIELDS.has(k));
    if (unknownField) return fail(config, 400, `Unknown field: ${unknownField}`);
    const nullRequired = Object.keys(patch).find((k) => patch[k] === null && !TX_NULLABLE_FIELDS.has(k));
    if (nullRequired) return fail(config, 400, `Field must not be null: ${nullRequired}`);
    if (Object.keys(patch).length === 0) return fail(config, 400, "PATCH request must contain at least one field");

    const next: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      const value = patch[key];
      next[key] = (key === "title" || key === "note") && typeof value === "string" && !value.trim() ? null : value;
    }
    if (typeof next.occurredAt === "string" && next.occurredOn === undefined) {
      next.occurredOn = next.occurredAt.slice(0, 10);
    } else if (typeof next.occurredOn === "string" && next.occurredAt === undefined) {
      next.occurredAt = `${next.occurredOn}T00:00:00.000Z`;
    }
    const changed = Object.keys(next).some((k) => (tx as Record<string, unknown>)[k] !== next[k]);
    if (!changed) return ok(config, tx);

    if (next.categoryId && !state.categories.some(c => c.id === next.categoryId && c.bookId === m!.bookId && !c.deletedAt)) return fail(config, 404, "Category not found", "NOT_FOUND");
    Object.assign(tx, next);
    if (next.categoryId) {
      const category = state.categories.find((c) => c.id === next.categoryId);
      tx.category = category ? { id: category.id, name: category.name, type: category.type } : null;
      tx.categoryName = category?.name;
    }
    tx.version += 1;
    tx.updatedAt = nowIso();
    return ok(config, tx);
  }

  if ((m = route("/v1/books/:bookId/transactions/:txId", "DELETE"))) {
    const tx = state.transactions.find((t) => t.id === m!.txId && t.bookId === m!.bookId && !t.deletedAt);
    if (!tx) return fail(config, 404, "Transaction not found", "NOT_FOUND");
    const expected = ifMatchVersion(config);
    if (expected === null) return fail(config, 400, "If-Match header is required", "MISSING_IF_MATCH");
    if (expected !== tx.version) return fail(config, 412, "Resource was modified. Re-fetch and retry.", "ETAG_MISMATCH");
    tx.deletedAt = nowIso();
    return ok(config, undefined, 204);
  }

  // Budgets
  if ((m = route("/v1/books/:bookId/budgets", "GET"))) {
    const month = (params.month as string) ?? currentMonth();
    const items = state.budgets
      .filter((b) => b.bookId === m!.bookId && b.month === month)
      .map((b) => {
        const spentMinor = spentForCategoryMonth(b.bookId, b.categoryId, month);
        return { ...b, spentMinor, remainingMinor: b.amountMinor - spentMinor };
      });
    return ok(config, { items });
  }

  if ((m = route("/v1/books/:bookId/budgets/:categoryId", "PUT"))) {
    const month = (params.month as string) ?? currentMonth();
    const amountMinor = Number((body as { amountMinor?: number }).amountMinor) || 0;
    const category = state.categories.find((c) => c.id === m!.categoryId && c.bookId === m!.bookId && !c.deletedAt);
    if (!category) return fail(config, 404, "Category not found", "NOT_FOUND");
    let budget = state.budgets.find(
      (b) => b.bookId === m!.bookId && b.categoryId === m!.categoryId && b.month === month
    );
    if (budget) {
      budget.amountMinor = amountMinor;
      budget.version += 1;
      budget.updatedAt = nowIso();
    } else {
      budget = {
        id: uid("budget"),
        bookId: m!.bookId,
        categoryId: m!.categoryId,
        categoryName: category?.name ?? "",
        month,
        amountMinor,
        spentMinor: 0,
        remainingMinor: amountMinor,
        currencyCode: ownedBook(m!.bookId)!.currencyCode,
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.budgets.push(budget);
    }
    const spentMinor = spentForCategoryMonth(m!.bookId, m!.categoryId, month);
    const res: BudgetResponse = { ...budget, spentMinor, remainingMinor: budget.amountMinor - spentMinor };
    return ok(config, res);
  }

  if ((m = route("/v1/books/:bookId/budgets/:categoryId", "DELETE"))) {
    const month = (params.month as string) ?? currentMonth();
    state.budgets = state.budgets.filter(
      (b) => !(b.bookId === m!.bookId && b.categoryId === m!.categoryId && b.month === month)
    );
    return ok(config, undefined, 204);
  }

  // Import/export need a real backend (xlsx parsing/generation) - fail clearly
  // instead of falling through to the generic "no route" 404 below.
  if ((m = route("/v1/books/:bookId/transactions/import", "POST"))) {
    return fail(config, 501, "Import needs a real backend - not available while EXPO_PUBLIC_MOCK_API=true.");
  }

  // Summary
  if ((m = route("/v1/books/:bookId/balance", "GET"))) {
    const book = state.books.find((b) => b.id === m!.bookId);
    if (!book) return fail(config, 404, "Book not found");
    const net = state.transactions
      .filter((t) => t.bookId === m!.bookId && !t.deletedAt)
      .reduce((sum, t) => sum + (t.type === "INCOME" ? t.amountMinor : -t.amountMinor), 0);
    const res: BalanceResponse = {
      bookId: book.id,
      currencyCode: book.currencyCode,
      balanceMinor: book.openingBalanceMinor + net,
    };
    return ok(config, res);
  }

  if ((m = route("/v1/books/:bookId/summary/monthly", "GET"))) {
    const book = state.books.find((b) => b.id === m!.bookId);
    if (!book) return fail(config, 404, "Book not found");
    const month = (params.month as string) ?? currentMonth();
    const monthTx = state.transactions.filter(
      (t) => t.bookId === m!.bookId && !t.deletedAt && t.occurredOn.startsWith(month)
    );
    const incomeTotalMinor = monthTx.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amountMinor, 0);
    const expenseTotalMinor = monthTx.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amountMinor, 0);

    const byCategoryMap = new Map<string, MonthlySummaryCategory>();
    for (const t of monthTx) {
      const category = state.categories.find((c) => c.id === t.categoryId);
      const existing = byCategoryMap.get(t.categoryId);
      if (existing) {
        existing.totalMinor += t.amountMinor;
        existing.transactionCount += 1;
      } else {
        const budget = state.budgets.find((b) => b.bookId === m!.bookId && b.categoryId === t.categoryId && b.month === month);
        byCategoryMap.set(t.categoryId, {
          categoryId: t.categoryId,
          categoryName: category?.name ?? t.categoryName ?? "Unknown",
          type: t.type,
          totalMinor: t.amountMinor,
          budgetMinor: budget?.amountMinor ?? null,
          transactionCount: 1,
        });
      }
    }

    const res: MonthlySummaryResponse = {
      bookId: book.id,
      month,
      currencyCode: book.currencyCode,
      incomeTotalMinor,
      expenseTotalMinor,
      byCategory: Array.from(byCategoryMap.values()),
    };
    return ok(config, res);
  }

  if ((m = route("/v1/books/:bookId/summary/range", "GET"))) {
    const book = state.books.find((b) => b.id === m!.bookId);
    if (!book) return fail(config, 404, "Book not found");
    const startDate = params.startDate as string;
    const endDate = params.endDate as string;
    if (!startDate || !endDate) return fail(config, 400, "startDate and endDate are required");

    const rangeTx = state.transactions.filter(
      (t) =>
        t.bookId === m!.bookId &&
        !t.deletedAt &&
        t.occurredOn >= startDate &&
        t.occurredOn <= endDate
    );
    const incomeTotalMinor = rangeTx.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amountMinor, 0);
    const expenseTotalMinor = rangeTx.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amountMinor, 0);

    const byCategoryMap = new Map<string, MonthlySummaryCategory>();
    for (const t of rangeTx) {
      const category = state.categories.find((c) => c.id === t.categoryId);
      const existing = byCategoryMap.get(t.categoryId);
      if (existing) {
        existing.totalMinor += t.amountMinor;
        existing.transactionCount += 1;
      } else {
        byCategoryMap.set(t.categoryId, {
          categoryId: t.categoryId,
          categoryName: category?.name ?? t.categoryName ?? "Unknown",
          type: t.type,
          totalMinor: t.amountMinor,
          budgetMinor: null,
          transactionCount: 1,
        });
      }
    }

    const byDayMap = new Map<string, RangeSummaryDailyItem>();
    for (const t of rangeTx) {
      const existing = byDayMap.get(t.occurredOn);
      const income = t.type === "INCOME" ? t.amountMinor : 0;
      const expense = t.type === "EXPENSE" ? t.amountMinor : 0;
      if (existing) {
        existing.incomeTotalMinor += income;
        existing.expenseTotalMinor += expense;
      } else {
        byDayMap.set(t.occurredOn, { date: t.occurredOn, incomeTotalMinor: income, expenseTotalMinor: expense });
      }
    }
    // Zero-fill every day in the range, not just days with activity, matching the real endpoint.
    const byDay: RangeSummaryDailyItem[] = [];
    for (let d = new Date(`${startDate}T00:00:00`); d <= new Date(`${endDate}T00:00:00`); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byDay.push(byDayMap.get(key) ?? { date: key, incomeTotalMinor: 0, expenseTotalMinor: 0 });
    }

    const res: RangeSummaryResponse = {
      bookId: book.id,
      startDate,
      endDate,
      currencyCode: book.currencyCode,
      incomeTotalMinor,
      expenseTotalMinor,
      transactionCount: rangeTx.length,
      byCategory: Array.from(byCategoryMap.values()),
      byDay,
    };
    return ok(config, res);
  }

  return fail(config, 404, `Mock adapter: no route for ${method} ${url}`);
}


// QA hook for mock mode only (EXPO_PUBLIC_MOCK_API=true): lets a browser console or an E2E script seed
// hundreds of rows to exercise paging without clicking them in one by one.
if (import.meta.env.VITE_MOCK_API === "true") {
  (globalThis as { __pennywiseMockBackend?: typeof mockBackend }).__pennywiseMockBackend = mockBackend;
}
