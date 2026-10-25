import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Older builds persisted a `transactions` array (the first 100 rows) as a second copy of
 * the ledger. The server is now the only authority - lists, details and totals are all
 * fetched - so that copy is deleted rather than migrated: nothing reads it, and a stale
 * one must never be mistaken for data. Safe to call repeatedly.
 */
export const LEGACY_TRANSACTIONS_KEY = "pennywise_transactions_v1";

export async function purgeLegacyTransactionCache() {
  try {
    await AsyncStorage.removeItem(LEGACY_TRANSACTIONS_KEY);
  } catch {
    // Storage unavailable: nothing to clean up.
  }
}
