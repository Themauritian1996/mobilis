/**
 * Vocabulaire des mesures de recherche et de suivi (spec v2 §7, §10.8) — fonctions pures.
 *
 * Le type partagé `MeasureDefinition` (core/types/clinical.ts) est volontairement minimal ; ce module fixe les
 * conventions d'encodage, utilisées par le constructeur de protocole, la capture de marche et l'agrégation :
 *
 * | kind                   | metricId                                   | phase                     | side          |
 * |------------------------|--------------------------------------------|---------------------------|---------------|
 * | `gait_metric_at_phase` | id d'une métrique du moteur (`ankle_ic`) ou `curve:<courbe>` (`curve:ankle_angle`) | phase de Perry (`IC`…) ou `pct:NN` (obligatoire avec `curve:`) | left / right / none |
 * | `gait_curve`           | id d'une courbe du moteur (`ankle_angle`)  | —                         | left / right  |
 * | `rom`                  | id d'un test d'amplitude (`an_df`)         | —                         | left / right / none |
 * | `prom`                 | id d'un questionnaire (`nprs`) ou `pain_nrs` (échelle de douleur 0–10 à un item) | — | — |
 * | `custom_angle`         | —                                          | phase de Perry ou `pct:NN`| left / right  |
 *
 * L'échelle de douleur (EVA/ENS 0–10) est encodée `kind: 'pain', metricId: 'pain_nrs'`. L'ancien encodage
 * `kind: 'prom', metricId: 'pain_nrs'` (études déjà enregistrées) reste lu partout via `isPainMeasure`.
 */
import type { MeasureDefinition, Side } from '../../core/types/clinical.ts';
import type { CustomAngleDefinition, PerryPhaseId } from '../gait/index.ts';

export const PAIN_METRIC_ID = 'pain_nrs';
/** Mesure de douleur 0–10 : nouvel encodage (`pain`) ou ancien (`prom` + `pain_nrs`). */
export const isPainMeasure = (m: Pick<MeasureDefinition, 'kind' | 'metricId'>): boolean =>
  m.kind === 'pain' || (m.kind === 'prom' && m.metricId === PAIN_METRIC_ID);

export const CURVE_PREFIX = 'curve:';
export const PCT_PREFIX = 'pct:';

export const PERRY_PHASES: readonly PerryPhaseId[] = ['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];

/** Phase de Perry ou pourcentage du cycle (0–100). */
export type PhaseOrPct = PerryPhaseId | number;

export function encodePhase(p: PhaseOrPct): string {
  return typeof p === 'number' ? `${PCT_PREFIX}${Math.round(Math.max(0, Math.min(100, p)))}` : p;
}

export function decodePhase(s: string | undefined): PhaseOrPct | null {
  if (!s) return null;
  if (s.startsWith(PCT_PREFIX)) {
    const n = Number(s.slice(PCT_PREFIX.length));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  return (PERRY_PHASES as readonly string[]).includes(s) ? (s as PerryPhaseId) : null;
}

export const toGaitSide = (s: Side | undefined): 'L' | 'R' | undefined =>
  s === 'left' ? 'L' : s === 'right' ? 'R' : undefined;
export const fromGaitSide = (s: 'L' | 'R' | undefined): Side => (s === 'L' ? 'left' : s === 'R' ? 'right' : 'none');

/**
 * Mesure personnalisée → définition attendue par `measureCustomAngle` du moteur de marche (capture).
 * `null` si la mesure n'est pas un angle personnalisé complet (3 repères, côté G/D, phase ou %).
 */
export function toCustomAngleDefinition(m: MeasureDefinition): CustomAngleDefinition | null {
  if (m.kind !== 'custom_angle' || !m.landmarks) return null;
  const side = toGaitSide(m.side);
  const at = decodePhase(m.phase);
  if (!side || at === null) return null;
  const [a, b, c] = m.landmarks;
  if (![a, b, c].every((k) => Number.isInteger(k) && k >= 0 && k < 33) || new Set([a, b, c]).size !== 3) return null;
  return { id: m.id, a, b, c, side, at, reference: 'raw' };
}

/** Repères du squelette proposés sur le schéma cliquable (indices MediaPipe Pose, position du schéma 0–100). */
export interface SkeletonPoint {
  readonly index: number;
  readonly key: string;
  readonly x: number;
  readonly y: number;
}

/** Schéma de face (le côté gauche du patient est à droite de l'image). */
export const SKELETON_POINTS: readonly SkeletonPoint[] = [
  { index: 0, key: 'nose', x: 50, y: 8 },
  { index: 11, key: 'leftShoulder', x: 62, y: 22 },
  { index: 12, key: 'rightShoulder', x: 38, y: 22 },
  { index: 13, key: 'leftElbow', x: 68, y: 36 },
  { index: 14, key: 'rightElbow', x: 32, y: 36 },
  { index: 15, key: 'leftWrist', x: 71, y: 49 },
  { index: 16, key: 'rightWrist', x: 29, y: 49 },
  { index: 23, key: 'leftHip', x: 57, y: 50 },
  { index: 24, key: 'rightHip', x: 43, y: 50 },
  { index: 25, key: 'leftKnee', x: 58, y: 70 },
  { index: 26, key: 'rightKnee', x: 42, y: 70 },
  { index: 27, key: 'leftAnkle', x: 58, y: 88 },
  { index: 28, key: 'rightAnkle', x: 42, y: 88 },
  { index: 29, key: 'leftHeel', x: 56, y: 93 },
  { index: 30, key: 'rightHeel', x: 44, y: 93 },
  { index: 31, key: 'leftFootIndex', x: 64, y: 95 },
  { index: 32, key: 'rightFootIndex', x: 36, y: 95 },
];

export const SKELETON_BONES: readonly (readonly [number, number])[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
];

/** Métriques du moteur proposées dans le constructeur (articulation × phase, spatio-temporel). */
export interface GaitMetricOption {
  readonly metricId: string;
  readonly group: 'ankle' | 'knee' | 'hip' | 'trunk' | 'spatiotemporal' | 'symmetry' | 'frontal';
  /** Phase de Perry indicative (affichage), ou `null` pour une valeur sur le cycle entier. */
  readonly phase: PerryPhaseId | null;
  readonly unit: string;
  readonly sided: boolean;
}

export const GAIT_METRIC_OPTIONS: readonly GaitMetricOption[] = [
  { metricId: 'ankle_ic', group: 'ankle', phase: 'IC', unit: '°', sided: true },
  { metricId: 'ankle_lr_min', group: 'ankle', phase: 'LR', unit: '°', sided: true },
  { metricId: 'ankle_mst', group: 'ankle', phase: 'MSt', unit: '°', sided: true },
  { metricId: 'peak_ankle_dorsiflexion_stance', group: 'ankle', phase: 'TSt', unit: '°', sided: true },
  { metricId: 'ankle_pf_preswing', group: 'ankle', phase: 'PSw', unit: '°', sided: true },
  { metricId: 'ankle_msw', group: 'ankle', phase: 'MSw', unit: '°', sided: true },
  { metricId: 'knee_ic', group: 'knee', phase: 'IC', unit: '°', sided: true },
  { metricId: 'knee_flexion_loading', group: 'knee', phase: 'LR', unit: '°', sided: true },
  { metricId: 'knee_min_stance', group: 'knee', phase: 'TSt', unit: '°', sided: true },
  { metricId: 'knee_at_toe_off', group: 'knee', phase: 'PSw', unit: '°', sided: true },
  { metricId: 'peak_knee_flexion_swing', group: 'knee', phase: 'ISw', unit: '°', sided: true },
  { metricId: 'hip_ic', group: 'hip', phase: 'IC', unit: '°', sided: true },
  { metricId: 'peak_hip_extension', group: 'hip', phase: 'TSt', unit: '°', sided: true },
  { metricId: 'peak_hip_flexion_swing', group: 'hip', phase: 'TSw', unit: '°', sided: true },
  { metricId: 'hip_rom', group: 'hip', phase: null, unit: '°', sided: true },
  { metricId: 'trunk_inclination', group: 'trunk', phase: null, unit: '°', sided: true },
  { metricId: 'gait_speed', group: 'spatiotemporal', phase: null, unit: 'm/s', sided: false },
  { metricId: 'cadence', group: 'spatiotemporal', phase: null, unit: 'pas/min', sided: false },
  { metricId: 'step_length', group: 'spatiotemporal', phase: null, unit: 'm', sided: true },
  { metricId: 'stride_length', group: 'spatiotemporal', phase: null, unit: 'm', sided: true },
  { metricId: 'stance_pct', group: 'spatiotemporal', phase: null, unit: '%', sided: true },
  { metricId: 'double_support_pct', group: 'spatiotemporal', phase: null, unit: '%', sided: true },
  { metricId: 'step_time', group: 'spatiotemporal', phase: null, unit: 's', sided: true },
  { metricId: 'symmetry_index_step_length', group: 'symmetry', phase: null, unit: '%', sided: false },
  { metricId: 'symmetry_index_stance_time', group: 'symmetry', phase: null, unit: '%', sided: false },
  { metricId: 'contralateral_pelvic_drop', group: 'frontal', phase: 'LR', unit: '°', sided: true },
  { metricId: 'trunk_lateral_lean_toward_stance', group: 'frontal', phase: 'MSt', unit: '°', sided: true },
  { metricId: 'step_width_mean', group: 'frontal', phase: null, unit: 'm', sided: false },
];

/** Courbes du moteur (vue latérale), moyennes sur le cycle normalisé 0–100 %. */
export const GAIT_CURVE_IDS = ['hip_angle', 'knee_angle', 'ankle_angle', 'trunk_angle'] as const;

/** Unité attendue d'une mesure (affichage, export). Les questionnaires renvoient « points ». */
export function measureUnit(m: MeasureDefinition): string {
  switch (m.kind) {
    case 'gait_metric_at_phase': {
      if (m.metricId?.startsWith(CURVE_PREFIX)) return '°';
      return GAIT_METRIC_OPTIONS.find((o) => o.metricId === m.metricId)?.unit ?? '';
    }
    case 'gait_curve':
    case 'custom_angle':
      return '°';
    case 'rom':
      return '°';
    case 'pain':
      return '/10';
    case 'prom':
      return isPainMeasure(m) ? '/10' : 'points';
  }
}

/** Mesure à capturer par une analyse de marche (`#/marche/<patientId>`). */
export const isGaitMeasure = (m: MeasureDefinition): boolean =>
  m.kind === 'gait_metric_at_phase' || m.kind === 'gait_curve' || m.kind === 'custom_angle';

/** Clé stable d'une mesure pour regrouper (même id = même mesure). */
export const measureKey = (m: MeasureDefinition): string => m.id;

/** Contrôle de cohérence d'une mesure (constructeur) : liste de problèmes, vide si valide. */
export function validateMeasure(m: MeasureDefinition): string[] {
  const p: string[] = [];
  if (!m.id) p.push('id');
  if (!m.label.trim()) p.push('label');
  switch (m.kind) {
    case 'gait_metric_at_phase':
      if (!m.metricId) p.push('metricId');
      else if (m.metricId.startsWith(CURVE_PREFIX) && decodePhase(m.phase) === null) p.push('phase');
      break;
    case 'gait_curve':
      if (!m.metricId) p.push('metricId');
      if (!toGaitSide(m.side)) p.push('side');
      break;
    case 'rom':
    case 'prom':
      if (!m.metricId) p.push('metricId');
      break;
    case 'pain':
      break;
    case 'custom_angle':
      if (!toCustomAngleDefinition(m)) p.push('custom');
      break;
  }
  return p;
}
