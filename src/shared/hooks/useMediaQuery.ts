import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Tailwind `lg` (1024px): sidebar layout, split views, hover affordances. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
/** Tailwind `md` (768px): dialogs instead of bottom sheets. */
export const useIsWide = () => useMediaQuery("(min-width: 768px)");
