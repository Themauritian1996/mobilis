/**
 * Domaine « gait » — NOUVEAU : capture 3 vues, événements, cycles, métriques, normes, règles, résultats.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Outil d'évaluation clinique — non homologué Santé Canada. Données cliniques : data/ (fichiers typés, sourcés).
 * Moteur PUR (aucune interface, caméra ni DOM) : voir README.md.
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'gait',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;

export type * from './types.ts';
export { DEFAULT_GAIT_CONFIG, withConfig, type GaitConfig } from './config.ts';
export {
  analyzeGait,
  measureCustomAngle,
  prepareRecording,
  type CustomAngleDefinition,
  type CustomAngleResult,
  type PreparedRecording,
} from './analyze.ts';
export {
  assessGait,
  compareAssessments,
  DISCLAIMER,
  evaluateFindings,
  flagLimitingFactors,
  measurementError,
  type DeterminantDelta,
  type GaitAssessment,
  type GaitComparison,
  type MetricDelta,
} from './assess.ts';
export {
  evaluateDeterminants,
  evaluateJointPhases,
  type DeterminantResult,
  type HealthStatus,
  type IndicatorResult,
  type JointPhaseResult,
} from './determinants.ts';
export { DETERMINANTS, restorationGoals, type DeterminantId, type DeterminantInfo } from './determinant-ids.ts';
export {
  evaluateCriterion,
  evaluateFinding,
  metricSource,
  normZ,
  pick,
  sideDelta,
  sideRatioPct,
  threshold,
  type CriterionResult,
  type CriterionSpec,
  type FindingDefinition,
  type FindingResult,
  type FindingStatus,
  type MetricSource,
} from './rules.ts';
export { GAIT_FINDINGS } from './data/findings.ts';
export { NORMS, normFor, PHASES, REFERENCES, reference, type NormValue } from './data/norms.ts';
export { WINTER_PROPORTIONS } from './calibration.ts';
export { butterworthLowPass, filtfilt, interpolateGaps, lowPass } from './signal.ts';
export { LM } from './landmarks.ts';
