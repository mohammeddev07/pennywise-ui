import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { isWakeError } from "./client";

export const QUERY_CACHE_KEY = "pennywise_query_cache_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One app-wide client. It is a module singleton (not created inside a component)
 * so logout code outside React can cancel in-flight requests and drop every cached
 * row that belongs to the previous account.
 *
 * networkMode "online" (the default) is deliberate: wake.ts drives onlineManager, so a query fired while the
 * backend sleeps pauses instead of failing, and a query that hits a backend that just fell asleep retries
 * once it is awake. Real API errors are not retried.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: DAY_MS,
      retry: (count, error) => count < 3 && isWakeError(error),
    },
  },
});

/** Recent server data survives reloads, so the UI paints instantly while the backend wakes. */
export const queryPersister = createSyncStoragePersister({
  storage: typeof localStorage === "undefined" ? undefined : localStorage,
  key: QUERY_CACHE_KEY,
});
export const PERSIST_MAX_AGE_MS = DAY_MS;

export async function clearQueryCache() {
  await queryClient.cancelQueries();
  queryClient.clear();
}
