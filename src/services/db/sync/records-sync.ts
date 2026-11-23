/**
 * Dossiers cliniques v2 : base LOCALE d'abord (hors ligne), synchronisée en ligne pour un compte connecté.
 *
 *  - Lecture/écriture : toujours sur l'appareil (aucune attente réseau). Chaque écriture marque le document « modifié ».
 *  - `sync()` : envoie les modifications, reçoit celles des autres appareils, applique les suppressions, rafraîchit
 *    les documents partagés avec ce compte et crée les dossiers des patients qui transmettent leurs données.
 *  - Conflit simple : la version dont `updatedAt` est la plus récente gagne (égalité : la version locale).
 *  - Hors ligne : rien n'est perdu ; les modifications partent à la prochaine synchronisation (retour en ligne,
 *    connexion, ouverture du dossier, ou quelques secondes après une écriture).
 * Voir docs/adr/0009-dossier-patient.md.
 */
import { AppError } from '../../../core/errors.ts';
import type { Unsubscribe } from '../../../core/events.ts';
import type { CollectionMap, CollectionName, Patient } from '../../../core/types/clinical.ts';
import { isNetworkError } from '../errors.ts';
import { RECORD_COLLECTIONS, migrateRecord } from '../local/record-schemas.ts';
import type { LocalRecordsStore, StoredEntry } from '../local/records-store.ts';
import { match } from '../memory/index.ts';
import type { DatabasePort, WhereClause } from '../port.ts';
import { splitRemote, type RecordsRemote, type RemoteRecord } from './remote.ts';
import { SHARED_COLLECTIONS, desiredSharedWith, planAutoCreate, sameList, type ShareTarget } from './sharing.ts';

export interface SyncedRecordsOptions {
  readonly store: LocalRecordsStore;
  /** uid du compte (propriétaire des documents de ce magasin). */
  readonly uid: string;
  /** `null` : compte local ou non connecté → aucune synchronisation. */
  readonly remote: RecordsRemote | null;
  /** Destinataire du partage (patient lié à un clinicien) ; `undefined` = inconnu (hors ligne) → partage inchangé. */
  readonly shareTarget?: () => Promise<ShareTarget | null | undefined>;
  /** Synchronisation permise (drapeau `gait`) ; sinon les données restent sur l'appareil. */
  readonly enabled?: () => boolean;
  readonly now?: () => string;
  /** Délai de synchronisation automatique après une écriture (ms) ; `null` = jamais (tests). */
  readonly autoSyncMs?: number | null;
}

export interface SyncReport {
  readonly ok: boolean;
  readonly skipped?: 'local' | 'disabled';
  readonly offline?: boolean;
  readonly error?: unknown;
  readonly pushed: number;
  readonly pulled: number;
  readonly removed: number;
  readonly created: number;
}

export type ShareState = 'none' | 'pending' | 'shared';

export interface SyncedRecords {
  readonly db: DatabasePort;
  readonly uid: string;
  sync(): Promise<SyncReport>;
  /** Partage d'un document du compte avec le clinicien : aucun, en attente d'envoi, transmis. */
  shareState(col: CollectionName, id: string): ShareState;
  /** Document partagé par un autre compte (lecture seule). */
  isForeign(col: CollectionName, id: string): boolean;
  /** Nombre de documents modifiés pas encore envoyés. */
  pending(): number;
  lastSync(): string | undefined;
  /** Le clinicien a supprimé le dossier d'un patient qui partage : ne pas le recréer sans nouvelle donnée. */
  dismissPatient(patientId: string): Promise<void>;
  /** Supprime les données v2 de ce compte : appareil, et en ligne si `remote` (erreur réseau → rien n'est effacé). */
  eraseAll(opts: { remote: boolean }): Promise<{ removedOnline: number }>;
  dispose(): void;
}

const READ_ONLY = (col: string, id: string): AppError =>
  new AppError('records_read_only', `${col}/${id} : document partagé par un autre compte (lecture seule)`);

export function createSyncedRecords(o: SyncedRecordsOptions): SyncedRecords {
  const { store, uid, remote } = o;
  const now = o.now ?? (() => new Date().toISOString());
  const enabled = o.enabled ?? (() => true);
  const autoMs = o.autoSyncMs === undefined ? 1500 : o.autoSyncMs;
  const watchers = new Map<string, Set<(d: unknown) => void>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<SyncReport> | null = null;
  let again = false;
  let disposed = false;

  const migrated = <C extends CollectionName>(col: C, e: StoredEntry): CollectionMap[C] | null =>
    migrateRecord(col, e.doc, { ownerUid: String(e.doc['ownerUid'] ?? uid), now: now() });

  const visibleOwn = (col: CollectionName): StoredEntry[] => store.own(col).filter((e) => !e.deleted);
  // Les fiches « patients » partagées ne se mêlent pas aux dossiers du clinicien (même id) : elles servent à la création.
  const visibleForeign = (col: CollectionName): StoredEntry[] => (col === 'patients' ? [] : store.foreign(col));
  const findForeign = (col: CollectionName, id: string): StoredEntry | undefined =>
    visibleForeign(col).find((e) => e.doc['id'] === id);

  const notify = (col: CollectionName, id: string): void => {
    const set = watchers.get(`${col}/${id}`);
    if (!set?.size) return;
    void db.get(col, id).then((d) => {
      for (const cb of set) cb(d);
    });
  };
  const schedule = (): void => {
    if (!remote || autoMs === null || disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void sync();
    }, autoMs);
    (timer as { unref?: () => void }).unref?.();
  };

  const db: DatabasePort = {
    async get(col, id) {
      await store.ready();
      const e = store.getOwn(col, id);
      if (e && !e.deleted) return migrated(col, e);
      const f = findForeign(col, id);
      return f ? migrated(col, f) : null;
    },
    async set(col, id, doc) {
      await store.ready();
      const prev = store.getOwn(col, id);
      if ((!prev || prev.deleted) && findForeign(col, id)) throw READ_ONLY(col, id);
      const d = { ...(doc as unknown as Record<string, unknown>), id, ownerUid: uid };
      await store.putOwn({
        f: 1,
        col,
        doc: structuredClone(d),
        dirty: true,
        ...(prev?.synced ? { synced: true } : {}),
        ...(prev?.sharedWith ? { sharedWith: prev.sharedWith } : {}),
      });
      notify(col, id);
      schedule();
    },
    async remove(col, id) {
      await store.ready();
      const prev = store.getOwn(col, id);
      if (!prev || prev.deleted) {
        if (findForeign(col, id)) throw READ_ONLY(col, id);
        return;
      }
      if (prev.synced && remote) await store.putOwn({ ...prev, deleted: true, dirty: true });
      else await store.dropOwn(col, id);
      notify(col, id);
      schedule();
    },
    async query(col, where = []) {
      await store.ready();
      const out: CollectionMap[typeof col][] = [];
      for (const e of [...visibleOwn(col), ...visibleForeign(col)]) {
        const d = migrated(col, e);
        if (d && where.every((w) => match(d as unknown as Record<string, unknown>, w as WhereClause<never>)))
          out.push(d);
      }
      return out;
    },
    watch(col, id, cb): Unsubscribe {
      const key = `${col}/${id}`;
      let set = watchers.get(key);
      if (!set) watchers.set(key, (set = new Set()));
      const h = cb as (d: unknown) => void;
      set.add(h);
      let live = true;
      void db.get(col, id).then((d) => {
        if (live) h(d);
      });
      return () => {
        live = false;
        set.delete(h);
      };
    },
  };

  async function pushEntry(e: StoredEntry, target: ShareTarget | null | undefined): Promise<void> {
    const col = e.col;
    const id = String(e.doc['id']);
    const sharedWith = desiredSharedWith(col, e.doc, uid, target, e.sharedWith);
    const rec: RemoteRecord = {
      ...e.doc,
      id,
      ownerUid: uid,
      sharedWith,
      sharedVia: sharedWith.length && target ? target.via : null,
    };
    await remote!.put(col, rec);
    // Une écriture locale faite pendant l'envoi reste « modifiée » (comparaison d'identité).
    if (store.getOwn(col, id) === e) {
      const { dirty, ...rest } = e;
      void dirty;
      await store.putOwn({ ...rest, synced: true, sharedWith });
    }
  }

  async function runSync(): Promise<SyncReport> {
    const r = { pushed: 0, pulled: 0, removed: 0, created: 0 };
    if (!remote) return { ok: true, skipped: 'local', ...r };
    if (!enabled()) return { ok: true, skipped: 'disabled', ...r };
    await store.ready();
    try {
      const target = o.shareTarget ? await o.shareTarget() : null;
      if (target !== undefined) await store.setMeta({ shareTarget: target });
      // 1. Documents du compte : réception, conflits, envoi, suppressions.
      for (const col of RECORD_COLLECTIONS) {
        const online = new Map((await remote.listOwn(col, uid)).map((x) => [String(x.id), x]));
        for (const e of store.own(col)) {
          const id = String(e.doc['id']);
          const rr = online.get(id);
          online.delete(id);
          if (e.deleted) {
            if (rr) await remote.remove(col, uid, id);
            if (store.getOwn(col, id) === e) await store.dropOwn(col, id);
            r.removed++;
            continue;
          }
          if (!rr) {
            if (e.dirty || !e.synced) {
              await pushEntry(e, target);
              r.pushed++;
            } else {
              // Déjà envoyé puis disparu en ligne : supprimé depuis un autre appareil.
              await store.dropOwn(col, id);
              notify(col, id);
              r.removed++;
            }
            continue;
          }
          const { doc: rdoc, sharedWith: rshared } = splitRemote(rr);
          const lu = String(e.doc['updatedAt'] ?? '');
          const ru = String(rdoc['updatedAt'] ?? '');
          if (e.dirty && lu >= ru) {
            await pushEntry(e, target);
            r.pushed++;
          } else if (ru !== lu || e.dirty) {
            await store.putOwn({ f: 1, col, doc: rdoc, synced: true, sharedWith: rshared });
            notify(col, id);
            r.pulled++;
          } else if (!sameList(desiredSharedWith(col, e.doc, uid, target, rshared), rshared)) {
            await pushEntry(e, target); // partage accordé ou retiré
            r.pushed++;
          } else if (!e.synced || !sameList(e.sharedWith, rshared)) {
            await store.putOwn({ ...e, synced: true, sharedWith: rshared });
          }
        }
        for (const [id, rr] of online) {
          const { doc, sharedWith } = splitRemote(rr);
          await store.putOwn({ f: 1, col, doc, synced: true, sharedWith });
          notify(col, id);
          r.pulled++;
        }
      }
      // 2. Documents partagés avec ce compte (lecture seule), remplacés en bloc (un partage retiré disparaît).
      const sharedDocs: { ownerUid: string; patientId?: unknown; updatedAt?: unknown }[] = [];
      let sharedPatients: Patient[] = [];
      for (const col of SHARED_COLLECTIONS) {
        const docs = (await remote.listSharedWith(col, uid))
          .map((x) => splitRemote(x).doc)
          .filter((d) => typeof d['ownerUid'] === 'string' && d['ownerUid'] !== uid);
        if (col === 'patients') {
          sharedPatients = docs
            .map((d) => migrateRecord('patients', d, { ownerUid: String(d['ownerUid']), now: now() }))
            .filter((p): p is Patient => !!p && p.id === p.ownerUid);
          continue;
        }
        await store.replaceForeign(
          col,
          docs.map((doc) => ({ f: 1, col, doc, foreign: true })),
        );
        for (const d of docs)
          sharedDocs.push({ ownerUid: String(d['ownerUid']), patientId: d['patientId'], updatedAt: d['updatedAt'] });
      }
      // 3. Création automatique des dossiers chez le clinicien.
      let dismissed: Record<string, string> = { ...(store.meta().dismissed ?? {}) };
      const toCreate = planAutoCreate({
        uid,
        now: now(),
        sharedPatients,
        sharedDocs,
        ownPatientIds: new Set(store.own('patients').map((e) => String(e.doc['id']))),
        dismissed,
      });
      for (const p of toCreate) {
        dismissed = Object.fromEntries(Object.entries(dismissed).filter(([k]) => k !== p.id));
        const e: StoredEntry = { f: 1, col: 'patients', doc: { ...p }, dirty: true };
        await store.putOwn(e);
        await pushEntry(e, null);
        r.created++;
      }
      await store.setMeta({ lastSync: now(), dismissed, sharedPatients });
      return { ok: true, ...r };
    } catch (error) {
      return { ok: false, offline: isNetworkError(error), error, ...r };
    }
  }

  function sync(): Promise<SyncReport> {
    if (running) {
      again = true;
      return running;
    }
    running = runSync().finally(() => {
      running = null;
      if (again && !disposed) {
        again = false;
        void sync();
      }
    });
    return running;
  }

  return {
    db,
    uid,
    sync,
    shareState(col, id) {
      const e = store.getOwn(col, id);
      if (!e || e.deleted) return 'none';
      const want = desiredSharedWith(col, e.doc, uid, store.meta().shareTarget, e.sharedWith);
      if (e.dirty && want.length) return 'pending';
      return e.synced && e.sharedWith?.length ? 'shared' : 'none';
    },
    isForeign: (col, id) => !store.getOwn(col, id) && !!findForeign(col, id),
    pending: () => RECORD_COLLECTIONS.reduce((n, c) => n + store.own(c).filter((e) => e.dirty).length, 0),
    lastSync: () => store.meta().lastSync,
    async dismissPatient(patientId) {
      await store.ready();
      await store.setMeta({ dismissed: { ...(store.meta().dismissed ?? {}), [patientId]: now() } });
    },
    async eraseAll({ remote: online }) {
      await store.ready();
      let removedOnline = 0;
      if (online && remote) {
        for (const col of RECORD_COLLECTIONS) {
          for (const rr of await remote.listOwn(col, uid)) {
            await remote.remove(col, uid, String(rr.id));
            removedOnline++;
          }
        }
      }
      await store.eraseAll();
      return { removedOnline };
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      watchers.clear();
    },
  };
}
