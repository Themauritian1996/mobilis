/**
 * Pont vers l'éditeur de programme `rx` existant, SANS modifier src/ui/views/clinic.ts : le formulaire d'édition vit
 * dans `state.clinic` (src/ui/app-state.ts) ; `viewRxEditor` le réutilise quand `form.code` correspond à la route.
 * On y dépose donc un formulaire prérempli (exercices du plan, région, côté, notes) puis on navigue.
 *
 * Limites (voir le compte rendu) : sans changement de clinic.ts, l'éditeur masque la liste d'exercices tant qu'aucune
 * pathologie n'est choisie ; ce pont propose donc de rattacher (facultatif) une pathologie de la région, qui ne
 * remplace pas les exercices déposés. Choisir une pathologie ou une phase DANS l'éditeur remplacerait la liste.
 */
import * as store from '../../../../www/js/store.js';
import { newRxForm, PATHOLOGY_LIST, type RxForm, type StoredRx } from '../../../domains/clinic/rx.ts';
import { rxPrefill, type RxPrefill } from '../../../domains/treatment/plan.ts';
import { defaultExerciseCatalogue } from '../../../domains/treatment/catalogues.ts';
import type { TreatmentPlan } from '../../../domains/treatment/types.ts';
import { go, profile, state, type Profile } from '../../app-state.ts';

export interface ProgramRef {
  readonly ref: string;
  readonly label: string;
}

/** Programmes du clinicien (pour rattacher le plan à un programme existant). */
export async function listPrograms(): Promise<ProgramRef[]> {
  try {
    const list = (await store.listMyRx()) as {
      code?: string | null;
      localId?: string | null;
      label?: string;
      pathology?: string | null;
    }[];
    return list
      .map((r) => ({ ref: r.code || r.localId || '', label: r.label || r.pathology || r.code || r.localId || '' }))
      .filter((r) => r.ref);
  } catch (e) {
    console.warn('listMyRx', e);
    return [];
  }
}

/** Pathologies du catalogue pour la région d'un préremplissage (identifiant, nom). */
export function pathologiesOf(region: string | null): { id: string; name: string }[] {
  if (!region) return [];
  return PATHOLOGY_LIST.filter((p) => p.region === region).map((p) => {
    const n = p.name as { fr?: string; en?: string } | string;
    return { id: p.id, name: typeof n === 'string' ? n : (n.fr ?? n.en ?? p.id) };
  });
}

export function prefillOf(plan: TreatmentPlan): RxPrefill {
  return rxPrefill(plan, defaultExerciseCatalogue());
}

/**
 * Ouvre l'éditeur rx prérempli. `rxRef` : programme existant à mettre à jour (les exercices du plan s'ajoutent à la fin) ;
 * absent : nouveau programme. `pathology` : pathologie de la région à rattacher (facultatif).
 * Retourne false si le programme demandé est introuvable ou si le plan n'a aucun exercice transférable.
 */
export async function openRxEditor(
  plan: TreatmentPlan,
  opts: { rxRef?: string | undefined; pathology?: string | null | undefined } = {},
): Promise<boolean> {
  const pre = prefillOf(plan);
  if (!pre.ids.length) return false;
  const prof = profile() as Profile;
  let rx: StoredRx | null = null;
  if (opts.rxRef) {
    try {
      rx = (
        opts.rxRef.startsWith('L') ? store.getLocalRx(opts.rxRef) : await store.getRx(opts.rxRef)
      ) as StoredRx | null;
    } catch {
      rx = null;
    }
    if (!rx) return false;
  }
  const form: RxForm = newRxForm(opts.rxRef ?? null, rx, prof as { clinicianName?: string; name?: string });
  if (rx) {
    form.ids = [...form.ids, ...pre.ids.filter((id) => !form.ids.includes(id))];
  } else {
    form.ids = [...pre.ids];
    if (pre.region) form.region = pre.region;
    form.side = pre.side ?? 'both';
    form.notes = pre.notes;
    form.label = `Plan de marche — révision ${plan.revision}`;
  }
  if (opts.pathology && !rx) form.pathology = opts.pathology;
  state.clinic = form;
  go(opts.rxRef ? `#/clinic/rx/${opts.rxRef}` : '#/clinic/new');
  return true;
}
