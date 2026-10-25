import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BOOK_LIMIT } from "@/features/books/constants";
import { selectBook } from "@/features/books/coordinator";
import { confirmDeleteBook } from "@/features/books/deleteBook";
import { moveBook } from "@/features/books/reorder";
import { useBooksStore, type Book } from "@/features/books/store";
import { useBooksBusy } from "@/features/books/ui/BookEditor";
import { BookGlyph } from "@/features/books/ui/BookSwitcher";
import { useBookUIStore } from "@/features/books/ui/store";
import { Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { ErrorState, Skeleton } from "@/shared/ui/states";
import { SettingsGroup, SettingsRow } from "./SettingsRow";

const toast = (e: unknown) => useUndoToastStore.getState().showError(e, e instanceof Error ? e.message : undefined);

function BookItem({
  book,
  index,
  total,
  selected,
  busy,
  onMove,
  onDrop,
}: {
  book: Book;
  index: number;
  total: number;
  selected: boolean;
  busy: boolean;
  onMove: (to: number) => void;
  onDrop: () => void;
}) {
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const onHandleKey = (e: KeyboardEvent) => {
    const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : -1;
    if (to < 0 || to >= total) return;
    e.preventDefault();
    onMove(to);
  };

  return (
    <Reorder.Item
      as="li"
      value={book.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      whileDrag={reduce ? { zIndex: 10 } : { scale: 1.02, zIndex: 10 }}
      className="relative flex items-center border-b border-border bg-card pr-1 first:rounded-t-xl last:rounded-b-xl last:border-b-0"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void selectBook(book.id).catch(toast)}
        aria-current={selected ? "true" : undefined}
        aria-label={`Switch to ${book.name}`}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-4 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        <BookGlyph book={book} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{book.name}</span>
          {book.balanceMinor === undefined ? (
            <span className="text-sm text-muted-foreground">Balance unavailable</span>
          ) : (
            <Money amountMinor={book.balanceMinor} currency={book.currencyCode} kind="balance" className="text-sm text-muted-foreground" />
          )}
        </span>
        {selected && <Icon name="checkmark" size={18} className="text-primary" label="Current book" />}
      </button>
      <button
        type="button"
        disabled={busy}
        onPointerDown={(e) => !busy && controls.start(e)}
        onKeyDown={onHandleKey}
        aria-label={`Reorder ${book.name}, position ${index + 1} of ${total}. Drag, or use the arrow keys.`}
        aria-keyshortcuts="ArrowUp ArrowDown"
        className="grid size-11 cursor-grab touch-none place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground active:cursor-grabbing disabled:opacity-50"
      >
        <Icon name="reorder-handle" size={18} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={`Manage ${book.name}`}
          className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground data-[state=open]:bg-surface-2"
        >
          <Icon name="ellipsis-vertical" size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glass w-60 rounded-2xl p-1.5">
          <DropdownMenuItem className="gap-2.5 rounded-xl p-2" onSelect={() => useBookUIStore.getState().open("edit", book.id)}>
            <Icon name="create-outline" size={16} /> Rename, icon and color
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 rounded-xl p-2" disabled={index === 0} onSelect={() => onMove(index - 1)}>
            <Icon name="arrow-up" size={16} /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 rounded-xl p-2" disabled={index === total - 1} onSelect={() => onMove(index + 1)}>
            <Icon name="arrow-down" size={16} /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="gap-2.5 rounded-xl p-2" onSelect={() => confirmDeleteBook(book.id)}>
            <Icon name="trash-outline" size={16} /> Delete book
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Reorder.Item>
  );
}

/** Cash books: switch, drag (or arrow-key) reorder, rename, delete, add. Order persists through the books store. */
export function BooksSection() {
  const books = useBooksStore((s) => s.books);
  const selectedId = useBooksStore((s) => s.selectedBookId);
  const ready = useBooksStore((s) => s.ready);
  const loadError = useBooksStore((s) => s.error);
  const busy = useBooksBusy();
  // The dragged order, held until the store has the new order (the write waits behind pending reads).
  const [local, setLocal] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const storeIds = books.map((b) => b.id);
  const ids = local && local.length === storeIds.length ? local : storeIds;
  const selected = books.find((b) => b.id === selectedId);

  const persist = (work: Promise<void>, position: number, name: string) =>
    work
      .then(() => setAnnouncement(`${name} moved to position ${position + 1} of ${books.length}.`))
      .catch(toast)
      .finally(() => setLocal(null));

  const onDrop = (id: string) => {
    if (!local || local.join() === storeIds.join()) return setLocal(null);
    void persist(useBooksStore.getState().reorderBooks(local), local.indexOf(id), books.find((b) => b.id === id)?.name ?? "Book");
  };
  const onMove = (book: Book, to: number) => void persist(moveBook(book.id, to), to, book.name);

  return (
    <section id="books" aria-labelledby="books-title" className="scroll-mt-24 space-y-3">
      <h2 id="books-title" className="px-1 text-sm font-semibold text-muted-foreground">
        Cash books
      </h2>
      {books.length === 0 ? (
        loadError && !ready ? (
          <ErrorState error={null} title="Couldn't load cash books" onRetry={() => void useBooksStore.getState().loadBooks().catch(() => {})} className="surface rounded-xl" />
        ) : (
          <div className="surface space-y-px rounded-xl" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-9" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <Reorder.Group axis="y" as="ul" values={ids} onReorder={setLocal} className="surface rounded-xl">
            {ids.map((id, index) => {
              const book = books.find((b) => b.id === id);
              return book ? (
                <BookItem
                  key={id}
                  book={book}
                  index={index}
                  total={ids.length}
                  selected={id === selectedId}
                  busy={busy}
                  onMove={(to) => onMove(book, to)}
                  onDrop={() => onDrop(id)}
                />
              ) : null;
            })}
          </Reorder.Group>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <Button
            variant="outline"
            disabled={busy || books.length >= BOOK_LIMIT}
            onClick={() => useBookUIStore.getState().open("create")}
            className="h-11 w-full rounded-full border-primary/50 font-semibold active:scale-[0.98]"
          >
            <Icon name="add" size={16} /> Add new book
          </Button>
          <p className="px-1 text-sm text-muted-foreground">
            {books.length >= BOOK_LIMIT
              ? `You can have up to ${BOOK_LIMIT} cash books.`
              : "Drag the handle to reorder. Click a book to switch to it."}
          </p>
          {selected && (
            <SettingsGroup className="pt-2">
              <SettingsRow
                label="Opening balance"
                value={<Money amountMinor={selected.openingBalanceMinor} currency={selected.currencyCode} kind="balance" />}
                locked
              />
              <SettingsRow label="Currency" value={selected.currencyCode} locked />
              <SettingsRow label="Time zone" value={selected.timezone} locked />
            </SettingsGroup>
          )}
        </>
      )}
    </section>
  );
}
