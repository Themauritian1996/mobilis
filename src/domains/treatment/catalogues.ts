/**
 * Assemblage des catalogues injectés dans `proposePlan` : défauts de marche (domaine gait), déviations prothétiques
 * (domaine prosthetics), déterminants, tables de correspondance (data/) et bibliothèque d'exercices (domaine rehab).
 */
import { DETERMINANTS, GAIT_FINDINGS, REFERENCES, type DeterminantId } from '../gait/index.ts';
import { PROSTHETIC_CATALOG } from '../prosthetics/index.ts';
import { EXERCISES } from '../rehab/data/exercises.ts';
import { DETERMINANT_PLAN, GAIT_PLAN, PROSTHETIC_PLAN } from './data/plan-map.ts';
import { GOAL_TEMPLATES } from './data/goals.ts';
import type {
  DeterminantPlanEntry,
  ExerciseCatalogue,
  FindingInfo,
  FindingPlanEntry,
  TreatmentCatalogues,
} from './types.ts';

function findings(): Record<string, FindingInfo> {
  const out: Record<string, FindingInfo> = {};
  for (const f of GAIT_FINDINGS)
    out[f.id] = { id: f.id, kind: 'gait', name_fr: f.name_fr, refs: f.refs, evidenceLevel: f.evidenceLevel };
  for (const d of PROSTHETIC_CATALOG.deviations)
    out[d.id] = { id: d.id, kind: 'prosthetic', name_fr: d.name_fr, refs: d.refs, evidenceLevel: null };
  return out;
}

function prosthetic(): TreatmentCatalogues['prosthetic'] {
  const out: Record<string, TreatmentCatalogues['prosthetic'][string]> = {};
  for (const d of PROSTHETIC_CATALOG.deviations)
    out[d.id] = { suggestionsProsthetist: d.suggestions_prosthetist, assistiveDevice: d.assistiveDevice, refs: d.refs };
  return out;
}

/** Catalogues de production (construits une fois). */
let cached: TreatmentCatalogues | null = null;
export function defaultCatalogues(): TreatmentCatalogues {
  if (cached) return cached;
  const plan: Record<string, FindingPlanEntry> = {};
  for (const e of [...GAIT_PLAN, ...PROSTHETIC_PLAN]) plan[e.findingId] = e;
  const determinantPlan: Partial<Record<DeterminantId, DeterminantPlanEntry>> = {};
  for (const d of DETERMINANTS) {
    const e = DETERMINANT_PLAN[d.id];
    determinantPlan[d.id] = { determinantId: d.id, exercises: e.exercises, refs: e.refs };
  }
  cached = {
    findings: findings(),
    plan,
    determinantPlan,
    determinantNames: Object.fromEntries(DETERMINANTS.map((d) => [d.id, d.name_fr])) as Record<DeterminantId, string>,
    goals: GOAL_TEMPLATES,
    prosthetic: prosthetic(),
  };
  return cached;
}

/** Bibliothèque d'exercices réduite à (nom, région, matériel) pour le plan. */
export function defaultExerciseCatalogue(): ExerciseCatalogue {
  const out: Record<string, ExerciseCatalogue[string]> = {};
  for (const [id, e] of Object.entries(EXERCISES))
    out[id] = { name: { fr: e.name.fr, en: e.name.en }, region: e.region, equip: e.equip };
  return out;
}

/** Références (id → texte court « Auteurs, année ») pour l'affichage. */
export function referenceLabel(id: string): string {
  const r = REFERENCES.find((x) => x.id === id);
  if (!r) return id;
  return `${r.authors}${r.year ? ` (${r.year})` : ''}`;
}

/** Statut de la référence (`verified`, `verified_secondary`, `to_verify`) ; `to_verify` si inconnue. */
export function referenceStatus(id: string): string {
  return REFERENCES.find((x) => x.id === id)?.status ?? 'to_verify';
}
