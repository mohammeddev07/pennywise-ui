import { beginBookOperation, endBookOperation } from "@/features/books/operations";
import axios, { type AxiosError } from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL, USE_MOCK_API } from "./config";
import { wakeServer } from "./wake";

declare module "axios" {
  export interface AxiosRequestConfig {
    _skipColdStartTimeout?: boolean;
    _bookOperation?: number;
    _overloadRetries?: number;
  }
}

export { BASE_URL, USE_MOCK_API };
export const ACCESS_TOKEN_KEY = "access_token";

// A cold backend may need the entire startup wait budget. Keep one request alive
// instead of replaying timed-out reads, logins, or writes while it may still run.
const WARM_TIMEOUT_MS = 15_000;
const COLD_START_TIMEOUT_MS = 60_000;

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: WARM_TIMEOUT_MS,
  // The constant folds at build time, so a production bundle drops the in-memory backend entirely.
  ...(USE_MOCK_API
    ? { adapter: (config) => import("./mockAdapter").then((m) => m.mockAdapter(config)) }
    : {}),
});

// App launch and every return to the tab may hit a backend that just spun down - the first request after
// launch/resume plus every request in the next few seconds gets the longer timeout.
const COLD_START_WINDOW_MS = 3_000;
let coldStartCandidate = true;
let coldStartUntil = Date.now() + COLD_START_WINDOW_MS;
export function openColdStartWindow() {
  coldStartUntil = Date.now() + COLD_START_WINDOW_MS;
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      coldStartCandidate = true;
      openColdStartWindow();
    }
  });
}

// The backend admits at most 3 in-flight /v1 requests (503 OVERLOADED beyond that), so queue the rest here.
const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const waiting: Array<() => void> = [];
function acquireSlot() {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}
function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

let unauthorizedCleanup: Promise<void> | null = null;

function isPublicAuthRequest(url?: string) {
  return /\/v1\/auth\/(?:login|signup|google)\/?(?:[?#]|$)/.test(url ?? "");
}

// Route guards react to the session store, so signing out is enough to land on the login screen.
async function handleUnauthorized() {
  if (unauthorizedCleanup) return unauthorizedCleanup;
  unauthorizedCleanup = import("@/features/auth/store")
    .then(async ({ useAuthStore }) => {
      const auth = useAuthStore.getState();
      if (auth.sessionStatus !== "unauthenticated") await auth.logout();
    })
    .finally(() => {
      unauthorizedCleanup = null;
    });
  return unauthorizedCleanup;
}

apiClient.interceptors.request.use(async (config) => {
  const bookWrite =
    /\/v1\/books(?:\/|$)/.test(config.url ?? "") &&
    !["get", "head"].includes(config.method ?? "get") &&
    !/\/(search|analyze)$/.test(config.url ?? "");
  if (bookWrite && config._bookOperation === undefined) config._bookOperation = beginBookOperation();
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (coldStartCandidate || Date.now() < coldStartUntil) {
    coldStartCandidate = false;
    if (!config._skipColdStartTimeout && config.timeout === WARM_TIMEOUT_MS) config.timeout = COLD_START_TIMEOUT_MS;
  }
  await acquireSlot();
  return config;
});

export function isTimeout(err: unknown) {
  return axios.isAxiosError(err) && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT");
}

// A timeout/network failure means "don't know," not "logged out" - only a real
// 401/403 from the server means the token is actually invalid.
export function isAuthError(err: unknown) {
  return axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403);
}

function errorCode(err: AxiosError) {
  const body = err.response?.data as { error?: { code?: string } } | undefined;
  return typeof body?.error === "object" ? body.error.code : undefined;
}

/**
 * True when the failure came from the hosting layer rather than the app: no response at all (Render's proxy
 * drops CORS headers while the instance boots, which the browser reports as a network error) or a gateway
 * 502/503/504 without the backend's JSON error envelope.
 */
export function isWakeError(err: unknown) {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return err.code !== "ERR_CANCELED";
  return [502, 503, 504].includes(err.response.status) && errorCode(err) === undefined;
}

apiClient.interceptors.response.use(
  (res) => {
    releaseSlot();
    endBookOperation(res.config._bookOperation);
    return res;
  },
  async (err: AxiosError) => {
    if (err.config) releaseSlot();
    const config = err.config;

    // OVERLOADED / DATABASE_UNAVAILABLE are refused before the operation runs, so any method may retry.
    const code = errorCode(err);
    if (config && (code === "OVERLOADED" || code === "DATABASE_UNAVAILABLE") && (config._overloadRetries ?? 0) < 3) {
      config._overloadRetries = (config._overloadRetries ?? 0) + 1;
      const seconds = Number(err.response?.headers["retry-after"]) || 1;
      await new Promise((r) => setTimeout(r, seconds * 1000));
      return apiClient.request(config);
    }

    if (isWakeError(err)) void wakeServer();
    if (err.response?.status === 401 && !isPublicAuthRequest(config?.url)) await handleUnauthorized().catch(() => {});

    endBookOperation(config?._bookOperation);
    return Promise.reject(err);
  },
);
