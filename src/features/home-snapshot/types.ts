import type { BalanceResponse, MonthlySummaryResponse } from "@/shared/types/api";
import type { Transaction } from "@/shared/types/models";
import type { AnalyzeResponse } from "@/shared/types/transactionQuery";

/** What Home is showing: a snapshot is only ever painted for exactly this context. */
export type SnapshotContext = {
  accountId: string;
  bookId: string;
  /** YYYY-MM */
  month: string;
  weekStart: string;
  weekEnd: string;
};

export type HomeSnapshot = SnapshotContext & {
  /** epoch ms */
  savedAt: number;
  balance: BalanceResponse;
  summary: MonthlySummaryResponse;
  weekAnalysis: AnalyzeResponse;
  /** Notes are free text the user may not want sitting on disk; Home never shows them. */
  recent: Omit<Transaction, "note">[];
};
