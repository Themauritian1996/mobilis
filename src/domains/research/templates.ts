/**
 * Gabarits de protocoles (spec v2 §7) : points de départ MODIFIABLES par le clinicien. Les choix de mesures sont des
 * propositions de l'équipe, pas des recommandations validées (`status: 'to_verify'`) ; aucun seuil clinique ici.
 */
import type { Intervention, MeasureDefinition, Timepoint } from '../../core/types/clinical.ts';
import { PAIN_METRIC_ID } from './measures.ts';

export interface Bi {
  readonly fr: string;
  readonly en: string;
}

export interface ProtocolTemplate {
  readonly id: string;
  readonly name: Bi;
  readonly description: Bi;
  readonly interventionType: Intervention['type'];
  readonly measures: readonly MeasureDefinition[];
  readonly timepoints: readonly Timepoint[];
  readonly conditions: readonly string[];
  readonly status: 'to_verify';
}

const tp = (id: string, label: string, offsetDays: number): Timepoint => ({ id, label, offsetDays });
const W = (n: number): number => n * 7;

const T0 = tp('t0', 'T0', 0);
const pain: MeasureDefinition = { id: 'pain', kind: 'prom', label: 'Douleur (EVA/ENS 0–10)', metricId: PAIN_METRIC_ID };
const speed: MeasureDefinition = {
  id: 'gait_speed',
  kind: 'gait_metric_at_phase',
  label: 'Vitesse de marche',
  metricId: 'gait_speed',
};

export const PROTOCOL_TEMPLATES: readonly ProtocolTemplate[] = [
  {
    id: 'botox',
    name: { fr: 'Infiltration de toxine botulique', en: 'Botulinum toxin injection' },
    description: {
      fr: 'Marche (cheville au contact initial et en oscillation moyenne, genou en oscillation), amplitude de la cheville, à T0, +2, +6 et +12 semaines.',
      en: 'Gait (ankle at initial contact and mid swing, knee in swing), ankle ROM, at T0, +2, +6 and +12 weeks.',
    },
    interventionType: 'botulinum_toxin',
    measures: [
      speed,
      { id: 'ankle_ic_L', kind: 'gait_metric_at_phase', label: 'Cheville au contact initial (G)', metricId: 'ankle_ic', phase: 'IC', side: 'left' },
      { id: 'ankle_msw_L', kind: 'gait_metric_at_phase', label: 'Cheville en oscillation moyenne (G)', metricId: 'ankle_msw', phase: 'MSw', side: 'left' },
      { id: 'knee_swing_L', kind: 'gait_metric_at_phase', label: 'Flexion max. du genou en oscillation (G)', metricId: 'peak_knee_flexion_swing', side: 'left' },
      { id: 'ankle_curve_L', kind: 'gait_curve', label: 'Courbe de la cheville (G)', metricId: 'ankle_angle', side: 'left' },
      { id: 'rom_an_df_L', kind: 'rom', label: 'Dorsiflexion de la cheville (G)', metricId: 'an_df', side: 'left' },
    ],
    timepoints: [T0, tp('w2', 'T+2 sem', W(2)), tp('w6', 'T+6 sem', W(6)), tp('w12', 'T+12 sem', W(12))],
    conditions: ['Sans orthèse', 'Avec orthèse (AFO)'],
    status: 'to_verify',
  },
  {
    id: 'prosthesis',
    name: { fr: 'Ajustement de prothèse (avant/après)', en: 'Prosthetic adjustment (before/after)' },
    description: {
      fr: 'Vitesse, symétrie des pas, temps d’appui et courbe du genou avant et après l’ajustement.',
      en: 'Speed, step symmetry, stance time and knee curve before and after the adjustment.',
    },
    interventionType: 'prosthetic_adjustment',
    measures: [
      speed,
      { id: 'step_sym', kind: 'gait_metric_at_phase', label: 'Symétrie de longueur de pas', metricId: 'symmetry_index_step_length' },
      { id: 'stance_sym', kind: 'gait_metric_at_phase', label: 'Symétrie du temps d’appui', metricId: 'symmetry_index_stance_time' },
      { id: 'trunk_lean', kind: 'gait_metric_at_phase', label: 'Inclinaison latérale du tronc (estimation)', metricId: 'trunk_lateral_lean_toward_stance', phase: 'MSt', side: 'left' },
      { id: 'knee_curve_L', kind: 'gait_curve', label: 'Courbe du genou (G)', metricId: 'knee_angle', side: 'left' },
    ],
    timepoints: [tp('before', 'Avant', 0), tp('after', 'Après', 0)],
    conditions: ['Réglage initial', 'Après ajustement'],
    status: 'to_verify',
  },
  {
    id: 'msk_injection',
    name: { fr: 'Infiltration pour douleur MSK', en: 'MSK pain injection' },
    description: {
      fr: 'Douleur, questionnaire de douleur (ENS) et amplitude à T0, +2 et +6 semaines.',
      en: 'Pain, pain questionnaire (NPRS) and ROM at T0, +2 and +6 weeks.',
    },
    interventionType: 'medication',
    measures: [
      pain,
      { id: 'prom_nprs', kind: 'prom', label: 'Questionnaire de douleur (ENS)', metricId: 'nprs' },
      { id: 'rom_sh_abd_R', kind: 'rom', label: 'Abduction de l’épaule (D)', metricId: 'sh_abd', side: 'right' },
    ],
    timepoints: [T0, tp('w2', 'T+2 sem', W(2)), tp('w6', 'T+6 sem', W(6))],
    conditions: [],
    status: 'to_verify',
  },
  {
    id: 'stroke',
    name: { fr: 'Suivi post-AVC', en: 'Post-stroke follow-up' },
    description: {
      fr: 'Vitesse, cheville en oscillation, genou et hanche, à T0, +1, +3 et +6 mois.',
      en: 'Speed, ankle in swing, knee and hip, at T0, +1, +3 and +6 months.',
    },
    interventionType: 'other',
    measures: [
      speed,
      { id: 'ankle_msw_L', kind: 'gait_metric_at_phase', label: 'Cheville en oscillation moyenne (G)', metricId: 'ankle_msw', phase: 'MSw', side: 'left' },
      { id: 'knee_swing_L', kind: 'gait_metric_at_phase', label: 'Flexion max. du genou en oscillation (G)', metricId: 'peak_knee_flexion_swing', side: 'left' },
      { id: 'hip_ext_L', kind: 'gait_metric_at_phase', label: 'Extension max. de hanche en appui terminal (G)', metricId: 'peak_hip_extension', phase: 'TSt', side: 'left' },
      { id: 'step_sym', kind: 'gait_metric_at_phase', label: 'Symétrie de longueur de pas', metricId: 'symmetry_index_step_length' },
    ],
    timepoints: [T0, tp('m1', 'T+1 mois', 30), tp('m3', 'T+3 mois', 91), tp('m6', 'T+6 mois', 182)],
    conditions: ['Sans aide technique', 'Avec aide technique'],
    status: 'to_verify',
  },
  {
    id: 'surgery',
    name: { fr: 'Après chirurgie', en: 'After surgery' },
    description: {
      fr: 'Douleur, questionnaire et amplitude du genou à T0, +2, +6, +12 semaines et +6 mois.',
      en: 'Pain, questionnaire and knee ROM at T0, +2, +6, +12 weeks and +6 months.',
    },
    interventionType: 'surgery',
    measures: [
      pain,
      { id: 'prom_nprs', kind: 'prom', label: 'Questionnaire de douleur (ENS)', metricId: 'nprs' },
      { id: 'rom_kn_flex_R', kind: 'rom', label: 'Flexion du genou (D)', metricId: 'kn_flex', side: 'right' },
    ],
    timepoints: [T0, tp('w2', 'T+2 sem', W(2)), tp('w6', 'T+6 sem', W(6)), tp('w12', 'T+12 sem', W(12)), tp('m6', 'T+6 mois', 182)],
    conditions: [],
    status: 'to_verify',
  },
];

export const templateById = (id: string | undefined): ProtocolTemplate | undefined =>
  PROTOCOL_TEMPLATES.find((t) => t.id === id);

/** Gabarit suggéré pour un type d'intervention (premier qui correspond). */
export const templateForIntervention = (type: Intervention['type']): ProtocolTemplate | undefined =>
  PROTOCOL_TEMPLATES.find((t) => t.interventionType === type);
