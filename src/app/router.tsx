import type { ComponentType } from "react";
import { createBrowserRouter, Navigate, useRouteError } from "react-router";
import { ErrorState } from "@/shared/ui/states";
import { AppShell } from "./AppShell";
import { AppGate, OnboardingGate, PublicOnly } from "./guards";
import { RootLayout, Splash } from "./RootLayout";

/** Route-level code splitting: each page module is fetched on first visit. */
const page = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) => ({
  lazy: async () => ({ Component: (await load())[name] as ComponentType }),
});

function RouteError() {
  const error = useRouteError();
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <ErrorState error={error} title="This page hit a snag" onRetry={() => window.location.reload()} />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    HydrateFallback: Splash,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: "/welcome", ...page(() => import("@/features/auth/WelcomePage"), "WelcomePage") },
          { path: "/login", ...page(() => import("@/features/auth/LoginPage"), "LoginPage") },
          { path: "/signup", ...page(() => import("@/features/auth/SignupPage"), "SignupPage") },
        ],
      },
      {
        element: <OnboardingGate />,
        children: [{ path: "/onboarding", ...page(() => import("@/features/onboarding/OnboardingPage"), "OnboardingPage") }],
      },
      {
        element: (
          <AppGate>
            <AppShell />
          </AppGate>
        ),
        errorElement: <RouteError />,
        children: [
          { index: true, ...page(() => import("@/features/home/HomePage"), "HomePage") },
          { path: "/activity", ...page(() => import("@/features/transactions/ActivityPage"), "ActivityPage") },
          { path: "/activity/:txId", ...page(() => import("@/features/transactions/ActivityPage"), "ActivityPage") },
          { path: "/insights", ...page(() => import("@/features/insights/InsightsPage"), "InsightsPage") },
          { path: "/budgets", ...page(() => import("@/features/budgets/BudgetsPage"), "BudgetsPage") },
          { path: "/settings", ...page(() => import("@/features/settings/SettingsPage"), "SettingsPage") },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
