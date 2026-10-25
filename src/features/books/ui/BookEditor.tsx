import axios from "axios";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChoiceGrid } from "@/features/categories/ChoiceGrid";
import { useSettingsStore } from "@/features/settings/store";
import { getApiErrorCode, getApiErrorMessage } from "@/shared/api/errors";
import { getAccountEpoch, isCurrentAccountEpoch } from "@/shared/session/accountEpoch";
import type { Book } from "@/shared/types/models";
import { Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { confirmDestructive } from "@/shared/ui/utils/confirm";
import {
  BOOK_COLORS, BOOK_CURRENCIES, BOOK_ICONS, BOOK_LIMIT, BOOK_NAME_MAX, isBookColor, isBookIcon, type BookColor, type BookIcon,
} from "../constants";
import { parseOpeningBalance } from "../openingBalance";
import { useBookOperations } from "../operations";
import { deviceTimezone, useBooksStore } from "../store";
import { BookGlyph } from "./BookSwitcher";
import { useBookUIStore } from "./store";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const ICON_OPTIONS = (Object.keys(BOOK_ICONS) as BookIcon[]).map((value) => ({ value, label: cap(value) }));
const COLOR_OPTIONS = (Object.keys(BOOK_COLORS) as BookColor[]).map((value) => ({ value, label: cap(value) }));

/** Book write failures in plain words; the two limit codes get their own message. */
export function bookErrorMessage(error: unknown, fallback: string) {
  const code = getApiErrorCode(error);
  if (code === "BOOK_LIMIT_REACHED") return `You can have up to ${BOOK_LIMIT} cash books.`;
  if (code === "LAST_BOOK_REQUIRED") return "You need at least one cash book.";
  if (axios.isAxiosError(error)) return getApiErrorMessage(error, fallback);
  return error instanceof Error ? error.message : fallback;
}

export function useBooksBusy() {
  const managing = useBooksStore((s) => s.isManaging);
  const active = useBookOperations((s) => s.active);
  return managing || active > 0;
}

/** Create or edit a cash book. Registers its discard guard in `closeRequest` so Escape and outside clicks ask first. */
export function BookEditor({ book, closeRequest }: { book?: Book; closeRequest: RefObject<() => void> }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const busy = useBooksBusy();
  const bookCount = useBooksStore((s) => s.books.length);
  const error = useBookUIStore((s) => s.error);
  const primary = useSettingsStore((s) => s.primaryCurrency);
  const [name, setName] = useState(book?.name ?? "");
  const [currency, setCurrency] = useState<string>((BOOK_CURRENCIES as readonly string[]).includes(primary) ? primary : "USD");
  const [opening, setOpening] = useState("");
  const [icon, setIcon] = useState<BookIcon>(isBookIcon(book?.icon) ? book.icon : "book");
  const [color, setColor] = useState<BookColor>(isBookColor(book?.color) ? book.color : "green");
  const [timezone] = useState(deviceTimezone);

  const trimmed = name.trim();
  const nameValid = Boolean(trimmed) && trimmed.length <= BOOK_NAME_MAX;
  const minor = parseOpeningBalance(opening, currency);
  const changed = book
    ? {
        ...(trimmed !== book.name ? { name: trimmed } : {}),
        ...(icon !== (book.icon ?? "book") ? { icon } : {}),
        ...(color !== (book.color ?? "green") ? { color } : {}),
      }
    : {};
  const dirty = book ? Object.keys(changed).length > 0 : Boolean(name || opening || icon !== "book" || color !== "green");
  const atLimit = !book && bookCount >= BOOK_LIMIT;
  const canSave = nameValid && minor !== null && !busy && !atLimit && (!book || dirty);

  const sheetKind = book ? "edit" : "create";
  const stillOpen = () => {
    const ui = useBookUIStore.getState();
    return ui.sheet === sheetKind && ui.bookId === (book?.id ?? null);
  };

  // A cold backend can hold a write for a minute; closing never blocks on it (a late failure becomes a toast).
  useEffect(() => {
    const close = useBookUIStore.getState().close;
    closeRequest.current = () => {
      if (busy || !dirty) return close();
      confirmDestructive(book ? "Discard book changes?" : "Discard new book?", "Your changes will be lost.", close, "Discard");
    };
    return () => {
      closeRequest.current = close;
    };
  }, [closeRequest, busy, dirty, book]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || minor === null) return;
    const epoch = getAccountEpoch();
    const ui = useBookUIStore.getState();
    ui.setError(null);
    const store = useBooksStore.getState();
    try {
      if (book) await store.updateBook(book.id, changed);
      else await store.addBook({ name: trimmed, currencyCode: currency, timezone, openingBalanceMinor: minor, icon, color });
      if (isCurrentAccountEpoch(epoch) && stillOpen()) ui.close();
    } catch (err) {
      if (!isCurrentAccountEpoch(epoch)) return;
      const message = bookErrorMessage(err, book ? "Couldn't save this book." : "Couldn't create this book.");
      if (stillOpen()) useBookUIStore.getState().setError(message);
      else useUndoToastStore.getState().showError(err, message);
    }
  };

  return (
    <form id={formId} onSubmit={save} className="space-y-6 pb-4">
      <div className="grid place-items-center py-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${icon}${color}`}
            initial={reduce ? false : { scale: 0.7, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={reduce ? undefined : { scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
          >
            <BookGlyph book={{ icon, color }} size={72} />
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${formId}-name`}>Book name</Label>
          <span className={trimmed.length > BOOK_NAME_MAX ? "text-xs text-expense" : "text-xs text-muted-foreground"}>
            {trimmed.length}/{BOOK_NAME_MAX}
          </span>
        </div>
        <Input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          autoComplete="off"
          autoFocus={!book}
          placeholder="Personal, Travel, Side business"
          aria-invalid={trimmed.length > BOOK_NAME_MAX}
          aria-describedby={trimmed.length > BOOK_NAME_MAX ? `${formId}-name-error` : undefined}
          className="h-11 rounded-lg px-3"
        />
        {trimmed.length > BOOK_NAME_MAX && (
          <p id={`${formId}-name-error`} className="text-sm text-expense">
            Use at most {BOOK_NAME_MAX} characters.
          </p>
        )}
      </div>

      {book ? (
        <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">
          <Icon name="lock-closed-outline" size={16} className="mt-0.5 shrink-0" />
          <span>
            {book.currencyCode}, {book.timezone}, opening balance{" "}
            <Money amountMinor={book.openingBalanceMinor} currency={book.currencyCode} kind="balance" className="text-foreground" />. These can't be changed.
          </span>
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-currency`}>Currency</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={busy}>
              <SelectTrigger id={`${formId}-currency`} aria-describedby={`${formId}-currency-hint`} className="h-11 w-full rounded-lg px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass max-h-72 rounded-xl">
                {BOOK_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id={`${formId}-currency-hint`} className="text-sm text-muted-foreground">
              Currency can't be changed later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-opening`}>Opening balance (optional)</Label>
            <div className="flex gap-2">
              <Input
                id={`${formId}-opening`}
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                disabled={busy}
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                aria-invalid={minor === null}
                aria-describedby={`${formId}-opening-hint`}
                className="money h-11 rounded-lg px-3"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="h-11 shrink-0 rounded-full px-4"
                onClick={() => setOpening(opening.startsWith("-") ? opening.slice(1) : `-${opening || "0"}`)}
              >
                Change sign
              </Button>
            </div>
            <p id={`${formId}-opening-hint`} className={minor === null ? "text-sm text-expense" : "text-sm text-muted-foreground"}>
              {minor === null ? `Enter a valid ${currency} amount.` : "Use a negative amount for an existing debt."}
            </p>
          </div>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="time-outline" size={16} /> Time zone {timezone}. Fixed after creation.
          </p>
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Icon</p>
        <ChoiceGrid
          label="Book icon"
          value={icon}
          onChange={setIcon}
          options={ICON_OPTIONS}
          disabled={busy}
          className="grid-cols-5 sm:grid-cols-9"
          render={(v, active) => <Icon name={BOOK_ICONS[v]} size={20} weight={active ? "bold" : "regular"} />}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ChoiceGrid
          label="Book color"
          value={color}
          onChange={setColor}
          options={COLOR_OPTIONS}
          disabled={busy}
          shape="rounded-full"
          className="max-w-xs grid-cols-6"
          render={(v) => <span className="block size-6 rounded-full" style={{ background: BOOK_COLORS[v] }} />}
        />
      </div>

      {atLimit && <p className="text-sm text-muted-foreground">You can have up to {BOOK_LIMIT} cash books.</p>}
      {busy && <p aria-live="polite" className="text-sm text-muted-foreground">Wait for the current operation to finish.</p>}
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!canSave} className="glow h-11 w-full rounded-full font-semibold active:scale-[0.98]">
        {busy ? "Saving" : book ? "Save changes" : "Create book"}
      </Button>
    </form>
  );
}
