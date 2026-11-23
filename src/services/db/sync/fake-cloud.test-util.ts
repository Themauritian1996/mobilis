/**
 * Faux Firestore des dossiers v2 POUR LES TESTS : mêmes requêtes que l'adaptateur (propriétaire / partage) et mêmes
 * contrôles que firestore.rules (propriétaire seul en écriture, id `<ownerUid>_<id>`, partage limité à l'auteur du
 * programme `rx/{sharedVia}`, fiche patient partageable seulement si id = uid). Aucun réseau.
 */
import type { CollectionName } from '../../../core/types/clinical.ts';
import { decodeFromCloud, encodeForCloud, remoteDocId, type RecordsRemote, type RemoteRecord } from './remote.ts';

export class Denied extends Error {
  readonly code = 'permission-denied';
}

export function createFakeCloud(rx: Record<string, { by: string }> = {}) {
  const docs = new Map<string, Record<string, unknown>>(); // `${col}/${docId}` → document encodé
  const state = { offline: false, writes: 0 };
  const net = (): void => {
    if (state.offline) throw Object.assign(new Error('Failed to fetch'), { code: 'unavailable' });
  };
  const readable = (d: Record<string, unknown>, uid: string): boolean =>
    d['ownerUid'] === uid || (Array.isArray(d['sharedWith']) && d['sharedWith'].includes(uid));
  const validShare = (col: CollectionName, d: Record<string, unknown>, uid: string): boolean => {
    const sw = (d['sharedWith'] as string[] | undefined) ?? [];
    if (!sw.length) return true;
    if (sw.length !== 1 || sw[0] === uid || typeof d['sharedVia'] !== 'string') return false;
    if (rx[d['sharedVia']]?.by !== sw[0]) return false;
    return col !== 'patients' || d['id'] === uid;
  };
  const as = (uid: string): RecordsRemote => ({
    async put(col, rec) {
      net();
      const id = remoteDocId(rec.ownerUid, rec.id);
      const prev = docs.get(`${col}/${id}`);
      if (rec.ownerUid !== uid || (prev && prev['ownerUid'] !== uid)) throw new Denied('owner');
      if (!validShare(col, rec, uid)) throw new Denied('share');
      if (col === 'assessments' && rec['videoRetained'] !== false) throw new Denied('video');
      docs.set(`${col}/${id}`, encodeForCloud(rec) as Record<string, unknown>);
      state.writes++;
    },
    async remove(col, ownerUid, id) {
      net();
      const k = `${col}/${remoteDocId(ownerUid, id)}`;
      const prev = docs.get(k);
      if (prev && prev['ownerUid'] !== uid) throw new Denied('delete');
      docs.delete(k);
    },
    async listOwn(col, who) {
      net();
      if (who !== uid) throw new Denied('list');
      return [...docs.entries()]
        .filter(([k, d]) => k.startsWith(col + '/') && d['ownerUid'] === who)
        .map(([, d]) => decodeFromCloud(d) as RemoteRecord);
    },
    async listSharedWith(col, who) {
      net();
      if (who !== uid) throw new Denied('list');
      return [...docs.entries()]
        .filter(([k, d]) => k.startsWith(col + '/') && readable(d, who) && d['ownerUid'] !== who)
        .map(([, d]) => decodeFromCloud(d) as RemoteRecord);
    },
  });
  return { as, docs, state, rx };
}
