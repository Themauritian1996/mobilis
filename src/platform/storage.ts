import type { KeyValueStore } from './ports.ts';

/** Stockage local en mémoire (tests, navigation privée). */
export function createMemoryKeyValueStore(seed: Readonly<Record<string, string>> = {}): KeyValueStore {
  const m = new Map(Object.entries(seed));
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

/** localStorage protégé : toute exception (navigation privée, quota, stockage bloqué) est absorbée. */
export function createBrowserKeyValueStore(storage: Storage | undefined = globalThis.localStorage): KeyValueStore {
  return {
    get(k) {
      try {
        return storage?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        storage?.setItem(k, v);
      } catch {
        /* stockage indisponible : ignoré */
      }
    },
    remove(k) {
      try {
        storage?.removeItem(k);
      } catch {
        /* ignoré */
      }
    },
  };
}
