import type { Transaction } from "./model";
import { isDatePrimarySort, type SortState } from "./filterModel";
import { addDaysYmd, formatYmd, type Ymd } from "@/shared/utils/ledgerDate";

export type ActivityRow =
  | { type: "header"; id: string; title: string; /** null while more of that day may still be on a later page. */ netMinor: number | null }
  | { type: "tx"; id: string; tx: Transaction; /** A divider only between two rows of the same group. */ divider: boolean };

export function dayTitle(day: Ymd, today: Ymd) {
  if (day === today) return "Today";
  if (day === addDaysYmd(today, -1)) return "Yesterday";
  return formatYmd(day, day.slice(0, 4) !== today.slice(0, 4));
}

/**
 * Rows exactly as the server ordered them. Day headers exist only for date-primary
 * sorts - under any other order the same day would be scattered and a header would lie.
 * A header's net is shown only once its day is provably complete: a later row from a
 * different day has arrived, or there are no more pages. Otherwise (`null`) it is
 * omitted rather than showing a partial sum as the day's total.
 */
export function buildActivityRows(
  txs: Transaction[],
  sort: SortState,
  opts: { today: Ymd; hasMore: boolean }
): ActivityRow[] {
  if (!isDatePrimarySort(sort)) {
    return txs.map((tx, i) => ({ type: "tx", id: tx.id, tx, divider: i < txs.length - 1 }));
  }

  const out: ActivityRow[] = [];
  let i = 0;
  while (i < txs.length) {
    const day = txs[i].occurredOn;
    let j = i;
    let net = 0;
    while (j < txs.length && txs[j].occurredOn === day) {
      net += txs[j].type === "INCOME" ? txs[j].amountMinor : -txs[j].amountMinor;
      j += 1;
    }
    const complete = j < txs.length || !opts.hasMore;
    out.push({ type: "header", id: `h_${day}_${i}`, title: dayTitle(day, opts.today), netMinor: complete ? net : null });
    for (let k = i; k < j; k++) out.push({ type: "tx", id: txs[k].id, tx: txs[k], divider: k < j - 1 });
    i = j;
  }
  return out;
}
