/**
 * Adaptateur Firestore des dossiers cliniques v2 (port `RecordsRemote`). Collections de premier niveau
 * `patients`, `assessments`, `plans`, `studies`, `interventions`, `annotations`, `followups` ; id Firestore
 * `<ownerUid>_<id>` (vérifié par firestore.rules : un compte ne peut ni écrire ni « réserver » l'id d'un autre).
 * Lecture : par propriétaire (`ownerUid ==`) ou par partage (`sharedWith array-contains`), seules requêtes admises
 * par les règles. Voir docs/adr/0009-dossier-patient.md.
 */
import type { FirebaseLoader } from '../../auth/firebase/sdk.ts';
import { decodeFromCloud, encodeForCloud, remoteDocId, type RecordsRemote, type RemoteRecord } from '../sync/remote.ts';

const asRecord = (d: Record<string, unknown>): RemoteRecord | null => {
  const v = decodeFromCloud(d) as Record<string, unknown>;
  return typeof v['id'] === 'string' && typeof v['ownerUid'] === 'string' ? (v as RemoteRecord) : null;
};

export function createFirestoreRecordsRemote(load: FirebaseLoader): RecordsRemote {
  const list = async (col: string, field: string, op: string, value: string): Promise<RemoteRecord[]> => {
    const { db, m } = await load();
    const qs = await m.getDocs(m.query(m.collection(db, col), m.where(field, op, value)));
    return qs.docs.map((d) => asRecord(d.data())).filter((x): x is RemoteRecord => x !== null);
  };
  return {
    async put(col, rec) {
      const { db, m } = await load();
      await m.setDoc(m.doc(db, col, remoteDocId(rec.ownerUid, rec.id)), encodeForCloud(rec));
    },
    async remove(col, ownerUid, id) {
      const { db, m } = await load();
      await m.deleteDoc(m.doc(db, col, remoteDocId(ownerUid, id)));
    },
    listOwn: (col, uid) => list(col, 'ownerUid', '==', uid),
    listSharedWith: (col, uid) => list(col, 'sharedWith', 'array-contains', uid),
  };
}
