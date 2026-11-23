/**
 * Port « dossiers en ligne » utilisé par la synchronisation (implémenté par services/db/firebase/records-remote.ts).
 * Chemin Firestore : collection de premier niveau `<col>/<ownerUid>_<id>` (voir docs/adr/0009-dossier-patient.md).
 */
import type { CollectionName } from '../../../core/types/clinical.ts';

/** Document tel qu'envoyé en ligne : le document + l'enveloppe de partage. */
export type RemoteRecord = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly ownerUid: string;
  readonly sharedWith: readonly string[];
  readonly sharedVia: string | null;
};

export interface RecordsRemote {
  put(col: CollectionName, rec: RemoteRecord): Promise<void>;
  remove(col: CollectionName, ownerUid: string, id: string): Promise<void>;
  /** Documents dont `ownerUid` = uid. */
  listOwn(col: CollectionName, uid: string): Promise<RemoteRecord[]>;
  /** Documents d'autres comptes partagés avec uid (`sharedWith` contient uid). */
  listSharedWith(col: CollectionName, uid: string): Promise<RemoteRecord[]>;
}

export const remoteDocId = (ownerUid: string, id: string): string => `${ownerUid}_${id}`;

/**
 * Firestore refuse les tableaux directement imbriqués (ex. courbes `number[][]` d'un résultat de marche) et les
 * valeurs `undefined`. Encodage réversible : un tableau contenu dans un tableau devient `{ __arr: [...] }`.
 */
export function encodeForCloud(v: unknown, inArray = false): unknown {
  if (v === undefined) return null;
  if (Array.isArray(v)) {
    const a = v.map((x) => encodeForCloud(x === undefined ? null : x, true));
    return inArray ? { __arr: a } : a;
  }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = encodeForCloud(x);
    return o;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

export function decodeFromCloud(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeFromCloud);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === '__arr' && Array.isArray(o['__arr'])) return o['__arr'].map(decodeFromCloud);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = decodeFromCloud(x);
    return out;
  }
  return v;
}

/** Sépare l'enveloppe de partage du document. */
export function splitRemote(r: Readonly<Record<string, unknown>>): {
  doc: Record<string, unknown>;
  sharedWith: string[];
} {
  const { sharedWith, sharedVia, ...doc } = r;
  void sharedVia;
  return {
    doc,
    sharedWith: Array.isArray(sharedWith) ? sharedWith.filter((x): x is string => typeof x === 'string') : [],
  };
}
