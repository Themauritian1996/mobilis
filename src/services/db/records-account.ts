/**
 * Dossiers cliniques v2 du compte courant : un magasin local par compte (`mobilis.v2.<uid>.*`), synchronisé avec
 * Firestore pour un compte en ligne. `getRecordsDb()` reçoit une façade stable (installée par le volet « dossier
 * patient ») qui suit les changements de compte. Voir docs/adr/0009-dossier-patient.md.
 */
import { AppError } from '../../core/errors.ts';
import type { CollectionName } from '../../core/types/clinical.ts';
import { createLocalRecordsStore } from './local/records-store.ts';
import { createBrowserRecordsKv, type RecordsKv } from './local/records-kv.ts';
import type { DatabasePort } from './port.ts';
import type { RecordsRemote } from './sync/remote.ts';
import { createSyncedRecords, type ShareState, type SyncReport, type SyncedRecords } from './sync/records-sync.ts';
import type { ShareTarget } from './sync/sharing.ts';

export interface RecordsUser {
  readonly uid: string;
  readonly local?: boolean | undefined;
}

export interface AccountRecordsDeps {
  readonly kv: RecordsKv;
  readonly currentUser: () => RecordsUser | null;
  readonly onUserChange: (cb: (u: RecordsUser | null) => void) => unknown;
  /** Adaptateur en ligne pour un compte connecté (null : compte local / Firebase désactivé). */
  readonly remoteFor: (u: RecordsUser) => RecordsRemote | null;
  readonly shareTarget: (u: RecordsUser) => Promise<ShareTarget | null | undefined>;
  /** Drapeau `gait` : sans lui, rien ne part en ligne. */
  readonly enabled: () => boolean;
  readonly now?: () => string;
  readonly autoSyncMs?: number | null;
}

export interface AccountRecords {
  /** Façade stable pour `setRecordsDb()`. */
  readonly db: DatabasePort;
  /** Base du compte courant (change à la connexion / déconnexion). */
  current(): SyncedRecords;
  sync(): Promise<SyncReport>;
  shareState(col: CollectionName, id: string): ShareState;
  isForeign(col: CollectionName, id: string): boolean;
  /** Loi 25 : supprime les données v2 du compte (appareil ; en ligne si `remote`). */
  eraseMine(opts: { remote: boolean }): Promise<{ removedOnline: number }>;
  dismissPatient(id: string): Promise<void>;
  /** Abonnement aux fins de synchronisation (rafraîchir un écran). */
  onSynced(cb: (r: SyncReport) => void): () => void;
}

export const scopeOf = (u: RecordsUser | null): string => (u ? (u.local ? 'local' : u.uid) : 'anon');

export function createAccountRecords(d: AccountRecordsDeps): AccountRecords {
  let cur: SyncedRecords | null = null;
  let curScope = '';
  const subs = new Set<(r: SyncReport) => void>();
  const build = (u: RecordsUser | null): SyncedRecords => {
    const remote = u && !u.local ? d.remoteFor(u) : null;
    return createSyncedRecords({
      store: createLocalRecordsStore(d.kv, scopeOf(u)),
      uid: u ? (u.local ? 'local' : u.uid) : 'anon',
      remote,
      ...(u && remote ? { shareTarget: () => d.shareTarget(u) } : {}),
      enabled: d.enabled,
      ...(d.now ? { now: d.now } : {}),
      ...(d.autoSyncMs !== undefined ? { autoSyncMs: d.autoSyncMs } : {}),
    });
  };
  const current = (): SyncedRecords => {
    const u = d.currentUser();
    const s = scopeOf(u);
    if (!cur || s !== curScope) {
      cur?.dispose();
      cur = build(u);
      curScope = s;
    }
    return cur;
  };
  const sync = async (): Promise<SyncReport> => {
    const r = await current().sync();
    for (const cb of subs) cb(r);
    if (!r.ok && !r.offline) console.warn('Synchronisation des dossiers impossible', r.error);
    return r;
  };
  d.onUserChange(() => {
    current();
    void sync();
  });
  const db: DatabasePort = {
    get: (c, id) => current().db.get(c, id),
    set: (c, id, doc) => current().db.set(c, id, doc),
    remove: (c, id) => current().db.remove(c, id),
    query: (c, w) => current().db.query(c, w),
    watch: (c, id, cb) => current().db.watch(c, id, cb),
  };
  return {
    db,
    current,
    sync,
    shareState: (c, id) => current().shareState(c, id),
    isForeign: (c, id) => current().isForeign(c, id),
    async eraseMine(opts) {
      try {
        return await current().eraseAll(opts);
      } catch (e) {
        throw new AppError('records_erase_failed', 'Suppression des dossiers impossible', { cause: e });
      }
    },
    dismissPatient: (id) => current().dismissPatient(id),
    onSynced(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
}

/** Magasin de l'appareil (IndexedDB, sinon localStorage). */
export const browserRecordsKv = (): RecordsKv => createBrowserRecordsKv();
