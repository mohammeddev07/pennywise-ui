import { useEffect } from "react";

import { getAccountEpoch } from "@/shared/session/accountEpoch";
import type { BalanceResponse, MonthlySummaryResponse } from "@/shared/types/api";
import type { Transaction } from "@/shared/types/models";
import type { AnalyzeResponse } from "@/shared/types/transactionQuery";
import { pickSnapshot, useHomeSnapshotStore } from "./store";
import type { HomeSnapshot, SnapshotContext } from "./types";

export function useHomeSnapshot(ctx: SnapshotContext): HomeSnapshot | undefined {
  return pickSnapshot(useHomeSnapshotStore((s) => s.snapshot), ctx);
}

/** Saves Home's live data once all four parts have loaded and 2 s pass without a change. */
export function useSaveHomeSnapshot(
  ctx: SnapshotContext,
  live: { balance?: BalanceResponse; summary?: MonthlySummaryResponse; weekAnalysis?: AnalyzeResponse; recent?: Transaction[] },
): void {
  const { accountId, bookId, month, weekStart, weekEnd } = ctx;
  const { balance, summary, weekAnalysis, recent } = live;
  useEffect(() => {
    if (!balance || !summary || !weekAnalysis || !recent) return;
    // Captured now, so a logout inside the 2 s window drops the save.
    const epoch = getAccountEpoch();
    const id = setTimeout(() => {
      useHomeSnapshotStore.getState().save(
        {
          accountId,
          bookId,
          month,
          weekStart,
          weekEnd,
          balance,
          summary,
          // Home never renders largestExpense, and it carries a full transaction incl. note.
          weekAnalysis: { ...weekAnalysis, largestExpense: null },
          recent: recent.map(({ note, ...t }) => t),
        },
        epoch,
      );
    }, 2000);
    return () => clearTimeout(id);
  }, [accountId, bookId, month, weekStart, weekEnd, balance, summary, weekAnalysis, recent]);
}
