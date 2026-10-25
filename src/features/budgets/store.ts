import { useBooksStore } from "@/features/books/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import * as budgetsApi from "@/shared/api/budgets";
import type { Budget } from "@/shared/types/models";
import { getAccountEpoch, isCurrentAccountEpoch } from "@/shared/session/accountEpoch";

export type { Budget };

type State = {
  budgets: Budget[];
  isLoading: boolean;
  error: string | null;

  loadBudgets: (bookId: string, month: string) => Promise<void>;
  upsertBudget: (bookId: string, categoryId: string, month: string, amountMinor: number, version?: number) => Promise<Budget>;
  deleteBudget: (bookId: string, categoryId: string, month: string, version: number) => Promise<void>;
  getBudget: (bookId: string, categoryId: string, month: string) => Budget | null;
};

function normalizeBudget(input: any): Budget {
  return {
    id: String(input.id),
    bookId: String(input.bookId),
    categoryId: String(input.categoryId),
    categoryName: String(input.categoryName ?? "Uncategorized"),
    month: String(input.month),
    amountMinor: Number(input.amountMinor ?? 0) || 0,
    spentMinor: Number(input.spentMinor ?? 0) || 0,
    remainingMinor: Number(input.remainingMinor ?? 0) || 0,
    currencyCode: String(input.currencyCode ?? "USD"),
    version: Number(input.version ?? 0) || 0,
  };
}

function keyOf(bookId: string, categoryId: string, month: string) {
  return `${bookId}::${categoryId}::${month}`;
}

export const useBudgetsStore = create<State>()(
  persist(
    (set, get) => ({
      budgets: [],
      isLoading: false,
      error: null,

      loadBudgets: async (bookId, month) => {
        if (!bookId || !month) return;
        const accountEpoch = getAccountEpoch();
        set({ isLoading: true, error: null });
        try {
          const res = await budgetsApi.listBudgets(bookId, month);
          const next = res.items.map(normalizeBudget);
          if (!isCurrentAccountEpoch(accountEpoch) || useBooksStore.getState().selectedBookId !== bookId) return;
          set((s) => ({
            budgets: [...s.budgets.filter((b) => !(b.bookId === bookId && b.month === month)), ...next],
            isLoading: false,
            error: null,
          }));
        } catch (err) {
          if (!isCurrentAccountEpoch(accountEpoch) || useBooksStore.getState().selectedBookId !== bookId) return;
          const message = err instanceof Error ? err.message : "Could not load budgets";
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      upsertBudget: async (bookId, categoryId, month, amountMinor, version) => {
        const accountEpoch = getAccountEpoch();
        const budget = normalizeBudget(await budgetsApi.upsertBudget(bookId, categoryId, month, amountMinor, version));
        if (!isCurrentAccountEpoch(accountEpoch)) return budget;
        set((s) => ({
          budgets: [
            budget,
            ...s.budgets.filter((b) => keyOf(b.bookId, b.categoryId, b.month) !== keyOf(bookId, categoryId, month)),
          ],
        }));
        return budget;
      },

      deleteBudget: async (bookId, categoryId, month, version) => {
        const accountEpoch = getAccountEpoch();
        await budgetsApi.deleteBudget(bookId, categoryId, month, version);
        if (!isCurrentAccountEpoch(accountEpoch)) return;
        set((s) => ({
          budgets: s.budgets.filter((b) => keyOf(b.bookId, b.categoryId, b.month) !== keyOf(bookId, categoryId, month)),
        }));
      },

      getBudget: (bookId, categoryId, month) => {
        return get().budgets.find((b) => b.bookId === bookId && b.categoryId === categoryId && b.month === month) ?? null;
      },
    }),
    {
      name: "pennywise_budgets_v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      partialize: (s) => ({ budgets: s.budgets }),
      migrate: async (persisted: any) => {
        const budgets = Array.isArray(persisted?.budgets)
          ? persisted.budgets
              .filter((b: any) => typeof b?.categoryId === "string" && typeof b?.month === "string")
              .map(normalizeBudget)
          : [];
        return { budgets };
      },
    }
  )
);
