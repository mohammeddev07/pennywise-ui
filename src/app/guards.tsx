import { useEffect, useRef } from "react";
import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "@/features/auth/store";
import { useBooksStore } from "@/features/books/store";
import { Splash } from "./RootLayout";
import { WakeScreen, useNeedsWakeScreen } from "./WakeGate";

/** Signed-out screens. A signed-in visitor goes to the app (which routes on to onboarding if needed). */
export function PublicOnly() {
  const status = useAuthStore((s) => s.sessionStatus);
  return status === "authenticated" ? <Navigate to="/" replace /> : <Outlet />;
}

/** Signed in, but onboarding not finished. Waits until the server says whether books already exist. */
export function OnboardingGate() {
  const status = useAuthStore((s) => s.sessionStatus);
  const completed = useAuthStore((s) => s.onboardingCompleted);
  const ready = useBooksStore((s) => s.ready);
  const hasBooks = useBooksStore((s) => s.books.length > 0);
  const needsWake = useNeedsWakeScreen();
  // Once the onboarding form is showing, it owns completion: its own ensureBook adds the first book
  // before updateMe runs, and auto-completing here would unmount it mid-sequence and hide errors.
  const formShown = useRef(false);

  useEffect(() => {
    if (ready && hasBooks && !completed && !formShown.current) useAuthStore.getState().completeOnboarding();
  }, [ready, hasBooks, completed]);

  if (status !== "authenticated") return <Navigate to="/welcome" replace />;
  if (completed) return <Navigate to="/" replace />;
  if (!ready && !formShown.current) return needsWake ? <WakeScreen /> : <Splash />;
  if (hasBooks && !formShown.current) return <Splash />;
  formShown.current = true;
  return <Outlet />;
}

/** The signed-in app. Paints from persisted books/queries immediately; the backend may still be waking. */
export function AppGate({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.sessionStatus);
  const completed = useAuthStore((s) => s.onboardingCompleted);
  const needsWake = useNeedsWakeScreen();
  if (status !== "authenticated") return <Navigate to="/welcome" replace />;
  if (!completed) return <Navigate to="/onboarding" replace />;
  return (
    <>
      {children}
      {needsWake && <WakeScreen />}
    </>
  );
}
