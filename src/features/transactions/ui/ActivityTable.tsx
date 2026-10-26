import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Category } from "@/features/categories/store";
import { cn } from "@/lib/utils";
import { Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import type { QueryField } from "@/shared/types/transactionQuery";
import { formatYmd } from "@/shared/utils/ledgerDate";
import type { SortState } from "../filterModel";
import { paymentMethodLabel, type Transaction } from "../model";
import { nextSort } from "../sortModel";

type Column = { field: QueryField; label: string; first: "ASC" | "DESC"; className: string };

// Columns drop out as the table's own container narrows (the split view shares the width with the detail panel).
const COLUMNS: Column[] = [
  { field: "occurredOn", label: "Date", first: "DESC", className: "w-28" },
  { field: "title", label: "Description", first: "ASC", className: "" },
  { field: "categoryName", label: "Category", first: "ASC", className: "hidden w-44 @lg:table-cell" },
  { field: "paymentMethod", label: "Payment", first: "ASC", className: "hidden w-32 @2xl:table-cell" },
  { field: "amountMinor", label: "Amount", first: "DESC", className: "w-36 text-right" },
];

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

/**
 * Desktop ledger: a sortable table over the same applied sort the phone's sort sheet edits.
 * Keyboard: j / k or arrows move the selection, Enter opens it, e edits, Delete or Backspace deletes.
 */
export function ActivityTable({
  rows,
  sort,
  onSort,
  currency,
  categories,
  selectedId,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  keyboard,
}: {
  rows: Transaction[];
  sort: SortState;
  onSort: (next: SortState) => void;
  currency: string;
  categories: Map<string, Category>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  keyboard: boolean;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const cur = sort[0] ?? { field: "occurredOn", direction: "DESC" };
  const latest = useRef({ rows, selectedId, onSelect, onOpen, onEdit, onDelete });
  latest.current = { rows, selectedId, onSelect, onOpen, onEdit, onDelete };

  useEffect(() => {
    if (!keyboard) return;
    const focusRow = (id: string) => {
      const el = body.current?.querySelector<HTMLElement>(`[data-tx-row="${CSS.escape(id)}"]`);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      // Only when focus is on the page or a row: arrows inside menus, chips or the edit form are theirs.
      const onRowOrPage = e.target === document.body || (e.target as HTMLElement).closest?.("[data-tx-row]");
      if (!onRowOrPage) return;
      const { rows, selectedId, onSelect, onOpen, onEdit, onDelete } = latest.current;
      if (rows.length === 0) return;
      const i = rows.findIndex((r) => r.id === selectedId);
      const tx = i >= 0 ? rows[i] : null;
      if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
        const down = e.key === "j" || e.key === "ArrowDown";
        const next = rows[Math.min(rows.length - 1, Math.max(0, i < 0 ? 0 : i + (down ? 1 : -1)))];
        e.preventDefault();
        onSelect(next.id);
        focusRow(next.id);
      } else if (tx && onRowOrPage && e.key === "Enter") {
        e.preventDefault();
        onOpen(tx);
      } else if (tx && e.key === "e") {
        e.preventDefault();
        onEdit(tx);
      } else if (tx && onRowOrPage && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        onDelete(tx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard]);

  const rovingId = rows.some((r) => r.id === selectedId) ? selectedId : rows[0]?.id;

  return (
    <div className="@container">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Transactions. Use j and k to move, Enter to open, e to edit.</caption>
        <thead className="sticky top-0 z-[1]">
          <tr>
            {COLUMNS.map((c) => {
              const active = cur.field === c.field;
              return (
                <th
                  key={c.field}
                  scope="col"
                  aria-sort={active ? (cur.direction === "ASC" ? "ascending" : "descending") : "none"}
                  className={cn("border-b border-border bg-[var(--glass)] p-0 font-medium backdrop-blur-xl first:rounded-tl-xl last:rounded-tr-xl", c.className)}
                >
                  <button
                    type="button"
                    onClick={() => onSort(nextSort(sort, c.field, c.first))}
                    className={cn(
                      "group/th flex h-11 w-full items-center gap-1 px-3 text-xs transition-colors hover:text-foreground",
                      c.field === "amountMinor" && "justify-end",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {c.label}
                    {active ? (
                      <Icon name={cur.direction === "ASC" ? "arrow-up" : "arrow-down"} size={12} weight="bold" />
                    ) : (
                      <Icon name="swap-vertical" size={12} className="opacity-0 transition-opacity group-hover/th:opacity-60" />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={body}>
          {rows.map((tx) => {
            const selected = tx.id === selectedId;
            const category = categories.get(tx.categoryId);
            const title = tx.title?.trim() || tx.categoryName;
            return (
              <tr
                key={tx.id}
                data-tx-row={tx.id}
                tabIndex={tx.id === rovingId ? 0 : -1}
                aria-current={selected || undefined}
                onFocus={() => tx.id !== selectedId && onSelect(tx.id)}
                onClick={() => onOpen(tx)}
                className={cn(
                  "group cursor-pointer outline-none [&>td]:border-b [&>td]:border-border [&>td]:transition-colors",
                  selected ? "[&>td]:bg-primary-soft" : "hover:[&>td]:bg-surface-2",
                  "focus-visible:[&>td]:bg-surface-2",
                )}
              >
                <td className="relative h-14 px-3 whitespace-nowrap text-muted-foreground">
                  {selected && (
                    <motion.span
                      layoutId="activity-row-selected"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
                    />
                  )}
                  {formatYmd(tx.occurredOn)}
                </td>
                <td className="px-3">
                  <span className="block truncate font-medium">{title}</span>
                  {tx.note && <span className="block truncate text-xs text-muted-foreground">{tx.note}</span>}
                </td>
                <td className="hidden px-3 @lg:table-cell">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: category?.color ?? "var(--subtle)" }} />
                    <span className="truncate">{tx.categoryName}</span>
                  </span>
                </td>
                <td className={cn("hidden truncate px-3 @2xl:table-cell", !tx.paymentMethod && "text-muted-foreground")}>{paymentMethodLabel(tx.paymentMethod)}</td>
                <td className="px-3 text-right">
                  <Money amountMinor={tx.amountMinor} currency={currency} kind={tx.type === "INCOME" ? "income" : "expense"} className="font-semibold" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
