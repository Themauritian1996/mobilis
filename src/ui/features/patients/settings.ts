// Réglages du volet utilisés par l'écran Profil : drapeau `gait` (clinicien) et effacement Loi 25.
import { FLAGS_STORAGE_KEY } from '../../../platform/flags.ts';
import { createBrowserKeyValueStore } from '../../../platform/storage.ts';
import { accountRecords } from '../../../services/db/records-install.ts';
import { isNetworkError } from '../../../services/db/errors.ts';

/** Enregistre le drapeau `gait` dans `mobilis.flags` (les autres drapeaux enregistrés sont conservés). */
export function setGaitFlag(on: boolean): void {
  const kv = createBrowserKeyValueStore();
  let saved: Record<string, unknown> = {};
  try {
    const v: unknown = JSON.parse(kv.get(FLAGS_STORAGE_KEY) ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) saved = v as Record<string, unknown>;
  } catch {
    saved = {};
  }
  kv.set(FLAGS_STORAGE_KEY, JSON.stringify({ ...saved, gait: on }));
}

/**
 * Appelé par « Effacer les données de l'appareil » et « Supprimer mes données en ligne » (Loi 25) : efface aussi les
 * dossiers v2 du compte. En ligne (toutes les collections du compte) ;
 * une erreur réseau est relancée (rien n'est effacé, comme pour la v1), une autre erreur (règles non publiées) est
 * ignorée pour ne pas bloquer la suppression v1.
 */
export async function eraseRecordsForErase({ remote }: { remote: boolean }): Promise<void> {
  const r = accountRecords();
  if (!r) return;
  const online = remote;
  try {
    await r.eraseMine({ remote: online });
  } catch (e) {
    const cause = (e as { cause?: unknown }).cause ?? e;
    if (isNetworkError(cause)) throw e;
    console.warn('Dossiers v2 : suppression en ligne impossible', e);
    await r.eraseMine({ remote: false }).catch(() => undefined);
  }
}
