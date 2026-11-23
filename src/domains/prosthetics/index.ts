/**
 * Domaine « prosthetics » — NOUVEAU : amputés et prothèses (métriques, déviations, causes possibles, conseils).
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Suggestions fondées sur la littérature, à valider par l'équipe (prothésiste, physiatre).
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'prosthetics',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;

export {
  assessProstheticGait,
  catalogLevel,
  PROSTHETIC_CATALOG,
  PROSTHETIC_DEVIATIONS,
  type ProstheticAssessment,
} from './deviations.ts';
export {
  compareProstheticAssessments,
  isRetained,
  stateOf,
  type DeviationChange,
  type DeviationDelta,
  type DeviationState,
  type ProstheticComparison,
} from './compare.ts';
export {
  buildChecklist,
  buildProstheticReport,
  causeGroups,
  fmtNumber,
  formatValue,
  parseProstheticAssessment,
  prostheticHistory,
  summarize,
  validateProfile,
  CAUSE_ORDER,
  PROSTHESIS_LEVELS,
  PROSTHESIS_SIDES,
  type Checklist,
  type ChecklistItem,
  type Lang,
  type DeviationReport,
  type ProstheticReport,
} from './report.ts';
