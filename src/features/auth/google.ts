import { getAuthErrorMessage } from "@/shared/api/errors";

/**
 * Google Identity Services. The ID token's audience is this web client ID, which must be listed in the
 * backend's GOOGLE_CLIENT_IDS, and the site origin must be an Authorized JavaScript origin of the client.
 */
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
export const googleSignInAvailable = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId ?? "");

export function getGoogleSignInErrorMessage(error: unknown) {
  return getAuthErrorMessage(error);
}

type GoogleId = {
  initialize(options: { client_id: string; callback: (res: { credential?: string }) => void; ux_mode: "popup" }): void;
  renderButton(el: HTMLElement, options: Record<string, string | number>): void;
  disableAutoSelect(): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gsi: Promise<GoogleId> | null = null;
let onCredential: ((idToken: string) => void) | null = null;

function loadGsi() {
  gsi ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts.id;
      if (!id) return reject(new Error("Google sign-in failed to load."));
      id.initialize({ client_id: clientId!, ux_mode: "popup", callback: (res) => res.credential && onCredential?.(res.credential) });
      resolve(id);
    };
    script.onerror = () => {
      gsi = null;
      reject(new Error("Couldn't reach Google. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return gsi;
}

/** Renders Google's own button into `el`; the latest caller receives the ID token. */
export async function renderGoogleButton(el: HTMLElement, onToken: (idToken: string) => void, dark: boolean) {
  const id = await loadGsi();
  onCredential = onToken;
  id.renderButton(el, {
    theme: dark ? "filled_black" : "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: Math.min(400, Math.max(200, el.clientWidth)),
  });
}

/** Forget the picked account so the next sign-in asks again. Best effort. */
export async function signOutOfGoogle() {
  window.google?.accounts.id.disableAutoSelect();
}
