import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useBooksStore } from "@/features/books/store";
import { useCategoriesStore } from "@/features/categories/store";
import { CategoryIcon, Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/states";
import { formatYmd } from "@/shared/utils/ledgerDate";
import { isNotFoundError, paymentMethodLabel } from "../model";
import { useTransactionDetail } from "../queries";
import { deleteWithConfirm, duplicate } from "./commands";
import { EditTransactionForm } from "./EditTransactionForm";
import { formatInZone } from "./zonedTime";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-3">{children}</dd>
    </div>
  );
}

const STAMP: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * A receipt, not a dashboard: the amount first, then what it was, then quiet record metadata.
 * Fetched by id, so a deep link resolves without the row being in any loaded page. Edit swaps the
 * receipt for the inline form in place.
 */
export function TransactionDetail({
  txId,
  editing,
  onEditingChange,
  onClose,
  onOpen,
}: {
  txId: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const detail = useTransactionDetail(txId);
  const tx = detail.data ?? null;
  const book = useBooksStore((s) => s.books.find((b) => b.id === (tx?.bookId || s.selectedBookId)));
  const category = useCategoriesStore((s) => s.categories.find((c) => c.id === tx?.categoryId));
  const currency = book?.currencyCode ?? "USD";
  const timezone = book?.timezone ?? "UTC";
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  if (!tx) {
    if (detail.isError) {
      return isNotFoundError(detail.error) ? (
        <EmptyState icon="receipt-outline" title="Not found" body="This transaction may have been deleted." action={<Button variant="outline" className="rounded-full" onClick={onClose}>Back to activity</Button>} />
      ) : (
        <ErrorState error={detail.error} title="Couldn't load this transaction" onRetry={() => void detail.refetch()} />
      );
    }
    return (
      <div className="space-y-4 py-4" aria-busy="true">
        <Skeleton className="mx-auto h-12 w-40" />
        <Skeleton className="mx-auto h-5 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const title = tx.title?.trim() || tx.categoryName;
  const created = formatInZone(tx.createdAt, timezone, STAMP);
  const edited = tx.updatedAt !== tx.createdAt ? formatInZone(tx.updatedAt, timezone, STAMP) : null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div
          key="edit"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          <EditTransactionForm key={tx.id} tx={tx} currency={currency} timezone={timezone} refetch={detail.refetch} onDone={() => onEditingChange(false)} />
        </motion.div>
      ) : (
        <motion.div
          key={`view-${tx.id}`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          <div className="pt-2 pb-6 text-center">
            <Money amountMinor={tx.amountMinor} currency={currency} kind={tx.type === "INCOME" ? "income" : "expense"} className="text-4xl font-semibold" />
            <p className="mt-3 text-lg font-medium text-balance break-words">{title}</p>
          </div>

          {/* The perforation: a receipt's tear line between the total and its line items. */}
          <div aria-hidden className="h-px bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_6px,transparent_6px_12px)]" />

          <dl className="divide-y divide-border">
            <Row label="Category">
              <CategoryIcon icon={category?.icon} color={category?.color} size={30} />
              <span className="truncate">{tx.categoryName}</span>
            </Row>
            <Row label="Payment">
              <span className={tx.paymentMethod ? undefined : "text-muted-foreground"}>{paymentMethodLabel(tx.paymentMethod)}</span>
            </Row>
            <Row label="Date">
              <span>
                {formatYmd(tx.occurredOn)}, {formatInZone(tx.occurredAt, timezone, { timeStyle: "short" })}
              </span>
            </Row>
            <Row label="Note">
              <span className={tx.note ? "break-words whitespace-pre-wrap" : "text-muted-foreground"}>{tx.note || "No note added."}</span>
            </Row>
          </dl>

          <p className="mt-4 text-xs text-subtle">
            Added {created}
            {edited && `. Edited ${edited}`}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <Button className="h-11 rounded-full font-semibold" onClick={() => onEditingChange(true)}>
              <Icon name="create-outline" size={16} /> Edit
            </Button>
            <Button
              variant="secondary"
              className="h-11 rounded-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const copy = await duplicate(tx);
                setBusy(false);
                if (copy) onOpen(copy.id);
              }}
            >
              <Icon name="copy-outline" size={16} /> {busy ? "Copying" : "Duplicate"}
            </Button>
            <Button variant="destructive" className="h-11 rounded-full" disabled={busy} onClick={() => deleteWithConfirm(tx, currency, onClose)}>
              <Icon name="trash-outline" size={16} /> Delete
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
