import { useNavigate } from "react-router";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { useAuthStore } from "@/features/auth/store";
import { selectBook } from "@/features/books/coordinator";
import { useBooksStore } from "@/features/books/store";
import { BookGlyph } from "@/features/books/ui/BookSwitcher";
import { useSettingsStore } from "@/features/settings/store";
import { Icon } from "@/shared/ui/Icon";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { confirmDialog } from "@/shared/ui/utils/confirm";
import { exportTransactionsToDevice } from "@/shared/utils/exportFile";
import { useExportToastStore } from "@/shared/ui/state/useExportToastStore";
import { NAV } from "./nav";
import { useOverlay } from "./overlays";
import { SHORTCUTS } from "./shortcuts";

export function CommandPalette() {
  const navigate = useNavigate();
  const { open, overlay, close, show } = useOverlay();
  const books = useBooksStore((s) => s.books);
  const selectedId = useBooksStore((s) => s.selectedBookId);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const isOpen = open && overlay?.kind === "palette";

  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const fail = (e: unknown) => useUndoToastStore.getState().showError(e);

  return (
    <CommandDialog open={isOpen} onOpenChange={(o) => !o && close()} title="Command palette" description="Search for a page or action">
      <CommandInput placeholder="Type a command or search" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(() => show({ kind: "add-transaction", type: "EXPENSE" }))}>
            <Icon name="arrow-up" /> New expense <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(() => show({ kind: "add-transaction", type: "INCOME" }))}>
            <Icon name="arrow-down" /> New income
          </CommandItem>
          <CommandItem onSelect={run(() => show({ kind: "category-editor" }))}>
            <Icon name="pricetag-outline" /> New category
          </CommandItem>
          <CommandItem onSelect={run(() => show({ kind: "import" }))}>
            <Icon name="cloud-upload-outline" /> Import transactions
          </CommandItem>
          <CommandItem
            onSelect={run(() =>
              void exportTransactionsToDevice(selectedId)
                .then((r) => useExportToastStore.getState().showSuccess(r.fileName))
                .catch(fail),
            )}
          >
            <Icon name="download-outline" /> Export this book (.xlsx)
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAV.map((n) => (
            <CommandItem key={n.to} onSelect={run(() => navigate(n.to))}>
              <Icon name={n.icon} /> {n.label}
              <CommandShortcut>G {n.key.toUpperCase()}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        {books.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch cash book">
              {books.map((b) => (
                <CommandItem key={b.id} value={`book ${b.name}`} onSelect={run(() => void selectBook(b.id).catch(fail))}>
                  <BookGlyph book={b} size={20} /> {b.name}
                  {b.id === selectedId && <Icon name="checkmark" className="ml-auto text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem onSelect={run(() => setAppearance("light"))}>
            <Icon name="sun" /> Light theme
          </CommandItem>
          <CommandItem onSelect={run(() => setAppearance("dark"))}>
            <Icon name="moon" /> Dark theme
          </CommandItem>
          <CommandItem onSelect={run(() => setAppearance("system"))}>
            <Icon name="desktop" /> Match system
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Keyboard shortcuts">
          {SHORTCUTS.map((s) => (
            <CommandItem key={s.label} disabled className="opacity-100 data-[disabled=true]:opacity-100">
              {s.label}
              <CommandShortcut>{s.keys.join(" ")}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem
            onSelect={run(
              () =>
                void confirmDialog({ title: "Sign out?", message: "Cached data on this device will be cleared.", confirmLabel: "Sign out" }).then(
                  (ok) => ok && void useAuthStore.getState().logout(),
                ),
            )}
          >
            <Icon name="log-out-outline" /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
