import { useNavigate } from "react-router";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { bookStyle, BOOK_LIMIT } from "../constants";
import { selectBook } from "../coordinator";
import { useBooksStore, type Book } from "../store";
import { useBookUIStore } from "./store";

export function BookGlyph({ book, size = 32 }: { book?: Pick<Book, "icon" | "color">; size?: number }) {
  const style = bookStyle(book?.icon, book?.color);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg text-white"
      style={{ width: size, height: size, background: style.color }}
    >
      <Icon name={style.icon} size={Math.round(size * 0.55)} weight="bold" />
    </span>
  );
}

/** Cash book picker: a full-width row in the sidebar, a compact pill in phone headers. */
export function BookSwitcher({ variant = "pill" }: { variant?: "row" | "pill" }) {
  const navigate = useNavigate();
  const books = useBooksStore((s) => s.books);
  const selectedId = useBooksStore((s) => s.selectedBookId);
  const current = books.find((b) => b.id === selectedId);
  const openBookUI = useBookUIStore((s) => s.open);

  const choose = (id: string) =>
    void selectBook(id).catch((e) => useUndoToastStore.getState().showError(e, "Couldn't switch books."));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group flex items-center gap-2.5 text-left transition-colors",
          variant === "row"
            ? "w-full rounded-xl p-2 hover:bg-surface-2 data-[state=open]:bg-surface-2"
            : "max-w-[60vw] rounded-full bg-surface-2 py-1 pr-3 pl-1 hover:bg-surface-3",
        )}
        aria-label={`Cash book: ${current?.name ?? "none"}. Switch book`}
      >
        <BookGlyph book={current} size={variant === "row" ? 36 : 28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current?.name ?? "Cash book"}</span>
          {variant === "row" && current?.balanceMinor !== undefined && (
            <Money amountMinor={current.balanceMinor} currency={current.currencyCode} kind="balance" className="text-xs text-muted-foreground" />
          )}
        </span>
        <Icon name="chevron-down" size={14} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass w-72 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Cash books</DropdownMenuLabel>
        {books.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => choose(b.id)} className="gap-3 rounded-xl p-2">
            <BookGlyph book={b} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{b.name}</span>
              {b.balanceMinor !== undefined && (
                <Money amountMinor={b.balanceMinor} currency={b.currencyCode} kind="balance" className="text-xs text-muted-foreground" />
              )}
            </span>
            {b.id === selectedId && <Icon name="checkmark" size={16} className="text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={books.length >= BOOK_LIMIT} onSelect={() => openBookUI("create")} className="gap-3 rounded-xl p-2">
          <Icon name="add" size={18} /> New cash book
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/settings#books")} className="gap-3 rounded-xl p-2">
          <Icon name="settings-outline" size={18} /> Manage books
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
