/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** Backend base URL including `/api`, e.g. https://pennywise-7v9g.onrender.com/api */
  readonly VITE_API_BASE_URL?: string;
  /** "true" runs the app against the in-memory mock backend (no server needed). */
  readonly VITE_MOCK_API?: string;
  /** Google OAuth *web* client ID; also listed in the backend's GOOGLE_CLIENT_IDS. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

/** Mobile code checks React Native's __DEV__; defined from import.meta.env.DEV in vite.config.ts. */
declare const __DEV__: boolean;
