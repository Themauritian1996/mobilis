/**
 * Domaine « treatment » — NOUVEAU : plans de traitement issus des défauts, aides techniques.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Le clinicien ajoute / retire / modifie chaque action ; rien n'est appliqué automatiquement.
 * Outil d'évaluation clinique — non homologué Santé Canada. Suggestions fondées sur la littérature, à valider par le clinicien.
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'treatment',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;

export type * from './types.ts';
export { BANNER, SUGGESTION_NOTICE } from './types.ts';
export { defaultCatalogues, defaultExerciseCatalogue, referenceLabel, referenceStatus } from './catalogues.ts';
export { audienceOf, PATIENT_KINDS, proposePlan, SIDE_FR } from './propose.ts';
export { metricIn, planSourceOf } from './source.ts';
export {
  errorOf,
  gapTo,
  goalValue,
  trackGoal,
  trackGoals,
  type GoalPoint,
  type GoalProgress,
  type GoalStatus,
} from './goals.ts';
export * from './plan.ts';
export * from './devices.ts';
