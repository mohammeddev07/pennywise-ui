import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import * as transactionsApi from "@/shared/api/transactions";
import { queryClient as appQueryClient } from "@/shared/api/queryClient";
import type { TransactionResponse } from "@/shared/types/api";
import type { AnalyzeResponse, SearchResponse } from "@/shared/types/transactionQuery";
import { QUERY_LIMITS } from "@/shared/types/transactionQuery";
import { getAccountEpoch, isCurrentAccountEpoch } from "@/shared/session/accountEpoch";
import { useAuthStore } from "@/features/auth/store";
import { useBooksStore } from "@/features/books/store";
import { useBudgetsStore } from "@/features/budgets/store";
import type { BuiltQuery } from "./filterModel";
import { mapTransactionResponse, type Transaction } from "./model";

export const PAGE_SIZE = 50;

/** Analyze needs a bucket; Activity only wants totals, so the coarsest one keeps the category x period matrix tiny. */
export const ACTIVITY_BUCKET = "YEAR" as const;

// ------------------------------------------------------------------ scope + keys

export type AccountScope = { accountId: string; bookId: string };

/**
 * Who and what a request is for. The account id (never just the book id) is part of
 * every key, so two accounts on one device can not share cache entries.
 */
export function useAccountScope(): AccountScope {
  const accountId = useAuthStore((s) => s.user?.id ?? "");
  const bookId = useBooksStore((s) => s.selectedBookId);
  return { accountId, bookId };
}

export const txKeys = {
  root: ["transactions"] as const,
  search: (scope: AccountScope, queryHash: string) => ["transactions", "search", scope.accountId, scope.bookId, queryHash] as const,
  analyze: (scope: AccountScope, filterHash: string, bucket: string) =>
    ["transactions", "analyze", scope.accountId, scope.bookId, filterHash, bucket] as const,
  detail: (scope: AccountScope, id: string) => ["transactions", "detail", scope.accountId, scope.bookId, id] as const,
};

/**
 * `keepPreviousData`, but only within one account + book: another book's or account's
 * rows must never sit on screen (even dimmed) while this one loads.
 */
function keepWithinScope(scope: AccountScope) {
  return <T,>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery && previousQuery.queryKey[2] === scope.accountId && previousQuery.queryKey[3] === scope.bookId
      ? previous
      : undefined;
}

// ------------------------------------------------------------------ stale-result guards

export class StaleAccountError extends Error {
  constructor() {
    super("Result belongs to a previous account session.");
    this.name = "StaleAccountError";
  }
}

export class StaleBookError extends Error {
  constructor() {
    super("Result belongs to a different book.");
    this.name = "StaleBookError";
  }
}

/**
 * Runs a request and refuses to hand back its result if the account changed while it
 * was in flight (logout / login bumps the epoch). The cache key already isolates
 * accounts and books; this closes the window where a slow response for the old
 * session resolves after the switch.
 */
export async function guardEpoch<T>(work: () => Promise<T>): Promise<T> {
  const epoch = getAccountEpoch();
  const result = await work();
  if (!isCurrentAccountEpoch(epoch)) throw new StaleAccountError();
  return result;
}

function assertBook(bookId: string, rows: Array<{ bookId?: string }>) {
  if (rows.some((r) => r.bookId && r.bookId !== bookId)) throw new StaleBookError();
}

// ------------------------------------------------------------------ search (paged rows)

export type SearchPage = SearchResponse & { bookId: string };

export function fetchSearchPage(
  scope: AccountScope,
  query: Pick<BuiltQuery, "filter" | "sort">,
  offset: number,
  signal?: AbortSignal,
  limit: number = PAGE_SIZE
): Promise<SearchPage> {
  return guardEpoch(async () => {
    const res = await transactionsApi.searchTransactions(
      scope.bookId,
      {
        filter: query.filter,
        ...(query.sort.length > 0 ? { sort: query.sort } : {}),
        page: { offset, limit },
      },
      signal
    );
    assertBook(scope.bookId, res.items);
    return { ...res, bookId: scope.bookId };
  });
}

/** Rows in server order, de-duplicated (offset pages are not a snapshot, so a row can straddle two pages). */
export function flattenPages(pages: SearchResponse[] | undefined): Transaction[] {
  const seen = new Set<string>();
  const out: Transaction[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(mapTransactionResponse(item));
    }
  }
  return out;
}

export function nextSearchOffset(last: SearchResponse): number | undefined {
  if (!last.page.hasMore) return undefined;
  const next = last.page.offset + last.items.length;
  // The server refuses offsets past the cap; stop asking and let the UI say "narrow the filter".
  return next > QUERY_LIMITS.maxOffset || last.items.length === 0 ? undefined : next;
}

export function useSearchInfinite(query: BuiltQuery | null, enabled = true) {
  const scope = useAccountScope();
  return useInfiniteQuery({
    queryKey: txKeys.search(scope, query?.queryHash ?? ""),
    queryFn: ({ pageParam, signal }) => fetchSearchPage(scope, query as BuiltQuery, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: nextSearchOffset,
    // Keep the previous rows on screen (dimmed, flagged as placeholder) while a new filter loads.
    placeholderData: keepWithinScope(scope),
    enabled: enabled && Boolean(scope.accountId && scope.bookId && query),
  });
}

// ------------------------------------------------------------------ analyze (full-set aggregates)

export function fetchAnalysis(
  scope: AccountScope,
  query: Pick<BuiltQuery, "analyzeFilter" | "window">,
  bucket: "DAY" | "MONTH" | "YEAR",
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  return guardEpoch(async () => {
    const res = await transactionsApi.analyzeTransactions(
      scope.bookId,
      { filter: query.analyzeFilter, bucket, window: query.window },
      signal
    );
    if (res.bookId && res.bookId !== scope.bookId) throw new StaleBookError();
    return res;
  });
}

export function useAnalysis(query: BuiltQuery | null, bucket: "DAY" | "MONTH" | "YEAR" = ACTIVITY_BUCKET, enabled = true) {
  const scope = useAccountScope();
  return useQuery({
    // Aggregates are over the whole match: no offset, no page size, no sort in the key.
    queryKey: txKeys.analyze(scope, query?.filterHash ?? "", bucket),
    queryFn: ({ signal }) => fetchAnalysis(scope, query as BuiltQuery, bucket, signal),
    placeholderData: keepWithinScope(scope),
    enabled: enabled && Boolean(scope.accountId && scope.bookId && query),
  });
}

// ------------------------------------------------------------------ Activity: rows + totals as one result

export type ActivityStatus = "loading" | "ready" | "error";

/**
 * One coordinated view of an applied query. Rows and totals come from two requests;
 * they are only shown as "current" when both belong to this exact query hash. While
 * either is still the previous filter's data (placeholder) `isUpdating` is true and
 * the totals are withheld, so a stale figure is never presented as the answer.
 */
export function useActivityResults(query: BuiltQuery | null) {
  const search = useSearchInfinite(query);
  const analysis = useAnalysis(query);

  const rows = useMemo(() => flattenPages(search.data?.pages), [search.data]);
  const rowsCurrent = Boolean(search.data) && !search.isPlaceholderData;
  const totalsCurrent = Boolean(analysis.data) && !analysis.isPlaceholderData;

  const status: ActivityStatus =
    search.isError && !search.data ? "error" : !search.data ? "loading" : "ready";

  return {
    rows,
    /** Server-side `totalCount` of the first page: every row that matches, not just those loaded. */
    totalCount: search.data?.pages[0]?.totalCount ?? 0,
    hasNextPage: search.hasNextPage,
    fetchNextPage: search.fetchNextPage,
    isFetchingNextPage: search.isFetchingNextPage,
    /** Aggregates for exactly this query, or null while they belong to a previous one. */
    totals: totalsCurrent ? (analysis.data ?? null) : null,
    totalsError: analysis.isError && !analysis.data,
    status,
    rowsCurrent,
    isUpdating:
      search.isPlaceholderData ||
      analysis.isPlaceholderData ||
      ((search.isFetching || analysis.isFetching) && !search.isFetchingNextPage),
    error: search.error ?? analysis.error,
    refetch: async () => {
      // Pull-to-refresh and retry restart from offset 0 (pages are not a cross-request snapshot).
      trimSearchPages(appQueryClient);
      await Promise.all([search.refetch(), analysis.refetch()]);
    },
  };
}

// ------------------------------------------------------------------ recent rows (Home, category ranking)

const ALL_ROWS: Pick<BuiltQuery, "filter" | "sort"> = { filter: { kind: "group", op: "AND", children: [] }, sort: [] };

/** The newest `limit` transactions of the book, server-sorted. One small page, never the whole ledger. */
export function useRecentTransactions(
  limit: number,
  bookIdOverride?: string,
  seed?: { data: Transaction[]; updatedAt: number }
) {
  const scope = useAccountScope();
  const bookId = bookIdOverride ?? scope.bookId;
  const keyScope = { accountId: scope.accountId, bookId };
  return useQuery({
    queryKey: ["transactions", "recent", keyScope.accountId, keyScope.bookId, limit] as const,
    queryFn: ({ signal }) =>
      fetchSearchPage(keyScope, ALL_ROWS, 0, signal, limit).then((page) => page.items.map(mapTransactionResponse)),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
    enabled: Boolean(keyScope.accountId && bookId),
  });
}

/**
 * Full-window aggregates (per-bucket totals, largest expense) from the server - every
 * transaction in the window, not whichever rows happen to be loaded. Used by Home's 7-day chart;
 * Insights uses `useAnalysis` so it honours the shared applied filter.
 */
export function useWindowAnalysis(
  window: { startDate: string; endDate: string } | null,
  bucket: "DAY" | "MONTH" | "YEAR",
  bookIdOverride?: string,
  seed?: { data: AnalyzeResponse; updatedAt: number }
) {
  const scope = useAccountScope();
  const bookId = bookIdOverride ?? scope.bookId;
  const keyScope = { accountId: scope.accountId, bookId };
  const filter: BuiltQuery["analyzeFilter"] = { kind: "group", op: "AND", children: [] };
  return useQuery({
    queryKey: txKeys.analyze(keyScope, `window|${window?.startDate}|${window?.endDate}`, bucket),
    queryFn: ({ signal }) => fetchAnalysis(keyScope, { analyzeFilter: filter, window: window! }, bucket, signal),
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
    enabled: Boolean(keyScope.accountId && bookId && window),
  });
}

// ------------------------------------------------------------------ detail

export function useTransactionDetail(id: string, bookIdOverride?: string) {
  const scope = useAccountScope();
  const bookId = bookIdOverride || scope.bookId;
  const keyScope = { accountId: scope.accountId, bookId };
  return useQuery({
    queryKey: txKeys.detail(keyScope, id),
    queryFn: ({ signal }) =>
      guardEpoch(async () => {
        const res = await transactionsApi.getTransaction(bookId, id, signal);
        if (res.bookId && res.bookId !== bookId) throw new StaleBookError();
        return res as TransactionResponse;
      }).then(mapTransactionResponse),
    enabled: Boolean(scope.accountId && bookId && id),
  });
}

// ------------------------------------------------------------------ invalidation

/** Cuts every cached search back to its first page so the refetch restarts at offset 0. */
export function trimSearchPages(client: QueryClient) {
  client.setQueriesData<{ pages: unknown[]; pageParams: unknown[] }>(
    { queryKey: ["transactions", "search"] },
    (data) => (data && data.pages.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data)
  );
}

function monthOf(date: string | undefined) {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : undefined;
}

/**
 * The single place that says what a transaction write (create, edit, delete,
 * duplicate, import) or a category change makes stale: search, analyze, detail,
 * balance, summary, summaryRange and budgets. Callers pass what changed; nothing
 * else invalidates ad hoc, so a new dependent query is added here once.
 */
export async function invalidateTransactionData(
  client: QueryClient,
  bookId: string,
  opts: { months?: Array<string | undefined> } = {}
) {
  trimSearchPages(client);
  const forBook = (key: readonly unknown[]) => key[0] === "transactions" && key[3] === bookId;

  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = new Set<string>([current]);
  for (const m of opts.months ?? []) if (m) months.add(monthOf(m) ?? m);

  await Promise.all([
    useBooksStore.getState().loadBooks().catch(() => {}),
    client.invalidateQueries({ predicate: (q) => forBook(q.queryKey) }),
    client.invalidateQueries({ queryKey: ["balance", bookId] }),
    client.invalidateQueries({ queryKey: ["summary", bookId] }),
    client.invalidateQueries({ queryKey: ["summaryRange", bookId] }),
    client.invalidateQueries({ queryKey: ["budgets", bookId] }),
    // Budgets live in a store rather than the query cache; refresh the months a change can touch.
    ...[...months].map((month) => useBudgetsStore.getState().loadBudgets(bookId, month).catch(() => {})),
  ]);
}
