import { create } from "zustand";

import type { ImportResponse } from "@/shared/types/api";

type State = {
  result: ImportResponse | null;
  bookId: string | null;
  setResult: (result: ImportResponse, bookId: string) => void;
  clear: () => void;
};

export const useImportResultStore = create<State>((set) => ({
  result: null, bookId: null,
  setResult: (result, bookId) => set({ result, bookId }),
  clear: () => set({ result: null, bookId: null }),
}));
