/**
 * Magasin local des dossiers cliniques v2 pour UN compte (« portée » = uid, `local` ou `anon`).
 * Chaque document est une entrée persistée sous sa propre clé :
 *   mobilis.v2.<portée>.<collection>.<id>                 documents du compte (modifiables)
 *   mobilis.v2.<portée>.~<collection>.<propriétaire>.<id> documents PARTAGÉS par un autre compte (lecture seule)
 *   mobilis.v2.<portée>._meta                             état de synchronisation
 * L'entrée garde l'état de synchronisation (modifié localement, supprimé en attente, déjà envoyé, partage).
 * Format de stockage versionné (`f`) : une valeur sans `f` (document nu, format 0) est reprise comme document modifié.
 */
import type { CollectionName, Patient } from '../../../core/types/clinical.ts';
import { RECORD_COLLECTIONS } from './record-schemas.ts';
import { RECORDS_KEY_PREFIX, type RecordsKv } from './records-kv.ts';

export const STORE_FORMAT = 1;

export interface StoredEntry {
  readonly f: typeof STORE_FORMAT;
  readonly col: CollectionName;
  readonly doc: Readonly<Record<string, unknown>>;
  /** Modifié sur l'appareil, pas encore envoyé. */
  readonly dirty?: boolean;
  /** Supprimé sur l'appareil, suppression en ligne en attente (masqué des lectures). */
  readonly deleted?: boolean;
  /** Déjà présent en ligne au moins une fois (sert à reconnaître une suppression faite ailleurs). */
  readonly synced?: boolean;
  /** Destinataires du partage tel qu'envoyé en ligne (uid du clinicien). */
  readonly sharedWith?: readonly string[];
  /** Document d'un autre compte, partagé avec celui-ci (lecture seule). */
  readonly foreign?: boolean;
}

export interface StoreMeta {
  readonly f: typeof STORE_FORMAT;
  readonly lastSync?: string;
  /** Dossiers créés automatiquement puis supprimés par le clinicien : uid du patient → date de suppression. */
  readonly dismissed?: Readonly<Record<string, string>>;
  /** Fiches « patients » partagées avec ce compte (lecture seule), utilisées pour créer les dossiers. */
  readonly sharedPatients?: readonly Patient[];
  /** Dernier destinataire connu du partage (uid du clinicien + code du programme) ; `null` = aucun. */
  readonly shareTarget?: { readonly uid: string; readonly via: string } | null;
}

export interface LocalRecordsStore {
  readonly scope: string;
  ready(): Promise<void>;
  own(col: CollectionName): StoredEntry[];
  getOwn(col: CollectionName, id: string): StoredEntry | undefined;
  putOwn(entry: StoredEntry): Promise<void>;
  dropOwn(col: CollectionName, id: string): Promise<void>;
  foreign(col: CollectionName): StoredEntry[];
  replaceForeign(col: CollectionName, entries: readonly StoredEntry[]): Promise<void>;
  meta(): StoreMeta;
  setMeta(patch: Partial<Omit<StoreMeta, 'f'>>): Promise<void>;
  /** Efface toutes les clés de cette portée (appareil seulement). */
  eraseAll(): Promise<void>;
}

const isCol = (s: unknown): s is CollectionName => (RECORD_COLLECTIONS as readonly unknown[]).includes(s);

/** Reprise d'une valeur stockée, quel que soit son format ; `null` si illisible. */
export function parseStoredEntry(key: string, raw: string, scopePrefix: string): StoredEntry | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o['f'] === STORE_FORMAT && isCol(o['col']) && o['doc'] && typeof o['doc'] === 'object') return o as never;
  // Format 0 : document nu sous mobilis.v2.<portée>.<collection>.<id>
  if (o['f'] === undefined && typeof o['id'] === 'string') {
    const col = key.slice(scopePrefix.length).split('.')[0];
    if (isCol(col)) return { f: STORE_FORMAT, col, doc: o, dirty: true };
  }
  return null;
}

export function createLocalRecordsStore(kv: RecordsKv, scope: string): LocalRecordsStore {
  const prefix = `${RECORDS_KEY_PREFIX}${scope}.`;
  const metaKey = `${prefix}_meta`;
  const ownKey = (col: CollectionName, id: string): string => `${prefix}${col}.${id}`;
  const foreignKey = (col: CollectionName, owner: string, id: string): string => `${prefix}~${col}.${owner}.${id}`;
  const own = new Map<CollectionName, Map<string, StoredEntry>>();
  const foreign = new Map<CollectionName, Map<string, StoredEntry>>();
  let meta: StoreMeta = { f: STORE_FORMAT };
  const bucket = (m: Map<CollectionName, Map<string, StoredEntry>>, c: CollectionName): Map<string, StoredEntry> => {
    let b = m.get(c);
    if (!b) m.set(c, (b = new Map()));
    return b;
  };
  const fKey = (e: StoredEntry): string => `${String(e.doc['ownerUid'])}.${String(e.doc['id'])}`;

  let hydrated: Promise<void> | null = null;
  const ready = (): Promise<void> =>
    (hydrated ??= (async () => {
      const rows = await kv.entries(prefix);
      const rewrites: Promise<void>[] = [];
      for (const [k, raw] of rows) {
        if (k === metaKey) {
          try {
            const m = JSON.parse(raw) as StoreMeta;
            if (m && typeof m === 'object') meta = { ...m, f: STORE_FORMAT };
          } catch {
            /* état illisible : repart de zéro (les documents restent) */
          }
          continue;
        }
        const e = parseStoredEntry(k, raw, prefix);
        if (!e) continue;
        if (e.foreign) bucket(foreign, e.col).set(fKey(e), e);
        else {
          bucket(own, e.col).set(String(e.doc['id']), e);
          if (!raw.startsWith('{"f"')) rewrites.push(kv.set(k, JSON.stringify(e))); // migration du format
        }
      }
      await Promise.all(rewrites);
    })().catch((e: unknown) => {
      hydrated = null;
      throw e;
    }));

  return {
    scope,
    ready,
    own: (col) => [...bucket(own, col).values()],
    getOwn: (col, id) => bucket(own, col).get(id),
    async putOwn(entry) {
      const id = String(entry.doc['id']);
      bucket(own, entry.col).set(id, entry);
      await kv.set(ownKey(entry.col, id), JSON.stringify(entry));
    },
    async dropOwn(col, id) {
      bucket(own, col).delete(id);
      await kv.remove(ownKey(col, id));
    },
    foreign: (col) => [...bucket(foreign, col).values()],
    async replaceForeign(col, entries) {
      const b = bucket(foreign, col);
      const next = new Map(entries.map((e) => [fKey(e), { ...e, foreign: true, col } as StoredEntry]));
      const gone = [...b.values()].filter((e) => !next.has(fKey(e)));
      b.clear();
      for (const [k, e] of next) b.set(k, e);
      await Promise.all([
        ...gone.map((e) => kv.remove(foreignKey(col, String(e.doc['ownerUid']), String(e.doc['id'])))),
        ...[...next.values()].map((e) =>
          kv.set(foreignKey(col, String(e.doc['ownerUid']), String(e.doc['id'])), JSON.stringify(e)),
        ),
      ]);
    },
    meta: () => meta,
    async setMeta(patch) {
      meta = { ...meta, ...patch, f: STORE_FORMAT };
      await kv.set(metaKey, JSON.stringify(meta));
    },
    async eraseAll() {
      const rows = await kv.entries(prefix);
      await Promise.all(rows.map(([k]) => kv.remove(k)));
      own.clear();
      foreign.clear();
      meta = { f: STORE_FORMAT };
    },
  };
}
