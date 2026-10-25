import { useBooksStore } from "./store";
import { hasBookOperation } from "./operations";
import { purgeBookData } from "./coordinator";
import { useBookUIStore } from "./ui/store";
import { confirmDestructive, alertCompat } from "@/shared/ui/utils/confirm";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { getApiErrorCode, getApiErrorMessage } from "@/shared/api/errors";
import {
  getAccountEpoch,
  isCurrentAccountEpoch,
} from "@/shared/session/accountEpoch";
export function confirmDeleteBook(id: string) {
  const state = useBooksStore.getState();
  const book = state.books.find((b) => b.id === id);
  if (!book) {
    alertCompat("Book unavailable", "Reload cash books before trying again.");
    return;
  }
  if (state.isManaging || hasBookOperation()) {
    alertCompat(
      "Operation in progress",
      "Wait for the current operation before deleting a book.",
    );
    return;
  }
  if (state.books.length <= 1) {
    alertCompat("Keep one cash book", "You need at least one cash book.");
    return;
  }
  const epoch = getAccountEpoch();
  confirmDestructive(
    `Remove “${book.name}”?`,
    "Remove this book and all its transactions? They will no longer be accessible in the app. Your account and other books will stay unchanged. This cannot be undone in the app.",
    () => {
      void (async () => {
        if (!isCurrentAccountEpoch(epoch)) return;
        try {
          const current = useBooksStore.getState();
          if (current.isManaging || hasBookOperation())
            throw new Error(
              "Wait for the current operation before deleting a book.",
            );
          if (current.books.find((b) => b.id === id)?.version !== book.version)
            throw new Error(
              "This book changed. Review it and confirm deletion again.",
            );
          if (await current.removeBook(id, book.version)) {
            await purgeBookData(id);
            if (isCurrentAccountEpoch(epoch)) useBookUIStore.getState().close();
          }
        } catch (error) {
          if (!isCurrentAccountEpoch(epoch)) return;
          if (getApiErrorCode(error) === "NOT_FOUND") {
            await purgeBookData(id);
            useBookUIStore.getState().close();
          }
          const fallback =
            error instanceof Error ? error.message : "Could not delete book.";
          const ui = useBookUIStore.getState();
          if (ui.sheet === "menu" && ui.bookId === id) {
            ui.setError(getApiErrorMessage(error, fallback));
          } else {
            useUndoToastStore.getState().showError(error, fallback);
          }
        }
      })();
    },
    "Delete book",
  );
}
