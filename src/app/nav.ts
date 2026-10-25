import type { IconName } from "@/shared/ui/Icon";

/** Primary destinations. `key` is the second key of the `g <key>` shortcut. */
export const NAV: { to: string; label: string; icon: IconName; key: string; mobile: boolean }[] = [
  { to: "/", label: "Home", icon: "home-outline", key: "h", mobile: true },
  { to: "/activity", label: "Activity", icon: "receipt-outline", key: "a", mobile: true },
  { to: "/insights", label: "Insights", icon: "stats-chart-outline", key: "i", mobile: true },
  { to: "/budgets", label: "Budgets", icon: "grid-outline", key: "b", mobile: false },
  { to: "/settings", label: "Profile", icon: "person-outline", key: "p", mobile: true },
];

export const isActive = (to: string, pathname: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
