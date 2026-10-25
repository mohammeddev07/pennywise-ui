import { Link } from "react-router";
import { useCategoriesStore } from "@/features/categories/store";
import type { Transaction } from "@/features/transactions/model";
import { CategoryIcon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { addDaysYmd, formatYmd, type Ymd } from "@/shared/utils/ledgerDate";

function dayLabel(day: Ymd, today: Ymd) {
  if (day === today) return "Today";
  if (day === addDaysYmd(today, -1)) return "Yesterday";
  return formatYmd(day, day.slice(0, 4) !== today.slice(0, 4));
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Home's compact ledger row; opens the transaction in Activity. */
export function TransactionRow({ tx, currency, today }: { tx: Transaction; currency: string; today: Ymd }) {
  const category = useCategoriesStore((s) => s.categories.find((c) => c.id === tx.categoryId));
  const income = tx.type === "INCOME";
  const title = tx.title?.trim() || tx.categoryName?.trim() || "Transaction";
  const when = [dayLabel(tx.occurredOn, today), timeLabel(tx.occurredAt)].filter(Boolean).join(", ");
  const meta = `${tx.categoryName?.trim() || "Uncategorized"} · ${when}`;
  return (
    <Link
      to={`/activity/${tx.id}`}
      className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      <CategoryIcon icon={category?.icon ?? (income ? "arrow-down" : "arrow-up")} color={category?.color} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{meta}</span>
      </span>
      <Money amountMinor={tx.amountMinor} currency={currency} kind={income ? "income" : "expense"} className="font-semibold" />
    </Link>
  );
}
