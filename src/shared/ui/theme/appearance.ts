import { useEffect, useSyncExternalStore } from "react";
import { useSettingsStore } from "@/features/settings/store";

export type AppearancePreference = "system" | "light" | "dark";

export function resolveAppearance(preference: AppearancePreference, device: string | null | undefined): "light" | "dark" {
  return preference === "system" ? (device === "dark" ? "dark" : "light") : preference;
}

const query = typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");
const deviceScheme = () => (query?.matches ? "dark" : "light");
function subscribe(onChange: () => void) {
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

export function getResolvedAppearance() {
  return resolveAppearance(useSettingsStore.getState().appearance, deviceScheme());
}

export function useResolvedAppearance() {
  const preference = useSettingsStore((s) => s.appearance);
  return resolveAppearance(preference, useSyncExternalStore(subscribe, deviceScheme));
}

/** Mounted once at the root: mirrors the resolved theme onto <html> for Tailwind's `dark:` variant. */
export function useApplyAppearance() {
  const scheme = useResolvedAppearance();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", scheme === "dark");
    root.style.colorScheme = scheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", scheme === "dark" ? "#0B0D0F" : "#F4F6F5");
  }, [scheme]);
  return scheme;
}
