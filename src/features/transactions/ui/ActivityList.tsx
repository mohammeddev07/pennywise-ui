import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { Category } from "@/features/categories/store";
import { cn } from "@/lib/utils";
import { CategoryIcon, Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { formatYmd } from "@/shared/utils/ledgerDate";
import type { ActivityRow } from "../activityRows";
import { paymentMethodLabel, type Transaction } from "../model";

const ACTIONS_W = 152;
const SNAP = { type: "spring", stiffness: 420, damping: 36 } as const;
const LONG_PRESS_MS = 480;

export type RowHandlers = {
  onOpen: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onMenu: (tx: Transaction) => void;
};

/**
 * One phone row. Drag left to reveal Edit and Delete (snaps open past half the tray or on a flick),
 * tap to open, long-press for the action sheet. Only one row is open at a time (`open` is lifted).
 */
function SwipeRow({
  tx,
  currency,
  category,
  showDay,
  open,
  onOpenChange,
  reveal,
  handlers,
}: {
  tx: Transaction;
  currency: string;
  category?: Category;
  showDay: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reveal: number | null;
  handlers: RowHandlers;
}) {
  const x = useMotionValue(0);
  const reduce = useReducedMotion();
  const suppressClick = useRef(false);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  useEffect(() => {
    const controls = animate(x, open ? -ACTIONS_W : 0, reduce ? { duration: 0 } : SNAP);
    return () => controls.stop();
  }, [open, reduce, x]);

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => cancelPress, []);

  const title = tx.title?.trim() || tx.categoryName;
  const meta = [tx.categoryName, showDay ? formatYmd(tx.occurredOn) : tx.paymentMethod ? paymentMethodLabel(tx.paymentMethod) : null].filter(Boolean).join(", ");
  const act = (fn: (tx: Transaction) => void) => () => {
    onOpenChange(false);
    fn(tx);
  };

  return (
    <motion.li
      initial={reveal === null || reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 30, delay: (reveal ?? 0) * 0.035 }}
      className="relative overflow-hidden"
    >
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_W }} aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} onClick={act(handlers.onEdit)} className="flex flex-1 flex-col items-center justify-center gap-1 bg-surface-3 text-xs font-medium">
          <Icon name="create-outline" size={18} /> Edit
        </button>
        <button type="button" tabIndex={open ? 0 : -1} onClick={act(handlers.onDelete)} className="flex flex-1 flex-col items-center justify-center gap-1 bg-expense text-xs font-medium text-white">
          <Icon name="trash-outline" size={18} /> Delete
        </button>
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTIONS_W, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        style={{ x }}
        onDragStart={() => {
          cancelPress();
          suppressClick.current = true;
        }}
        onDragEnd={(_, info) => {
          const next = info.offset.x < -ACTIONS_W / 2 || info.velocity.x < -400 ? true : info.offset.x > ACTIONS_W / 3 || info.velocity.x > 400 ? false : open;
          animate(x, next ? -ACTIONS_W : 0, reduce ? { duration: 0 } : SNAP);
          onOpenChange(next);
        }}
        className="relative bg-card"
      >
        <button
          type="button"
          onPointerDown={(e) => {
            suppressClick.current = false;
            cancelPress();
            press.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                suppressClick.current = true;
                handlers.onMenu(tx);
              }, LONG_PRESS_MS),
            };
          }}
          onPointerMove={(e) => {
            if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) cancelPress();
          }}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(e) => {
            e.preventDefault();
            cancelPress();
            suppressClick.current = true;
            handlers.onMenu(tx);
          }}
          onClick={() => {
            if (suppressClick.current) return void (suppressClick.current = false);
            if (open) return onOpenChange(false);
            handlers.onOpen(tx);
          }}
          className="flex min-h-16 w-full touch-pan-y items-center gap-3 px-3 py-2.5 text-left transition-colors select-none active:bg-surface-2 [-webkit-touch-callout:none]"
        >
          <CategoryIcon icon={category?.icon} color={category?.color} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{title}</span>
            <span className="block truncate text-sm text-muted-foreground">{meta}</span>
          </span>
          <Money amountMinor={tx.amountMinor} currency={currency} kind={tx.type === "INCOME" ? "income" : "expense"} className="font-semibold" />
        </button>
      </motion.div>
    </motion.li>
  );
}

type Group = { id: string; title: string | null; netMinor: number | null; items: Transaction[] };

function groupRows(rows: ActivityRow[]): Group[] {
  const groups: Group[] = [];
  for (const r of rows) {
    if (r.type === "header") groups.push({ id: r.id, title: r.title, netMinor: r.netMinor, items: [] });
    else {
      if (groups.length === 0) groups.push({ id: "all", title: null, netMinor: null, items: [] });
      groups[groups.length - 1].items.push(r.tx);
    }
  }
  return groups;
}

/** Phone ledger: day groups (net shown only once the day is complete) of swipeable rows. */
export function ActivityList({
  rows,
  currency,
  categories,
  showDay,
  openRowId,
  onOpenRowChange,
  handlers,
}: {
  rows: ActivityRow[];
  currency: string;
  categories: Map<string, Category>;
  showDay: boolean;
  openRowId: string | null;
  onOpenRowChange: (id: string | null) => void;
  handlers: RowHandlers;
}) {
  let index = 0;
  return (
    <div className="space-y-5">
      {groupRows(rows).map((g) => (
        <section key={g.id} aria-label={g.title ?? "Transactions"}>
          {g.title && (
            <header className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold text-muted-foreground">{g.title}</h2>
              {g.netMinor !== null && <Money amountMinor={Math.abs(g.netMinor)} currency={currency} kind={g.netMinor < 0 ? "expense" : "income"} className="text-sm" />}
            </header>
          )}
          <ul className="surface divide-y divide-border overflow-hidden rounded-xl">
            {g.items.map((tx) => {
              const i = index++;
              return (
                <SwipeRow
                  key={tx.id}
                  tx={tx}
                  currency={currency}
                  category={categories.get(tx.categoryId)}
                  showDay={showDay}
                  open={openRowId === tx.id}
                  onOpenChange={(o) => onOpenRowChange(o ? tx.id : openRowId === tx.id ? null : openRowId)}
                  reveal={i < 12 ? i : null}
                  handlers={handlers}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Long-press menu for a row: the same actions as the swipe tray, plus Open and Duplicate. */
export function RowActionsSheet({
  tx,
  onClose,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  tx: Transaction | null;
  onClose: () => void;
  onOpen: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDuplicate: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const items = [
    { label: "Open", icon: "receipt-outline", run: onOpen },
    { label: "Edit", icon: "create-outline", run: onEdit },
    { label: "Duplicate", icon: "copy-outline", run: onDuplicate },
    { label: "Delete", icon: "trash-outline", run: onDelete, danger: true },
  ] as const;
  return (
    <ResponsiveDialog open={!!tx} onOpenChange={(o) => !o && onClose()} title={tx ? tx.title?.trim() || tx.categoryName : "Actions"}>
      <div className="grid gap-1 pb-2">
        {items.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            className={cn("h-12 justify-start gap-3 rounded-lg px-3 text-base", "danger" in item && "text-expense")}
            onClick={() => {
              const target = tx;
              onClose();
              if (target) item.run(target);
            }}
          >
            <Icon name={item.icon} size={20} /> {item.label}
          </Button>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
