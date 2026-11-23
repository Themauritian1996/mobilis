/**
 * Stockage clé → valeur ASYNCHRONE des dossiers cliniques v2 (clés `mobilis.v2.*`).
 *  - IndexedDB (base `mobilis-v2`, magasin `kv`) quand il est disponible : pas de limite de ~5 Mo, ce qui compte pour
 *    les évaluations de marche (courbes moyennes) ;
 *  - sinon localStorage (navigation privée, WebView ancienne) ;
 *  - mémoire pour les tests.
 * Aucune logique métier ici : `records-store.ts` décide du format des valeurs.
 */
import { AppError } from '../../../core/errors.ts';

export interface RecordsKv {
  /** Toutes les paires dont la clé commence par `prefix`. */
  entries(prefix: string): Promise<[string, string][]>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const RECORDS_KEY_PREFIX = 'mobilis.v2.';

export function createMemoryRecordsKv(seed: Readonly<Record<string, string>> = {}): RecordsKv & {
  dump(): Record<string, string>;
} {
  const m = new Map(Object.entries(seed));
  return {
    async entries(prefix) {
      return [...m.entries()].filter(([k]) => k.startsWith(prefix));
    },
    async set(k, v) {
      m.set(k, v);
    },
    async remove(k) {
      m.delete(k);
    },
    dump: () => Object.fromEntries(m),
  };
}

export function createLocalStorageRecordsKv(storage: Storage): RecordsKv {
  return {
    async entries(prefix) {
      const out: [string, string][] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(prefix)) out.push([k, storage.getItem(k) ?? '']);
      }
      return out;
    },
    async set(k, v) {
      try {
        storage.setItem(k, v);
      } catch (e) {
        throw new AppError('records_storage_full', 'Stockage local plein ou indisponible', { cause: e });
      }
    },
    async remove(k) {
      storage.removeItem(k);
    },
  };
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('IndexedDB'));
  });

export function createIndexedDbRecordsKv(idb: IDBFactory, dbName = 'mobilis-v2'): RecordsKv {
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (opened ??= new Promise<IDBDatabase>((res, rej) => {
      const r = idb.open(dbName, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error ?? new Error('IndexedDB'));
      r.onblocked = () => rej(new Error('IndexedDB bloqué'));
    }).catch((e: unknown) => {
      opened = null;
      throw e;
    }));
  const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> =>
    (await open()).transaction('kv', mode).objectStore('kv');
  return {
    async entries(prefix) {
      const s = await store('readonly');
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const [keys, values] = await Promise.all([req(s.getAllKeys(range)), req(s.getAll(range))]);
      return keys.map((k, i) => [String(k), String(values[i])]);
    },
    async set(k, v) {
      try {
        await req((await store('readwrite')).put(v, k));
      } catch (e) {
        throw new AppError('records_storage_full', 'Stockage local plein ou indisponible', { cause: e });
      }
    },
    async remove(k) {
      await req((await store('readwrite')).delete(k));
    },
  };
}

/**
 * Choix au démarrage : IndexedDB si utilisable, sinon localStorage, sinon mémoire. Si IndexedDB échoue à l'ouverture
 * (Firefox privé…), bascule une fois sur localStorage. Les données déjà écrites dans localStorage restent lues.
 */
export function createBrowserRecordsKv(
  g: { indexedDB?: IDBFactory; localStorage?: Storage } = globalThis as never,
): RecordsKv {
  let ls: RecordsKv;
  try {
    ls = g.localStorage ? createLocalStorageRecordsKv(g.localStorage) : createMemoryRecordsKv();
  } catch {
    ls = createMemoryRecordsKv();
  }
  let idb: RecordsKv | null;
  try {
    idb = g.indexedDB ? createIndexedDbRecordsKv(g.indexedDB) : null;
  } catch {
    idb = null;
  }
  if (!idb) return ls;
  let primary: RecordsKv = idb;
  const fallback = async <T>(fn: (kv: RecordsKv) => Promise<T>): Promise<T> => {
    try {
      return await fn(primary);
    } catch (e) {
      if (primary === ls || (e instanceof AppError && e.code === 'records_storage_full')) throw e;
      console.warn('IndexedDB indisponible, repli sur localStorage', e);
      primary = ls;
      return fn(primary);
    }
  };
  return {
    async entries(prefix) {
      // Lit aussi localStorage : un ancien repli peut y avoir laissé des documents.
      const a = await fallback((kv) => kv.entries(prefix));
      if (primary === ls) return a;
      const b = await ls.entries(prefix).catch(() => [] as [string, string][]);
      const seen = new Set(a.map(([k]) => k));
      return [...a, ...b.filter(([k]) => !seen.has(k))];
    },
    set: (k, v) => fallback((kv) => kv.set(k, v)),
    async remove(k) {
      await fallback((kv) => kv.remove(k));
      if (primary !== ls) await ls.remove(k).catch(() => undefined);
    },
  };
}
