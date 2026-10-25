import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ACCESS_TOKEN_KEY, isAuthError, openColdStartWindow } from "@/shared/api/client";
import { QUERY_CACHE_KEY } from "@/shared/api/queryClient";
import * as authApi from "@/shared/api/auth";
import type { MeResponse } from "@/shared/types/api";
import { useSettingsStore, type CurrencyCode } from "@/features/settings/store";
import { bumpAccountEpoch, getAccountEpoch, isCurrentAccountEpoch } from "@/shared/session/accountEpoch";
import { markLaunch } from "@/shared/launchTiming";
import { signOutOfGoogle } from "./google";
import { isTokenExpired } from "./token";

export const AUTH_STORAGE_KEY = "pennywise_demo_auth_v1";

const ACCOUNT_STORAGE_KEYS = [
  AUTH_STORAGE_KEY,
  "pennywise_books_v1",
  "pennywise_categories_v1",
  "pennywise_budgets_v1",
  "pennywise_transactions_v1",
  "pennywise_settings_v1",
  "pennywise_home_snapshot_v1",
  QUERY_CACHE_KEY,
];

export type SessionStatus = "resolving" | "authenticated" | "unauthenticated";

type State = {
  accessToken: string | null;
  user: MeResponse | null;
  sessionStatus: SessionStatus;
  unlocked: boolean;
  onboardingCompleted: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, currencyCode?: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: MeResponse) => void;
  setUnlocked: (v: boolean) => void;
  completeOnboarding: () => void;
  hydrateAccessToken: () => Promise<void>;
  restoreSession: () => void;
  refreshSession: () => Promise<void>;
};

type PersistedState = Pick<State, "user" | "unlocked" | "onboardingCompleted">;

let logoutInFlight: Promise<void> | null = null;

function syncDefaultCurrency(user: MeResponse) {
  const currency = user.defaultCurrencyCode as CurrencyCode | null;
  if (currency && ["USD", "EUR", "GBP", "JPY", "INR"].includes(currency)) {
    useSettingsStore.getState().setPrimaryCurrency(currency);
  }
}

async function clearAccountState() {
  const [
    { useBooksStore },
    { useCategoriesStore },
    { useBudgetsStore },
    { useFilterStore },
    { clearQueryCache },
    { purgeLegacyTransactionCache },
    { useSettingsStore },
    { useAddTransactionDraftStore },
    { useOnboardingStore },
    { useUndoToastStore },
    { useHomeSnapshotStore },
  ] = await Promise.all([
    import("@/features/books/store"),
    import("@/features/categories/store"),
    import("@/features/budgets/store"),
    import("@/features/transactions/filterStore"),
    import("@/shared/api/queryClient"),
    import("@/features/transactions/legacy"),
    import("@/features/settings/store"),
    import("@/features/transactions/addDraftStore"),
    import("@/features/onboarding/useOnboardingStore"),
    import("@/shared/ui/state/useUndoToastStore"),
    import("@/features/home-snapshot/store"),
  ]);

  // Supersede and await any automatic hydration still in flight. Otherwise a
  // stale AsyncStorage read could finish after these resets and repopulate the
  // previous account in memory.
  await Promise.all([
    Promise.resolve(useBooksStore.persist.rehydrate()),
    Promise.resolve(useCategoriesStore.persist.rehydrate()),
    Promise.resolve(useBudgetsStore.persist.rehydrate()),
    Promise.resolve(useFilterStore.persist.rehydrate()),
    Promise.resolve(useSettingsStore.persist.rehydrate()),
    Promise.resolve(useHomeSnapshotStore.persist.rehydrate()),
  ]);

  (await import("@/features/books/operations")).resetBookOperations();
  (await import("@/features/imports/store")).useImportResultStore.getState().clear();
  (await import("@/features/books/ui/store")).useBookUIStore.getState().close();
  useBooksStore.setState({
    ready: false, isManaging: false,
    books: [],
    selectedBookId: "",
    isLoading: false,
    error: null,
  });
  useCategoriesStore.setState({
    categories: [],
    isLoading: false,
    error: null,
    lastCreatedCategoryId: null,
  });
  useBudgetsStore.setState({
    budgets: [],
    isLoading: false,
    error: null,
  });
  useHomeSnapshotStore.getState().clear();
  // Server data lives in the query cache, not a store: cancel what is in flight and drop every
  // cached row, detail and aggregate of the previous account. Filters are per-account UI state.
  await clearQueryCache();
  useFilterStore.getState().clearAllScopes();
  await purgeLegacyTransactionCache();
  useSettingsStore.setState({ primaryCurrency: "USD", displayName: "", avatarSeed: Math.floor(Math.random() * 1e9) });

  // These stores are not persisted, but may still contain data from the
  // previous account for the lifetime of the running app.
  useAddTransactionDraftStore.getState().reset();
  useOnboardingStore.setState({ currency: null });
  useUndoToastStore.getState().hide();
}

export const useAuthStore = create<State>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      sessionStatus: "resolving",
      unlocked: false,
      onboardingCompleted: false,

      login: async (email, password) => {
        const res = await authApi.login(email.trim().toLowerCase(), password);
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, res.accessToken);
        syncDefaultCurrency(res.user);
        set({
          accessToken: res.accessToken,
          user: res.user,
          sessionStatus: "authenticated",
          unlocked: true,
        });
      },

      loginWithGoogle: async (idToken) => {
        const res = await authApi.google(idToken);
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, res.accessToken);
        syncDefaultCurrency(res.user);
        set({
          accessToken: res.accessToken,
          user: res.user,
          sessionStatus: "authenticated",
          unlocked: true,
        });
      },

      signup: async (email, password, currencyCode) => {
        const res = await authApi.signup(email.trim().toLowerCase(), password, currencyCode);
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, res.accessToken);
        syncDefaultCurrency(res.user);
        set({
          accessToken: res.accessToken,
          user: res.user,
          sessionStatus: "authenticated",
          unlocked: true,
        });
      },

      logout: async () => {
        if (logoutInFlight) return logoutInFlight;

        logoutInFlight = (async () => {
          bumpAccountEpoch();
          set({
            accessToken: null,
            user: null,
            sessionStatus: "resolving",
            unlocked: false,
            onboardingCompleted: false,
          });

          let cleanupError: unknown = null;

          try {
            await clearAccountState();
          } catch (error) {
            cleanupError = error;
          }
          await signOutOfGoogle();
          try {
            await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
          } catch (error) {
            cleanupError ??= error;
          }

          // Store resets above intentionally update memory first. Removing the
          // backing keys last prevents any queued persistence write from
          // restoring another user's cached data.
          set({ sessionStatus: "unauthenticated" });
          await Promise.resolve();
          try {
            await AsyncStorage.multiRemove(ACCOUNT_STORAGE_KEYS);
          } catch (error) {
            cleanupError ??= error;
          }

          if (cleanupError) throw cleanupError;
        })().finally(() => {
          logoutInFlight = null;
        });

        return logoutInFlight;
      },

      setUser: (user) => set({ user }),
      setUnlocked: (v) => set({ unlocked: v }),
      completeOnboarding: () => set({ onboardingCompleted: true, unlocked: true }),

      hydrateAccessToken: async () => {
        const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        set({ accessToken });
      },

      restoreSession: () => {
        const { accessToken, user } = useAuthStore.getState();
        if (accessToken && user && !isTokenExpired(accessToken)) {
          openColdStartWindow();
          set({ sessionStatus: "authenticated", unlocked: true });
          markLaunch("session authenticated");
          void useAuthStore.getState().refreshSession().catch(() => {});
        } else {
          void useAuthStore.getState().logout().catch(() => {});
        }
      },

      refreshSession: async () => {
        const epoch = getAccountEpoch();
        try {
          const user = await authApi.getMe();
          if (!isCurrentAccountEpoch(epoch)) return;
          syncDefaultCurrency(user);
          set({ user });
        } catch (err) {
          // Only a real 401/403 signs out; timeouts and network errors (cold backend) are ignored.
          if (isAuthError(err) && isCurrentAccountEpoch(epoch) && useAuthStore.getState().sessionStatus !== "unauthenticated") {
            await useAuthStore.getState().logout();
          }
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): PersistedState => ({
        user: s.user,
        unlocked: s.unlocked,
        onboardingCompleted: s.onboardingCompleted,
      }),
      migrate: async (persisted: any) => {
        const user =
          persisted?.user ??
          (persisted?.userEmail
            ? {
                id: "legacy-local-user",
                email: String(persisted.userEmail),
                defaultCurrencyCode: "USD",
                createdAt: new Date().toISOString(),
              }
            : null);

        return {
          user,
          unlocked: Boolean(persisted?.unlocked),
          onboardingCompleted: Boolean(persisted?.onboardingCompleted),
        } as PersistedState;
      },
    }
  )
);
