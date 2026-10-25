import { create } from "zustand";
type State = {
  sheet: "switcher" | "create" | "edit" | "menu" | null;
  bookId: string | null;
  error: string | null;
  setError: (error: string | null) => void;
  open: (sheet: State["sheet"], bookId?: string) => void;
  close: () => void;
};
export const useBookUIStore = create<State>((set) => ({
  error: null,
  setError: (error) => set({ error }),
  sheet: null,
  bookId: null,
  open: (sheet, bookId) => set({ sheet, bookId: bookId ?? null, error: null }),
  close: () => set({ sheet: null, bookId: null, error: null }),
}));
