// Web stand-in for expo-secure-store (aliased in vite.config.ts). The backend issues a bearer token only
// (no httpOnly cookie option), so the browser keeps it in localStorage. Any XSS can read it; keep the
// app free of untrusted HTML and third-party scripts beyond Google sign-in.
import AsyncStorage from "./asyncStorage";

export const getItemAsync = AsyncStorage.getItem;
export const setItemAsync = AsyncStorage.setItem;
export const deleteItemAsync = AsyncStorage.removeItem;
