import { onlineManager } from "@tanstack/react-query";
import axios from "axios";
import { create } from "zustand";
import { BASE_URL, USE_MOCK_API } from "./config";

/**
 * Render's free tier spins the backend down after ~15 min idle and needs 30-60 s to boot. Instead of firing
 * every query into a sleeping server, the app pings the public health endpoint and keeps TanStack Query
 * "offline" until it answers: queries pause (cached data stays on screen) and resume on their own.
 */
export type ServerStatus = "checking" | "waking" | "ready" | "unreachable";

export const useServerStatus = create<{ status: ServerStatus; attempt: number; startedAt: number }>(() => ({
  status: "checking",
  attempt: 0,
  startedAt: Date.now(),
}));

const HEALTH_URL = `${BASE_URL}/actuator/health`;
const GIVE_UP_AFTER_MS = 120_000;

/** Delay before retry `n` (0-based): 1, 2, 4, 8, then 10 s, with +-20% jitter. */
export function backoffDelay(n: number, random = Math.random) {
  return Math.round(Math.min(10_000, 1000 * 2 ** n) * (0.8 + random() * 0.4));
}

async function isHealthy() {
  try {
    const res = await axios.get(HEALTH_URL, { timeout: 20_000 });
    return res.data?.status === "UP";
  } catch {
    return false;
  }
}

let running: Promise<void> | null = null;

export function wakeServer(): Promise<void> {
  if (USE_MOCK_API) {
    useServerStatus.setState({ status: "ready" });
    return Promise.resolve();
  }
  if (running) return running;
  const startedAt = Date.now();
  useServerStatus.setState({ status: "checking", attempt: 0, startedAt });
  onlineManager.setOnline(false);
  running = (async () => {
    for (let n = 0; ; n++) {
      if (await isHealthy()) {
        useServerStatus.setState({ status: "ready" });
        onlineManager.setOnline(true);
        return;
      }
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        useServerStatus.setState({ status: "unreachable" });
        return;
      }
      useServerStatus.setState({ status: "waking", attempt: n + 1 });
      await new Promise((r) => setTimeout(r, backoffDelay(n)));
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// TanStack Query normally mirrors navigator.onLine; here "online" also requires an awake backend.
onlineManager.setEventListener((setOnline) => {
  if (typeof window === "undefined") return;
  const offline = () => setOnline(false);
  const online = () => void wakeServer();
  window.addEventListener("offline", offline);
  window.addEventListener("online", online);
  return () => {
    window.removeEventListener("offline", offline);
    window.removeEventListener("online", online);
  };
});
