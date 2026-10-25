// localStorage-backed stand-in for @react-native-async-storage/async-storage (aliased in vite.config.ts),
// so the stores copied from pennywise-mobile run unchanged. Falls back to memory where there is no DOM (tests).
const memory = new Map<string, string>();
const store: Pick<Storage, "getItem" | "setItem" | "removeItem"> =
  typeof localStorage !== "undefined"
    ? localStorage
    : {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      };

const AsyncStorage = {
  getItem: async (key: string) => store.getItem(key),
  setItem: async (key: string, value: string) => store.setItem(key, value),
  removeItem: async (key: string) => store.removeItem(key),
  multiRemove: async (keys: string[]) => keys.forEach((k) => store.removeItem(k)),
};

export default AsyncStorage;
