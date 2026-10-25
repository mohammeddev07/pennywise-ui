const t0 = Date.now();

/** Dev-only launch timing: logs ms since this module loaded. No-op in release builds. */
export function markLaunch(label: string): void {
  if (__DEV__) console.log(`[launch] +${Date.now() - t0}ms ${label}`);
}

markLaunch("app start");
