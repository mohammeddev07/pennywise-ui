import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isCurrentAccountEpoch } from "@/shared/session/accountEpoch";
import type { HomeSnapshot, SnapshotContext } from "./types";

type State = {
  snapshot: HomeSnapshot | null;
  save: (next: Omit<HomeSnapshot, "savedAt">, epoch: number) => void;
  clear: () => void;
  dropBook: (bookId: string) => void;
};

export function pickSnapshot(s: HomeSnapshot | null, ctx: SnapshotContext): HomeSnapshot | undefined {
  return s &&
    s.accountId === ctx.accountId &&
    s.bookId === ctx.bookId &&
    s.month === ctx.month &&
    s.weekStart === ctx.weekStart &&
    s.weekEnd === ctx.weekEnd
    ? s
    : undefined;
}

/** Last Home data seen on this device, painted at launch while the backend wakes up. */
export const useHomeSnapshotStore = create<State>()(
  persist(
    (set, get) => ({
      snapshot: null,
      save: (next, epoch) => {
        if (!isCurrentAccountEpoch(epoch)) return;
        const current = get().snapshot;
        if (current) {
          const { savedAt, ...rest } = current;
          if (JSON.stringify(rest) === JSON.stringify(next)) return;
        }
        set({ snapshot: { ...next, savedAt: Date.now() } });
      },
      clear: () => set({ snapshot: null }),
      dropBook: (bookId) => {
        if (get().snapshot?.bookId === bookId) set({ snapshot: null });
      },
    }),
    {
      name: "pennywise_home_snapshot_v1",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ snapshot: s.snapshot }),
    },
  ),
);
