import { useEffect } from "react";
import { useNavigate } from "react-router";
import { NAV } from "./nav";
import { useOverlay } from "./overlays";

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["N"], label: "New transaction" },
  { keys: ["/"], label: "Search activity" },
  ...NAV.map((n) => ({ keys: ["G", n.key.toUpperCase()], label: `Go to ${n.label}` })),
];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Global keyboard layer: Cmd/Ctrl+K, N, /, and two-key `g` navigation. Ignored while typing or in a dialog. */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const overlay = useOverlay.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (overlay.open && overlay.overlay?.kind === "palette") overlay.close();
        else overlay.show({ kind: "palette" });
        return;
      }
      if (overlay.open || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (gAt && Date.now() - gAt < 900) {
        gAt = 0;
        const item = NAV.find((n) => n.key === e.key.toLowerCase());
        if (item) navigate(item.to);
        return;
      }
      if (e.key === "g") gAt = Date.now();
      else if (e.key === "n") {
        e.preventDefault();
        overlay.show({ kind: "add-transaction" });
      } else if (e.key === "/") {
        e.preventDefault();
        navigate("/activity?search=1");
      } else if (e.key === "?") overlay.show({ kind: "palette" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
