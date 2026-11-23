/**
 * Racine de composition des dossiers cliniques v2 : magasin local de l'appareil + Firestore (chargeur Firebase et
 * compte de la façade v1.15), drapeau `gait`, lien patient → clinicien par le programme (`rx/{code}.by`).
 * Appelé une fois par src/ui/features/patients/routes.ts (effet d'import).
 */
import { firebaseEnabled } from '../../platform/assets.ts';
import { loadFeatureFlags } from '../../platform/flags.ts';
import { createBrowserKeyValueStore } from '../../platform/storage.ts';
// Seul assemblage hors de firebase/ (comme store.ts) : l'adaptateur Firestore des dossiers.
// eslint-disable-next-line no-restricted-imports
import { createFirestoreRecordsRemote } from './firebase/records-remote.ts';
import { isNetworkError } from './errors.ts';
import { createAccountRecords, browserRecordsKv, type AccountRecords } from './records-account.ts';
import { setRecordsDb } from './records.ts';
import * as store from './store.ts';
import type { ShareTarget } from './sync/sharing.ts';

let installed: AccountRecords | null = null;

const gaitEnabled = (): boolean => {
  try {
    return loadFeatureFlags(createBrowserKeyValueStore(), globalThis.location?.search ?? '').isEnabled('gait');
  } catch {
    return false;
  }
};

/**
 * Destinataire du partage d'un patient : l'auteur du programme lié (`rx/{code}.by`), seulement si le patient a
 * accepté de partager son suivi (`shareProgress`). `undefined` si inconnu (hors ligne) : le partage reste inchangé.
 */
async function shareTargetOf(uid: string): Promise<ShareTarget | null | undefined> {
  let p = store.cachedProfile();
  if (!p) {
    try {
      p = (await store.loadData()).profile ?? null;
    } catch {
      return undefined;
    }
  }
  if (!p) return undefined;
  if (p.role === 'clinician' || !p.rxCode || p['shareProgress'] !== true) return null;
  const code = store.cleanCode(p.rxCode);
  try {
    const rx = await store.getRx(code);
    const by = rx?.['by'];
    return typeof by === 'string' && by && by !== uid ? { uid: by, via: code } : null;
  } catch (e) {
    return isNetworkError(e) ? undefined : null;
  }
}

export function installRecordsDb(): AccountRecords {
  if (installed) return installed;
  const remote = firebaseEnabled() ? createFirestoreRecordsRemote(store.firebaseLoader) : null;
  installed = createAccountRecords({
    kv: browserRecordsKv(),
    currentUser: store.currentUser,
    onUserChange: store.onUserChange,
    remoteFor: () => remote,
    shareTarget: (u) => shareTargetOf(u.uid),
    enabled: gaitEnabled,
  });
  setRecordsDb(installed.db);
  try {
    globalThis.addEventListener?.('online', () => void installed?.sync());
  } catch {
    /* pas de fenêtre (tests) */
  }
  return installed;
}

/** Instance installée (null avant `installRecordsDb`). */
export const accountRecords = (): AccountRecords | null => installed;
