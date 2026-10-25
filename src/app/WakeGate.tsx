import { useIsRestoring } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { queryClient } from "@/shared/api/queryClient";
import { useServerStatus, wakeServer } from "@/shared/api/wake";
import { LogoMark } from "@/shared/ui/Logo";

function useElapsedSeconds(since: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return Math.max(0, Math.round((now - since) / 1000));
}

const COPY = [
  { after: 0, text: "Connecting to PennyWise" },
  { after: 4, text: "Waking up the server" },
  { after: 20, text: "Still starting. Free hosting naps when idle" },
  { after: 45, text: "Almost there" },
];

/**
 * Full-screen, branded wait for a cold backend, shown only when there is nothing cached to paint.
 * With cached data the shell renders immediately and <ServerStatusPill /> carries the same state.
 */
export function WakeScreen() {
  const { status, attempt, startedAt } = useServerStatus();
  const reduce = useReducedMotion();
  const elapsed = useElapsedSeconds(startedAt, status !== "ready");
  const line = [...COPY].reverse().find((c) => elapsed >= c.after)!.text;
  const failed = status === "unreachable";

  return (
    <div className="grain fixed inset-0 z-[80] grid place-items-center bg-background px-6">
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <div className="relative mb-10 grid size-28 place-items-center">
          {!reduce &&
            !failed &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-full border border-primary/40"
                initial={{ scale: 0.6, opacity: 0.8 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
              />
            ))}
          <motion.div
            animate={reduce || failed ? undefined : { y: [0, -4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className={cn("glow rounded-[14px]", failed && "opacity-60 grayscale")}
          >
            <LogoMark className="size-16" />
          </motion.div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight" aria-live="polite">
          {failed ? "Couldn't reach the server" : line}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {failed
            ? "Check your connection, then try again. Your data is safe on the server."
            : "The first visit after a quiet spell can take up to a minute."}
        </p>

        {!failed && (
          <div className="mt-8 w-56">
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: "4%" }}
                animate={{ width: `${Math.min(92, 4 + elapsed * 1.6)}%` }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.9 }}
              />
            </div>
            <p className="money mt-3 text-xs text-subtle">
              {elapsed}s{attempt > 1 ? `, attempt ${attempt}` : ""}
            </p>
          </div>
        )}
        {failed && (
          <Button className="mt-8 rounded-full px-6" onClick={() => void wakeServer()}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

/** Small live status in the chrome while the backend wakes behind cached data. Hidden when ready. */
export function ServerStatusPill({ className }: { className?: string }) {
  const { status, startedAt } = useServerStatus();
  const elapsed = useElapsedSeconds(startedAt, status !== "ready");
  if (status === "ready" || (status === "checking" && elapsed < 2)) return null;
  const failed = status === "unreachable";
  return (
    <button
      onClick={() => failed && void wakeServer()}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
        failed ? "bg-expense-soft text-expense" : "bg-warning-soft text-warning",
        className,
      )}
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {!failed && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {failed ? "Offline. Tap to retry" : `Waking server ${elapsed}s`}
    </button>
  );
}

/** True while there is no persisted data to paint, i.e. the full-screen wait is warranted. */
export function useNeedsWakeScreen() {
  const status = useServerStatus((s) => s.status);
  const restoring = useIsRestoring();
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDelayed(true), 700);
    return () => clearTimeout(t);
  }, []);
  const empty = queryClient.getQueryCache().getAll().every((q) => q.state.data === undefined);
  return !restoring && status !== "ready" && empty && delayed;
}
