import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { ResponsiveDialog } from "@/shared/ui/ResponsiveDialog";
import { EmptyState } from "@/shared/ui/states";
import { BOOK_LIMIT } from "../constants";
import { selectBook } from "../coordinator";
import { confirmDeleteBook } from "../deleteBook";
import { useBooksStore } from "../store";
import { BookEditor, bookErrorMessage, useBooksBusy } from "./BookEditor";
import { BookGlyph } from "./BookSwitcher";
import { useBookUIStore } from "./store";

function Feedback() {
  const busy = useBooksBusy();
  const error = useBookUIStore((s) => s.error);
  return (
    <>
      {busy && <p aria-live="polite" className="text-sm text-muted-foreground">Wait for the current operation to finish.</p>}
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
    </>
  );
}

function Switcher() {
  const navigate = useNavigate();
  const busy = useBooksBusy();
  const books = useBooksStore((s) => s.books);
  const selectedId = useBooksStore((s) => s.selectedBookId);
  const { open, close, setError } = useBookUIStore.getState();
  const choose = (id: string) =>
    void selectBook(id).catch((e) => setError(bookErrorMessage(e, "Couldn't switch books.")));

  return (
    <div className="space-y-4 pb-4">
      <ul className="surface divide-y divide-border overflow-hidden rounded-xl">
        {books.map((b) => (
          <li key={b.id} className="flex items-center pr-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => choose(b.id)}
              aria-current={b.id === selectedId ? "true" : undefined}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <BookGlyph book={b} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{b.name}</span>
                {b.balanceMinor === undefined ? (
                  <span className="text-sm text-muted-foreground">Balance unavailable</span>
                ) : (
                  <Money amountMinor={b.balanceMinor} currency={b.currencyCode} kind="balance" className="text-sm text-muted-foreground" />
                )}
              </span>
              {b.id === selectedId && <Icon name="checkmark" size={18} className="text-primary" label="Current book" />}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => open("menu", b.id)}
              aria-label={`Manage ${b.name}`}
              className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <Icon name="ellipsis-vertical" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <Feedback />
      <Button
        variant="outline"
        disabled={busy || books.length >= BOOK_LIMIT}
        onClick={() => open("create")}
        className="h-11 w-full rounded-full border-primary/50 font-semibold active:scale-[0.98]"
      >
        <Icon name="add" size={16} /> Add new book
      </Button>
      {books.length >= BOOK_LIMIT && <p className="text-sm text-muted-foreground">You can have up to {BOOK_LIMIT} cash books.</p>}
      <button
        type="button"
        onClick={() => {
          close();
          navigate("/settings#books");
        }}
        className="flex min-h-12 w-full items-center gap-3 rounded-lg bg-surface-2 px-4 text-left text-sm font-medium hover:bg-surface-3"
      >
        <Icon name="settings-outline" size={18} />
        <span className="flex-1">Manage books</span>
        <Icon name="chevron-forward" size={16} className="text-muted-foreground" />
      </button>
    </div>
  );
}

function BookMenu({ bookId }: { bookId: string }) {
  const busy = useBooksBusy();
  const open = useBookUIStore((s) => s.open);
  return (
    <div className="space-y-3 pb-4">
      <Feedback />
      <Button disabled={busy} onClick={() => open("edit", bookId)} className="h-11 w-full rounded-full font-semibold">
        <Icon name="create-outline" size={16} /> Rename or change icon and color
      </Button>
      <Button variant="destructive" disabled={busy} onClick={() => confirmDeleteBook(bookId)} className="h-11 w-full rounded-full font-semibold">
        <Icon name="trash-outline" size={16} /> Delete book
      </Button>
    </div>
  );
}

/**
 * The book switcher, per-book menu and create/edit editor share one dialog (sheet on phones), so moving
 * between them swaps content instead of closing one overlay and opening another.
 */
export function BookSheets() {
  const reduce = useReducedMotion();
  const sheet = useBookUIStore((s) => s.sheet);
  const bookId = useBookUIStore((s) => s.bookId);
  const closeRequest = useRef<() => void>(useBookUIStore.getState().close);
  // Keep the last view while the dialog animates out.
  const [view, setView] = useState({ sheet, bookId });
  if (sheet && (sheet !== view.sheet || bookId !== view.bookId)) setView({ sheet, bookId });
  const book = useBooksStore((s) => s.books.find((b) => b.id === view.bookId));

  const title =
    view.sheet === "create" ? "Create a new book" : view.sheet === "edit" ? "Edit cash book" : view.sheet === "menu" ? (book?.name ?? "Cash book") : "Cash books";

  const body =
    view.sheet === "create" ? (
      <BookEditor closeRequest={closeRequest} />
    ) : (view.sheet === "edit" || view.sheet === "menu") && !book ? (
      <EmptyState icon="book-outline" title="Book unavailable" body="It may have been deleted on another device." />
    ) : view.sheet === "edit" && book ? (
      <BookEditor key={book.id} book={book} closeRequest={closeRequest} />
    ) : view.sheet === "menu" && book ? (
      <BookMenu bookId={book.id} />
    ) : (
      <Switcher />
    );

  return (
    <ResponsiveDialog open={sheet !== null} onOpenChange={(o) => !o && closeRequest.current()} title={title}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${view.sheet}:${view.bookId}`}
          initial={reduce ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -16, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </ResponsiveDialog>
  );
}
