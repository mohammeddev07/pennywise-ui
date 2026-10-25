import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CurrencyCode } from "@/shared/types/models";

export const DISPLAY_NAME_MAX = 40;

/**
 * Account-level currency fallback ONLY.
 *
 * The currency a user actually sees is `book.currencyCode`, picked once during
 * onboarding and fixed for the life of that book (see `useBookCurrency`).
 * This value exists so onboarding has something to seed the first book with,
 * and so a frame rendered before books hydrate has a sane placeholder. It is
 * deliberately not user-editable after setup - a live switch here would leave
 * every stored `amountMinor` reinterpreted in the wrong currency.
 */
type State = {
  appearance: "system" | "light" | "dark";
  setAppearance: (value: "system" | "light" | "dark") => void;
  /** Greeting name. Device-local until the backend profile has a name field. */
  displayName: string;
  setDisplayName: (value: string) => void;
  /** Seeds the generated avatar; re-rolled by tapping it. */
  avatarSeed: number;
  shuffleAvatar: () => void;
  primaryCurrency: CurrencyCode;
  setPrimaryCurrency: (c: CurrencyCode) => void;
};

export const useSettingsStore = create<State>()(
  persist(
    (set) => ({
      appearance: "system",
      setAppearance: appearance => set({ appearance }),
      displayName: "",
      setDisplayName: (value) => set({ displayName: value.trim().slice(0, DISPLAY_NAME_MAX) }),
      avatarSeed: Math.floor(Math.random() * 1e9),
      shuffleAvatar: () => set({ avatarSeed: Math.floor(Math.random() * 1e9) }),
      primaryCurrency: "USD",
      setPrimaryCurrency: (c) => set({ primaryCurrency: c }),
    }),
    {
      name: "pennywise_settings_v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 4,
      migrate: async (persisted: any) => {
        // v1 stored { primaryCurrency: string }. Keep it migration-safe.
        const c = String(persisted?.primaryCurrency ?? "USD") as CurrencyCode;
        const allowed: CurrencyCode[] = ["USD", "EUR", "GBP", "JPY", "INR"];
        return {
          appearance: ["light", "dark"].includes(persisted?.appearance) ? persisted.appearance : "system",
          displayName: typeof persisted?.displayName === "string" ? persisted.displayName.slice(0, DISPLAY_NAME_MAX) : "",
          avatarSeed: Number.isFinite(persisted?.avatarSeed) ? persisted.avatarSeed : Math.floor(Math.random() * 1e9),
          primaryCurrency: allowed.includes(c) ? c : "USD",
        } as State;
      },
    }
  )
);

export type { CurrencyCode };
