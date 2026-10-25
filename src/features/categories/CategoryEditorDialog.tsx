import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBooksStore } from "@/features/books/store";
import { invalidateTransactionData } from "@/features/transactions/queries";
import { getApiErrorCode, getApiErrorMessage } from "@/shared/api/errors";
import { queryClient } from "@/shared/api/queryClient";
import type { Category, TransactionType } from "@/shared/types/models";
import { CATEGORY_COLORS, CATEGORY_ICON_NAMES, CategoryIcon, Icon } from "@/shared/ui/Icon";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { Segmented } from "@/shared/ui/Segmented";
import { EmptyState, Skeleton } from "@/shared/ui/states";
import { confirmDestructive } from "@/shared/ui/utils/confirm";
import { ChoiceGrid } from "./ChoiceGrid";
import { useCategoriesStore } from "./store";

const NAME_MAX = 60;
const COLOR_NAMES = ["Amber", "Green", "Sky", "Violet", "Blue", "Pink", "Mint", "Gray"];
const ICON_OPTIONS = CATEGORY_ICON_NAMES.map((value) => {
  const words = value.replace(/-outline$/, "").replace(/-/g, " ");
  return { value: value as string, label: words[0].toUpperCase() + words.slice(1) };
});
const COLOR_OPTIONS = CATEGORY_COLORS.map((value, i) => ({ value, label: COLOR_NAMES[i] ?? value }));
const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id?: string;
  type?: TransactionType;
  /** Set when opened from the add-transaction flow, so the new category is picked there automatically. */
  origin?: "add-transaction";
};

export function CategoryEditorDialog(props: Props) {
  const { open, onOpenChange, id } = props;
  const bookId = useBooksStore((s) => s.selectedBookId);
  const editing = useCategoriesStore((s) => (id ? s.categories.find((c) => c.id === id && c.bookId === bookId) : undefined));
  const isLoading = useCategoriesStore((s) => s.isLoading);

  // An edit link can arrive before the list does (fresh device, other book).
  useEffect(() => {
    if (id && !editing && bookId) void useCategoriesStore.getState().loadCategories(bookId).catch(() => {});
  }, [id, editing, bookId]);

  if (id && !editing) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Edit category">
        {isLoading ? (
          <div className="space-y-4 pb-4" aria-busy="true">
            <Skeleton className="h-14 w-14" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <EmptyState
            icon="pricetag-outline"
            title="Category not found"
            body="It may have been deleted on another device."
            action={
              <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            }
          />
        )}
      </ResponsiveDialog>
    );
  }
  return <CategoryForm key={editing?.id ?? "new"} {...props} bookId={bookId} editing={editing} />;
}

function CategoryForm({
  open,
  onOpenChange,
  type: initialType,
  origin,
  bookId,
  editing,
}: Props & { bookId: string; editing?: Category }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const [type, setType] = useState<TransactionType>(editing?.type ?? initialType ?? "EXPENSE");
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState<string>(editing?.icon ?? CATEGORY_ICON_NAMES[0]);
  const [color, setColor] = useState(editing?.color ?? CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmed = name.trim();
  const tooLong = trimmed.length > NAME_MAX;
  const canSave = Boolean(trimmed) && !tooLong && Boolean(editing?.bookId || bookId) && !saving;
  // Older categories may carry a color outside today's palette; keep it selectable rather than silently swapping it.
  const colorOptions = COLOR_OPTIONS.some((c) => c.value === color) ? COLOR_OPTIONS : [...COLOR_OPTIONS, { value: color, label: "Current color" }];

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    const store = useCategoriesStore.getState();
    try {
      if (editing) {
        await store.updateCategory(editing.bookId, editing.id, { name: trimmed, icon, color });
        void invalidateTransactionData(queryClient, editing.bookId);
      } else {
        const created = await store.addCategory(bookId, { type, name: trimmed, icon, color });
        if (origin === "add-transaction") store.markLastCreatedCategoryId(created);
        void invalidateTransactionData(queryClient, bookId);
      }
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, editing ? "Couldn't save this category." : "Couldn't create this category."));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editing || saving) return;
    confirmDestructive(
      `Delete “${editing.name}”?`,
      "A category that still has transactions can't be deleted.",
      () =>
        void (async () => {
          setSaving(true);
          setError("");
          try {
            await useCategoriesStore.getState().removeCategory(editing.bookId, editing.id);
            void invalidateTransactionData(queryClient, editing.bookId);
            onOpenChange(false);
          } catch (err) {
            setError(
              getApiErrorCode(err) === "CATEGORY_IN_USE"
                ? "This category still has transactions. Move or delete them first, then try again."
                : getApiErrorMessage(err, "Couldn't delete this category."),
            );
          } finally {
            setSaving(false);
          }
        })(),
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit category" : "New category"}
      footer={
        <>
          {editing && (
            <Button type="button" variant="destructive" className="h-11 rounded-full px-5" disabled={saving} onClick={remove}>
              <Icon name="trash-outline" size={16} /> Delete
            </Button>
          )}
          <Button type="submit" form={formId} disabled={!canSave} className="glow h-11 rounded-full px-6 font-semibold active:scale-[0.98]">
            {saving ? "Saving" : editing ? "Save changes" : "Create category"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="space-y-6 pb-2">
        <div className="flex items-center gap-4">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${icon}${color}`}
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
            >
              <CategoryIcon icon={icon} color={color} size={56} />
            </motion.span>
          </AnimatePresence>
          <div className="min-w-0">
            <p className="truncate font-semibold">{trimmed || "Category name"}</p>
            <p className="text-sm text-muted-foreground">{type === "EXPENSE" ? "Expense" : "Income"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Type</p>
          {editing ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lock-closed-outline" size={16} />
              {editing.type === "EXPENSE" ? "Expense" : "Income"}. The type is fixed after creation.
            </p>
          ) : (
            <Segmented
              label="Category type"
              value={type}
              onChange={setType}
              options={TYPE_OPTIONS}
              tone={(v) => (v === "EXPENSE" ? "expense" : "income")}
              className="w-full max-w-xs"
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={`${formId}-name`}>Name</Label>
            <span className={tooLong ? "text-xs text-expense" : "text-xs text-muted-foreground"}>
              {trimmed.length}/{NAME_MAX}
            </span>
          </div>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Groceries, Rent, Salary"
            autoComplete="off"
            autoFocus={!editing}
            aria-invalid={tooLong}
            aria-describedby={tooLong ? `${formId}-name-error` : undefined}
            className="h-11 rounded-lg px-3"
          />
          {tooLong && (
            <p id={`${formId}-name-error`} className="text-sm text-expense">
              Use at most {NAME_MAX} characters.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Icon</p>
          <ChoiceGrid
            label="Icon"
            value={icon}
            onChange={setIcon}
            options={ICON_OPTIONS}
            className="grid-cols-7"
            render={(v, active) => <Icon name={v} size={20} weight={active ? "duotone" : "regular"} className={active ? "text-foreground" : "text-muted-foreground"} />}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Color</p>
          <ChoiceGrid
            label="Color"
            value={color}
            onChange={setColor}
            options={colorOptions}
            shape="rounded-full"
            className="grid-cols-8 sm:max-w-sm"
            render={(v) => <span className="block size-6 rounded-full" style={{ background: v }} />}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
      </form>
    </ResponsiveDialog>
  );
}
