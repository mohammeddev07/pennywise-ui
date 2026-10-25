import { motion, useReducedMotion } from "motion/react";
import { Suspense } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store";
import { BookSheets } from "@/features/books/ui/BookSheets";
import { BookSwitcher } from "@/features/books/ui/BookSwitcher";
import { useSettingsStore } from "@/features/settings/store";
import { Icon } from "@/shared/ui/Icon";
import { Logo } from "@/shared/ui/Logo";
import { Skeleton } from "@/shared/ui/states";
import { CommandPalette } from "./CommandPalette";
import { NAV, isActive } from "./nav";
import { OverlayHost } from "./OverlayHost";
import { useOverlay } from "./overlays";
import { useGlobalShortcuts } from "./shortcuts";
import { ServerStatusPill } from "./WakeGate";

/** Monogram avatar tinted from the device-local seed (same seed mobile shuffles on tap). */
export function Avatar({ size = 36 }: { size?: number }) {
  const email = useAuthStore((s) => s.user?.email ?? "");
  const name = useSettingsStore((s) => s.displayName) || email.split("@")[0] || "You";
  const seed = useSettingsStore((s) => s.avatarSeed);
  const hue = seed % 360;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 48) % 360} 70% 36%))`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  const show = useOverlay((s) => s.show);
  const email = useAuthStore((s) => s.user?.email);
  const displayName = useSettingsStore((s) => s.displayName);
  return (
    <aside className="sticky top-0 z-[2] hidden h-[100dvh] flex-col gap-5 border-r border-border px-4 py-5 lg:flex">
      <Link to="/" className="rounded-xl px-2 py-1" aria-label="PennyWise home">
        <Logo />
      </Link>
      <BookSwitcher variant="row" />
      <Button
        onClick={() => show({ kind: "add-transaction" })}
        className="glow h-11 justify-start gap-2 rounded-full px-4 font-semibold active:scale-[0.98]"
      >
        <Icon name="add" size={18} weight="bold" /> New transaction
        <Kbd className="ml-auto bg-primary-foreground/15 text-primary-foreground">N</Kbd>
      </Button>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = isActive(n.to, pathname);
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  className="surface absolute inset-0 rounded-xl"
                />
              )}
              <Icon name={n.icon} size={19} weight={active ? "fill" : "regular"} className={cn("relative", active && "text-primary")} />
              <span className="relative">{n.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <ServerStatusPill className="self-start" />
        <button
          onClick={() => show({ kind: "palette" })}
          className="flex h-10 w-full items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Icon name="search" size={16} /> Search or jump to
          <Kbd className="ml-auto">{"⌘"}K</Kbd>
        </button>
        <Link to="/settings" className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface-2">
          <Avatar size={34} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{displayName || email?.split("@")[0]}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        </Link>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const show = useOverlay((s) => s.show);
  return (
    <header className="glass sticky top-0 z-[30] flex items-center gap-2 border-x-0 border-t-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden">
      <BookSwitcher />
      <ServerStatusPill className="ml-auto" />
      <button
        onClick={() => show({ kind: "palette" })}
        aria-label="Search and commands"
        className={cn("grid size-10 place-items-center rounded-full hover:bg-surface-2", "ml-auto")}
      >
        <Icon name="search" />
      </button>
      <Link to="/settings" aria-label="Profile">
        <Avatar size={34} />
      </Link>
    </header>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const show = useOverlay((s) => s.show);
  const items = NAV.filter((n) => n.mobile);
  const slot = (n: (typeof items)[number]) => {
    const active = isActive(n.to, pathname);
    return (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.to === "/"}
        className={cn(
          "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon name={n.icon} size={22} weight={active ? "fill" : "regular"} className={cn(active && "text-primary")} />
        {n.label}
        {active && <motion.span layoutId="bottom-active" className="absolute -bottom-0.5 h-1 w-5 rounded-full bg-primary" />}
      </NavLink>
    );
  };
  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[40] flex h-16 items-center rounded-full px-2 lg:hidden"
    >
      {items.slice(0, 2).map(slot)}
      <div className="flex flex-1 justify-center">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => show({ kind: "add-transaction" })}
          aria-label="New transaction"
          className="glow -mt-7 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          <Icon name="add" size={26} weight="bold" />
        </motion.button>
      </div>
      {items.slice(2).map(slot)}
    </nav>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export function AppShell() {
  useGlobalShortcuts();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const section = pathname.split("/")[1] || "home";
  return (
    <div className="grain min-h-[100dvh] lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <Sidebar />
      <div className="relative z-[1] min-w-0">
        <MobileHeader />
        <motion.main
          key={section}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12"
        >
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </motion.main>
      </div>
      <BottomNav />
      <OverlayHost />
      <CommandPalette />
      <BookSheets />
    </div>
  );
}
