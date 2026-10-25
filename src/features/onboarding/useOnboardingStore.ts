import { create } from "zustand";
import type { CurrencyCode } from "@/shared/types/models";

type OnboardingState = {
  currency: CurrencyCode | null;
  setCurrency: (c: CurrencyCode) => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currency: null,
  setCurrency: (currency) => set({ currency }),
}));
