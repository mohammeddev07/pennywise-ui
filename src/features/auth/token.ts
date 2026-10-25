// Offline expiry check only; the server stays the authority on validity.
export function isTokenExpired(token: string, skewSeconds = 30, nowMs = Date.now()): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return typeof exp !== "number" || exp * 1000 <= nowMs + skewSeconds * 1000;
  } catch {
    return true;
  }
}
