import { create } from "zustand";
import type { TransactionType } from "@/shared/types/models";

/**
 * App-wide editors live in dialogs/sheets (not routes) so they open over whatever screen the user is on.
 * One overlay at a time; `open` flips first and the payload clears after the exit animation.
 */
export type Overlay =
  | { kind: "add-transaction"; type?: TransactionType }
  | { kind: "category-editor"; id?: string; type?: TransactionType }
  | { kind: "budget-editor"; categoryId: string; month: string }
  | { kind: "import" }
  | { kind: "palette" };

type State = {
  overlay: Overlay | null;
  open: boolean;
  show: (overlay: Overlay) => void;
  close: () => void;
};

export const useOverlay = create<State>((set, get) => ({
  overlay: null,
  open: false,
  show: (overlay) => set({ overlay, open: true }),
  close: () => {
    set({ open: false });
    setTimeout(() => {
      if (!get().open) set({ overlay: null });
    }, 320);
  },
}));

/** A form the user could lose by switching books (the coordinator asks before discarding it). */
export const isEditorOpen = () => {
  const { open, overlay } = useOverlay.getState();
  return open && !!overlay && overlay.kind !== "palette";
};
