import type { ReactNode } from "react";
import { Link } from "react-router";
import { ServerStatusPill } from "@/app/WakeGate";
import { Logo } from "@/shared/ui/Logo";

/** Chrome for the signed-out screens and onboarding: wordmark left, live server status right. */
export function AuthLayout({ children, homeLink = true }: { children: ReactNode; homeLink?: boolean }) {
  return (
    <div className="grain relative flex min-h-[100dvh] flex-col">
      <header className="relative z-[1] mx-auto flex h-16 w-full max-w-6xl shrink-0 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        {homeLink ? (
          <Link to="/welcome" aria-label="PennyWise home" className="-mx-1 rounded-full px-1 py-1">
            <Logo />
          </Link>
        ) : (
          <Logo />
        )}
        <ServerStatusPill />
      </header>
      <main className="relative z-[1] flex flex-1 flex-col">{children}</main>
    </div>
  );
}
