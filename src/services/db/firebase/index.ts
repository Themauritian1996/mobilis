/**
 * Adaptateur Firestore — voir services/auth/firebase/index.ts (même règle d'isolement de Firebase).
 *  - createFirestoreDatabase : `DatabasePort` générique (collections de la v2).
 *  - createLegacyCloudRepo : documents de la v1.15, formes INCHANGÉES : `users/{uid}` (profil, journal, updated),
 *    `users/{uid}/sessions/{id}`, `rx/{code}` (programmes du clinicien), `rx/{code}/progress/{uid}` (suivi partagé).
 */
import type { CollectionMap } from '../../../core/types/clinical.ts';
import { AppError } from '../../../core/errors.ts';
import type { FirebaseLoader } from '../../auth/firebase/sdk.ts';
import { isNetworkError } from '../errors.ts';
import type { DatabasePort } from '../port.ts';

/** Document Firestore tel que lu : objet JSON quelconque (les clés sont celles écrites par l'app). */
export type CloudDoc = Record<string, unknown>;

export function createFirestoreDatabase(load: FirebaseLoader): DatabasePort {
  return {
    async get(col, id) {
      const { db, m } = await load();
      const snap = await m.getDoc(m.doc(db, col, id));
      return snap.exists() ? (snap.data() as unknown as CollectionMap[typeof col]) : null;
    },
    async set(col, id, doc) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, col, id), doc);
    },
    async remove(col, id) {
      const { db, m } = await load();
      await m.deleteDoc(m.doc(db, col, id));
    },
    async query(col, where = []) {
      const { db, m } = await load();
      const q = m.query(m.collection(db, col), ...where.map((w) => m.where(w.field, w.op, w.value)));
      const qs = await m.getDocs(q);
      return qs.docs.map((d) => d.data() as unknown as CollectionMap[typeof col]);
    },
    watch(col, id, cb) {
      // Le bundle Firebase local n'expose pas les écoutes en temps réel (onSnapshot) : lecture unique à l'abonnement.
      let active = true;
      void this.get(col, id).then(
        (d) => {
          if (active) cb(d);
        },
        (e: unknown) => {
          throw new AppError('db_watch_failed', `Lecture de ${col}/${id} impossible`, { cause: e });
        },
      );
      return () => {
        active = false;
      };
    },
  };
}

/** Accès aux documents de la v1.15. Chaque méthode correspond à un appel Firestore de www/js/store.js. */
export interface LegacyCloudRepo {
  /** `users/{uid}` + `users/{uid}/sessions` triées par date. */
  readUser(uid: string): Promise<{ user: CloudDoc | null; sessions: CloudDoc[] }>;
  /** Fusionne `patch` dans `users/{uid}` (ajoute `updated: Date.now()`). */
  mergeUser(uid: string, patch: CloudDoc): Promise<void>;
  putSession(uid: string, session: CloudDoc & { id: string }): Promise<void>;
  removeSession(uid: string, id: string): Promise<void>;
  /** Supprime profil, séances, suivi partagé et programmes créés par ce compte. Retourne le nombre de documents supprimés. */
  deleteAccount(uid: string, rxCode: string | null | undefined): Promise<number>;
  getRx(code: string): Promise<CloudDoc | null>;
  putRx(code: string, data: CloudDoc): Promise<void>;
  patchRx(code: string, patch: CloudDoc): Promise<void>;
  removeRx(code: string): Promise<void>;
  /** Programmes créés par ce compte, du plus récent au plus ancien, avec le suivi partagé par les patients (`patients`). */
  listRx(uid: string): Promise<CloudDoc[]>;
  putProgress(code: string, uid: string, summary: CloudDoc): Promise<void>;
}

export function createLegacyCloudRepo(load: FirebaseLoader): LegacyCloudRepo {
  return {
    async readUser(uid) {
      const { db, m } = await load();
      const snap = await m.getDoc(m.doc(db, 'users', uid));
      const user = snap.exists() ? snap.data() : null;
      const qs = await m.getDocs(m.query(m.collection(db, 'users', uid, 'sessions'), m.orderBy('date')));
      return { user, sessions: qs.docs.map((d) => d.data()) };
    },
    async mergeUser(uid, patch) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, 'users', uid), { ...patch, updated: Date.now() }, { merge: true });
    },
    async putSession(uid, session) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, 'users', uid, 'sessions', session.id), session);
    },
    async removeSession(uid, id) {
      const { db, m } = await load();
      await m.deleteDoc(m.doc(db, 'users', uid, 'sessions', id));
    },
    async deleteAccount(uid, rxCode) {
      const { db, m } = await load();
      let n = 0;
      if (rxCode) {
        try {
          await m.deleteDoc(m.doc(db, 'rx', rxCode, 'progress', uid));
          n++;
        } catch (e) {
          if (isNetworkError(e)) throw e;
        }
      }
      const qs = await m.getDocs(m.collection(db, 'users', uid, 'sessions'));
      for (const d of qs.docs) {
        await m.deleteDoc(d.ref);
        n++;
      }
      try {
        const mine = await m.getDocs(m.query(m.collection(db, 'rx'), m.where('by', '==', uid)));
        for (const d of mine.docs) {
          const code = d.id;
          try {
            const ps = await m.getDocs(m.collection(db, 'rx', code, 'progress'));
            for (const p of ps.docs) {
              await m.deleteDoc(p.ref);
              n++;
            }
          } catch {
            /* suivi illisible : le programme est quand même supprimé */
          }
          await m.deleteDoc(d.ref);
          n++;
        }
      } catch (e) {
        if (isNetworkError(e)) throw e;
      }
      await m.deleteDoc(m.doc(db, 'users', uid));
      n++;
      return n;
    },
    async getRx(code) {
      const { db, m } = await load();
      const snap = await m.getDoc(m.doc(db, 'rx', code));
      return snap.exists() ? snap.data() : null;
    },
    async putRx(code, data) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, 'rx', code), data);
    },
    async patchRx(code, patch) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, 'rx', code), patch, { merge: true });
    },
    async removeRx(code) {
      const { db, m } = await load();
      await m.deleteDoc(m.doc(db, 'rx', code));
    },
    async listRx(uid) {
      const { db, m } = await load();
      const qs = await m.getDocs(m.query(m.collection(db, 'rx'), m.where('by', '==', uid)));
      const list = qs.docs
        .map((d) => d.data())
        .sort((a, b) => ((b['updated'] as number) || 0) - ((a['updated'] as number) || 0));
      for (const rx of list) {
        try {
          const ps = await m.getDocs(m.collection(db, 'rx', rx['code'] as string, 'progress'));
          rx['patients'] = ps.docs.map((d) => d.data());
        } catch {
          rx['patients'] = [];
        }
      }
      return list;
    },
    async putProgress(code, uid, summary) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, 'rx', code, 'progress', uid), { ...summary, uid, updated: Date.now() });
    },
  };
}
