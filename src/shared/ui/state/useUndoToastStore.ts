import { create } from "zustand";

import { getApiErrorMessage } from "@/shared/api/errors";

let hideTimer: ReturnType<typeof setTimeout> | null = null;

type State = {
  visible: boolean;
  title: string;
  message: string;

  showError: (error: unknown, fallback?: string) => void;
  hide: () => void;
};

export const useUndoToastStore = create<State>((set) => ({
  visible: false,
  title: "Action failed",
  message: "",

  showError: (error, fallback) => {
    if (hideTimer) clearTimeout(hideTimer);

    set({
      visible: true,
      title: "Action failed",
      message: getApiErrorMessage(error, fallback),
    });

    hideTimer = setTimeout(() => {
      set({ visible: false });
      hideTimer = null;
    }, 6000);
  },

  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    set({ visible: false });
  },
}));
