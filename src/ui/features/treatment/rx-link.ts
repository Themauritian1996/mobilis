/**
 * Relie un plan de traitement au programme `rx` enregistré depuis l'éditeur (src/ui/views/clinic.ts), sans import
 * croisé : l'éditeur émet `mobilis:rx-saved` ({ code, localId, planId }) et ce module enregistre `plan.rxCode`.
 */
import { fromStored, linkRx } from '../../../domains/treatment/plan.ts';
import { getRecordsDb } from '../../../services/db/records.ts';
import { savePlan } from './data.ts';

export interface RxSavedDetail {
  readonly code?: string | null;
  readonly localId?: string | null;
  readonly planId?: string | null;
}

/** Enregistre `plan.rxCode` ; retourne true si le plan a été mis à jour. */
export async function applyRxSaved(detail: RxSavedDetail, now: Date = new Date()): Promise<boolean> {
  if (!detail.planId) return false;
  const stored = await getRecordsDb().get('plans', detail.planId);
  if (!stored) return false;
  const plan = fromStored(stored);
  const next = linkRx(plan, detail, now);
  if (next === plan) return false;
  await savePlan(next);
  return true;
}

let installed = false;

/** Écoute l'événement window `mobilis:rx-saved` (une seule fois). */
export function installRxSavedListener(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('mobilis:rx-saved', (e) => {
    const detail = ((e as CustomEvent<RxSavedDetail>).detail ?? {}) as RxSavedDetail;
    void applyRxSaved(detail).catch((err) => console.warn('rx-saved', err));
  });
}
