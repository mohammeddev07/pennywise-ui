import { useEffect, useLayoutEffect } from "react";
import { Outlet } from "react-router";
import { useAuthStore } from "@/features/auth/store";
import { installBookCoordinator, setBookNavigation } from "@/features/books/coordinator";
import { useBooksStore } from "@/features/books/store";
import { useHomeSnapshotStore } from "@/features/home-snapshot/store";
import { purgeLegacyTransactionCache } from "@/features/transactions/legacy";
import { queryClient } from "@/shared/api/queryClient";
import { useServerStatus, wakeServer } from "@/shared/api/wake";
import { useApplyAppearance } from "@/shared/ui/theme/appearance";
import { LogoMark } from "@/shared/ui/Logo";
import { ConfirmHost, ToastHost } from "./hosts";
import { isEditorOpen, useOverlay } from "./overlays";

let sessionBootstrapStarted = false;

/** Same order as pennywise-mobile's root layout: persisted auth, then the token, then restore. */
function useSessionBootstrap() {
  useEffect(() => {
    if (sessionBootstrapStarted) return;
    sessionBootstrapStarted = true;
    void wakeServer();
    void purgeLegacyTransactionCache();
    void (async () => {
      try {
        await Promise.resolve(useAuthStore.persist.rehydrate());
        await Promise.all([useAuthStore.getState().hydrateAccessToken(), useHomeSnapshotStore.persist.rehydrate()]);
        useAuthStore.getState().restoreSession();
      } catch {
        await useAuthStore.getState().logout();
      }
    })();
  }, []);
}

/** Loads (or seeds) cash books once signed in, but only after the backend is awake. */
function useDataBootstrap() {
  useLayoutEffect(() => installBookCoordinator(), []);
  useLayoutEffect(() => setBookNavigation(isEditorOpen, () => useOverlay.getState().close()), []);
  const userId = useAuthStore((s) => s.user?.id);
  const userCurrency = useAuthStore((s) => s.user?.defaultCurrencyCode);
  const sessionStatus = useAuthStore((s) => s.sessionStatus);
  const onboardingCompleted = useAuthStore((s) => s.onboardingCompleted);
  const serverReady = useServerStatus((s) => s.status === "ready");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") void queryClient.cancelQueries().then(() => queryClient.clear());
  }, [sessionStatus]);

  useEffect(() => {
    if (!serverReady || sessionStatus !== "authenticated" || !userId) return;
    const books = useBooksStore.getState();
    if (onboardingCompleted) {
      books.ensureBook({ name: "Personal", currencyCode: userCurrency ?? "USD", openingBalanceMinor: 0 }).catch(() => {});
    } else {
      books.loadBooks().catch(() => {});
    }
  }, [serverReady, onboardingCompleted, sessionStatus, userId, userCurrency]);
}

export function Splash() {
  return (
    <div className="grid min-h-[100dvh] place-items-center" aria-busy="true" aria-label="Loading PennyWise">
      <LogoMark className="size-14 animate-pulse" />
    </div>
  );
}

export function RootLayout() {
  useApplyAppearance();
  useSessionBootstrap();
  useDataBootstrap();
  const status = useAuthStore((s) => s.sessionStatus);
  return (
    <>
      {status === "resolving" ? <Splash /> : <Outlet />}
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
