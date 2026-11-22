/**
 * Évaluation des six déterminants de la marche (Saunders, Inman & Eberhart 1953) et des articulations par phase.
 *
 * Décision clinique : PAS de score global. Pour chaque déterminant et chaque articulation/phase : statut
 * `affected | preserved | uncertain` avec une explication (« ce qui est affecté et ce qui est bien »).
 * Chaque indicateur indique sa vue, sa confiance et s'il s'agit d'une estimation (plan frontal, transverse).
 * Cibles : normes de norms.json quand elles existent (Oberg 1994, Hollman 2011), sinon valeurs de manuel (Perry,
 * phases de norms.json) ; les cibles sans source vérifiée portent `targetStatus: 'to_verify'`.
 */
import { DEFAULT_GAIT_CONFIG, type GaitConfig } from './config.ts';
import { DETERMINANTS, type DeterminantId } from './determinant-ids.ts';
import { metricSource, type FindingResult, type MetricSource } from './rules.ts';
import type { GaitAnalysis, GaitMetric, GaitView, Side } from './types.ts';

export type HealthStatus = 'affected' | 'preserved' | 'uncertain';

export interface IndicatorResult {
  readonly metric: string;
  readonly side?: Side;
  readonly label: string;
  readonly value: number | null;
  readonly unit: string;
  readonly target: string;
  readonly targetRef: string | null;
  readonly targetStatus: 'verified' | 'verified_secondary' | 'to_verify';
  readonly status: HealthStatus;
  readonly explanation: string;
  readonly view: GaitView | null;
  readonly confidence: number;
  readonly estimate: boolean;
}

export interface DeterminantResult {
  readonly id: DeterminantId;
  readonly n: number;
  readonly name_fr: string;
  readonly status: HealthStatus;
  /** Synthèse : ce qui est affecté, ce qui est préservé, ce qui est incertain. */
  readonly explanation: string;
  readonly indicators: readonly IndicatorResult[];
  readonly linkedFindings: readonly { id: string; side: Side; status: string }[];
  readonly restorationGoal: string;
  readonly references: readonly string[];
}

/** Bornes : préservé dans [lo, hi] ; incertain dans la bande ± `band` autour ; affecté au-delà. */
interface Range {
  readonly lo: number;
  readonly hi: number;
  readonly band: number;
}

interface IndicatorSpec {
  readonly metric: string;
  readonly perSide: boolean;
  readonly label: string;
  readonly unit: string;
  readonly target: string;
  readonly ref: string | null;
  readonly targetStatus: IndicatorResult['targetStatus'];
  /** Plage cible (fixe ou issue de la norme z). */
  readonly range: (m: GaitMetric, cfg: GaitConfig) => Range | null;
  /** Indicateur toujours incertain (mesure non validée, ex. rotation pelvienne par la profondeur MediaPipe). */
  readonly alwaysUncertain?: boolean;
}

const fixed =
  (lo: number, hi: number, band: number) =>
  (): Range => ({ lo, hi, band });
const fromNorm =
  (band: (cfg: GaitConfig) => number) =>
  (m: GaitMetric, cfg: GaitConfig): Range | null =>
    m.norm && m.norm.sd !== null
      ? {
          lo: m.norm.mean - cfg.zThreshold * m.norm.sd,
          hi: m.norm.mean + cfg.zThreshold * m.norm.sd,
          band: band(cfg),
        }
      : null;

const IND: Record<DeterminantId, readonly IndicatorSpec[]> = {
  pelvic_rotation: [
    {
      metric: 'pelvic_rotation',
      perSide: false,
      label: 'Rotation pelvienne transverse (repères « monde », profondeur)',
      unit: '°',
      target: '≈ 4° de part et d’autre (Saunders 1953) — non mesurable de façon fiable en 2D',
      ref: 'saunders1953',
      targetStatus: 'to_verify',
      range: fixed(2, 8, 2),
      alwaysUncertain: true,
    },
    {
      metric: 'symmetry_index_step_length',
      perSide: false,
      label: 'Symétrie des longueurs de pas (indicateur indirect)',
      unit: '%',
      target: 'Indice ≤ 5 % (asymétrie > 10 % = proposition de conception)',
      ref: null,
      targetStatus: 'to_verify',
      range: fixed(0, 5, 5),
    },
  ],
  pelvic_list: [
    {
      metric: 'contralateral_pelvic_drop',
      perSide: true,
      label: 'Chute pelvienne controlatérale en appui',
      unit: '°',
      target: '≈ 5° (Saunders 1953 ; norme de marche 2D non vérifiée)',
      ref: 'saunders1953',
      targetStatus: 'to_verify',
      range: (_m, cfg) => ({ lo: 0, hi: 8, band: cfg.doubtBandDeg.frontal }),
    },
    {
      metric: 'pelvic_obliquity_swing',
      perSide: true,
      label: 'Obliquité de l’hémibassin oscillant (négatif = élévation, hip hiking)',
      unit: '°',
      target: '≥ −1,5° (pas d’élévation du bassin oscillant)',
      ref: 'kerrigan2000',
      targetStatus: 'to_verify',
      range: () => ({ lo: -1.5, hi: 20, band: 1.5 }),
    },
  ],
  stance_knee_flexion: [
    {
      metric: 'knee_flexion_loading',
      perSide: true,
      label: 'Flexion du genou en réponse à la charge',
      unit: '°',
      target: 'Moyenne ± 2 ET (Oberg 1994 : ≈ 15–20°)',
      ref: 'oberg1994',
      targetStatus: 'verified',
      range: fromNorm((c) => c.doubtBandDeg.knee),
    },
    {
      metric: 'knee_min_stance',
      perSide: true,
      label: 'Extension du genou en mi-appui/appui terminal',
      unit: '°',
      target: '≈ 0–5° de flexion (manuels)',
      ref: 'physiopedia_gait_cycle',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: 0, hi: 10, band: c.doubtBandDeg.knee }),
    },
  ],
  foot_ankle_rockers: [
    {
      metric: 'ankle_ic',
      perSide: true,
      label: 'Bascule du talon : cheville au contact initial',
      unit: '°',
      target: '≈ 0° (contact par le talon)',
      ref: 'physiopedia_gait_cycle',
      targetStatus: 'verified_secondary',
      range: () => ({ lo: -5, hi: 10, band: 5 }),
    },
    {
      metric: 'peak_ankle_dorsiflexion_stance',
      perSide: true,
      label: 'Bascule de cheville : dorsiflexion maximale en appui',
      unit: '°',
      target: '≈ +10° en appui terminal',
      ref: 'physiopedia_gait_cycle',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: 5, hi: 20, band: c.doubtBandDeg.ankle }),
    },
    {
      metric: 'heel_rise_pct',
      perSide: true,
      label: 'Bascule de l’avant-pied : décollement du talon',
      unit: '%',
      target: 'Appui terminal (31–50 % du cycle ; détection à +2 % de la taille, donc un peu plus tard)',
      ref: 'aapmr_normal_gait',
      targetStatus: 'verified_secondary',
      range: () => ({ lo: 31, hi: 55, band: 6 }),
    },
    {
      metric: 'ankle_pf_preswing',
      perSide: true,
      label: 'Poussée : flexion plantaire en pré-oscillation',
      unit: '°',
      target: '≈ −20° (flexion plantaire)',
      ref: 'degheldere_normal_gait',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: -30, hi: -5, band: c.doubtBandDeg.ankle }),
    },
  ],
  knee_ankle_interaction: [
    {
      metric: 'knee_at_toe_off',
      perSide: true,
      label: 'Flexion du genou au décollement des orteils',
      unit: '°',
      target: '≈ 35–40°',
      ref: 'degheldere_normal_gait',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: 25, hi: 50, band: c.doubtBandDeg.knee }),
    },
    {
      metric: 'peak_knee_flexion_swing',
      perSide: true,
      label: 'Flexion maximale du genou en oscillation',
      unit: '°',
      target: 'Moyenne ± 2 ET (Oberg 1994 : ≈ 63–68°)',
      ref: 'oberg1994',
      targetStatus: 'verified',
      range: fromNorm((c) => c.doubtBandDeg.knee),
    },
    {
      metric: 'ankle_msw',
      perSide: true,
      label: 'Dégagement du pied : cheville en oscillation moyenne',
      unit: '°',
      target: '≥ 0° (neutre) — décision clinique : < 0° anomalie, < −5° confiant',
      ref: 'physiopedia_gait_cycle',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({
        lo: c.footDrop.anomalyBelowDeg,
        hi: 25,
        band: c.footDrop.anomalyBelowDeg - c.footDrop.confidentBelowDeg,
      }),
    },
  ],
  lateral_pelvic_displacement: [
    {
      metric: 'lateral_pelvic_displacement',
      perSide: false,
      label: 'Déplacement latéral du bassin (crête à crête)',
      unit: 'm',
      target: '≈ 4–5 cm (valeur classique, à vérifier)',
      ref: 'saunders1953',
      targetStatus: 'to_verify',
      range: () => ({ lo: 0.01, hi: 0.08, band: 0.02 }),
    },
    {
      metric: 'step_width_mean',
      perSide: false,
      label: 'Largeur de base',
      unit: 'm',
      target: 'Norme ± 2 ET (Hollman 2011, ≥ 70 ans) ; sinon ≤ 15 cm (proposition)',
      ref: 'hollman2011',
      targetStatus: 'to_verify',
      range: (m, c) => fromNorm(() => 0.02)(m, c) ?? { lo: 0.02, hi: 0.15, band: 0.03 },
    },
  ],
};

function classify(v: number, r: Range): HealthStatus {
  if (v >= r.lo && v <= r.hi) return 'preserved';
  if (v >= r.lo - r.band && v <= r.hi + r.band) return 'uncertain';
  return 'affected';
}

const fmt = (v: number, unit: string): string => `${unit === 'm' ? v.toFixed(3) : v.toFixed(1)} ${unit}`;

function indicator(spec: IndicatorSpec, src: MetricSource, side: Side | undefined): IndicatorResult {
  const m = src.get(spec.metric, side);
  const base = {
    metric: spec.metric,
    ...(side ? { side } : {}),
    label: spec.label,
    unit: spec.unit,
    target: spec.target,
    targetRef: spec.ref,
    targetStatus: spec.targetStatus,
  };
  if (!m || m.value === null)
    return {
      ...base,
      value: null,
      status: 'uncertain',
      explanation: `${spec.label}${side ? ` (${side})` : ''} : non mesuré (vue absente ou non mesurable en 2D).`,
      view: null,
      confidence: 0,
      estimate: true,
    };
  const r = spec.range(m, src.config);
  let status: HealthStatus = r ? classify(m.value, r) : 'uncertain';
  if (spec.alwaysUncertain) status = 'uncertain';
  const word = { affected: 'affecté', preserved: 'préservé', uncertain: 'incertain' }[status];
  return {
    ...base,
    value: m.value,
    status,
    explanation: `${spec.label}${side ? ` (${side})` : ''} : ${fmt(m.value, spec.unit)} — ${word} (cible : ${spec.target}${
      m.estimate ? ' ; estimation' : ''
    }).`,
    view: m.view,
    confidence: m.confidence,
    estimate: m.estimate,
  };
}

export function evaluateDeterminants(
  analyses: readonly GaitAnalysis[],
  findings: readonly FindingResult[] = [],
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): DeterminantResult[] {
  const src = metricSource(analyses, config);
  return DETERMINANTS.map((d) => {
    const indicators: IndicatorResult[] = [];
    for (const spec of IND[d.id]) {
      if (spec.perSide) for (const s of ['L', 'R'] as const) indicators.push(indicator(spec, src, s));
      else indicators.push(indicator(spec, src, undefined));
    }
    const linked = findings.filter(
      (f) => f.determinants.includes(d.id) && (f.status === 'probable' || f.status === 'possible'),
    );
    let status: HealthStatus;
    const measured = indicators.filter((i) => i.value !== null);
    if (indicators.some((i) => i.status === 'affected') || linked.some((f) => f.status === 'probable'))
      status = 'affected';
    else if (!measured.length || indicators.some((i) => i.status === 'uncertain' && i.value !== null) || linked.length)
      status = 'uncertain';
    else status = 'preserved';
    const list = (s: HealthStatus): string =>
      indicators
        .filter((i) => i.status === s && (s !== 'uncertain' || i.value !== null))
        .map((i) => `${i.label}${i.side ? ` (${i.side})` : ''}`)
        .join(' ; ');
    const parts: string[] = [];
    const aff = list('affected');
    const pre = list('preserved');
    const unc = list('uncertain');
    if (aff) parts.push(`Affecté : ${aff}.`);
    if (linked.length)
      parts.push(`Défauts liés : ${linked.map((f) => `${f.name_fr} (${f.side}, ${f.status})`).join(' ; ')}.`);
    if (pre) parts.push(`Préservé : ${pre}.`);
    if (unc) parts.push(`Incertain : ${unc}.`);
    if (!measured.length) parts.push('Non mesuré : enregistrer la vue appropriée (ou non mesurable en 2D).');
    return {
      id: d.id,
      n: d.n,
      name_fr: d.name_fr,
      status,
      explanation: parts.join(' '),
      indicators,
      linkedFindings: linked.map((f) => ({ id: f.id, side: f.side, status: f.status })),
      restorationGoal: d.restoration_fr,
      references: ['saunders1953', ...new Set(IND[d.id].map((s) => s.ref).filter((r): r is string => r !== null))],
    };
  });
}

// ------------------------------------------------------------------------------------------------ Articulations × phases

export interface JointPhaseResult {
  readonly joint: 'hip' | 'knee' | 'ankle' | 'pelvis' | 'trunk';
  readonly phase: string;
  readonly side: Side;
  readonly indicator: IndicatorResult;
}

const JOINT_PHASES: readonly { joint: JointPhaseResult['joint']; phase: string; spec: IndicatorSpec }[] = [
  {
    joint: 'hip',
    phase: 'IC',
    spec: {
      metric: 'hip_ic',
      perSide: true,
      label: 'Hanche au contact initial (cuisse–verticale)',
      unit: '°',
      target: '≈ 20° (Perry, cuisse–verticale)',
      ref: 'perry2010',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: 15, hi: 30, band: c.doubtBandDeg.hip }),
    },
  },
  {
    joint: 'hip',
    phase: 'TSt',
    spec: {
      metric: 'peak_hip_extension',
      perSide: true,
      label: 'Extension maximale de hanche en appui terminal',
      unit: '°',
      target: '≈ −10° à −20° (extension apparente, Perry)',
      ref: 'perry2010',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: -25, hi: -3, band: c.doubtBandDeg.hip }),
    },
  },
  {
    joint: 'hip',
    phase: 'MSw',
    spec: {
      metric: 'peak_hip_flexion_swing',
      perSide: true,
      label: 'Flexion maximale de hanche en oscillation',
      unit: '°',
      target: '≈ 25–30°',
      ref: 'physiopedia_gait_cycle',
      targetStatus: 'verified_secondary',
      range: (_m, c) => ({ lo: 22, hi: 38, band: c.doubtBandDeg.hip }),
    },
  },
  { joint: 'knee', phase: 'LR', spec: IND.stance_knee_flexion[0]! },
  { joint: 'knee', phase: 'MSt–TSt', spec: IND.stance_knee_flexion[1]! },
  { joint: 'knee', phase: 'PSw', spec: IND.knee_ankle_interaction[0]! },
  { joint: 'knee', phase: 'ISw', spec: IND.knee_ankle_interaction[1]! },
  { joint: 'ankle', phase: 'IC', spec: IND.foot_ankle_rockers[0]! },
  { joint: 'ankle', phase: 'TSt', spec: IND.foot_ankle_rockers[1]! },
  { joint: 'ankle', phase: 'PSw', spec: IND.foot_ankle_rockers[3]! },
  { joint: 'ankle', phase: 'MSw', spec: IND.knee_ankle_interaction[2]! },
  { joint: 'pelvis', phase: 'MSt', spec: IND.pelvic_list[0]! },
  {
    joint: 'trunk',
    phase: 'MSt',
    spec: {
      metric: 'trunk_lateral_lean_toward_stance',
      perSide: true,
      label: 'Inclinaison latérale du tronc vers l’appui',
      unit: '°',
      target: 'Faible et symétrique (pas de norme vérifiée)',
      ref: null,
      targetStatus: 'to_verify',
      range: (_m, c) => ({ lo: -3, hi: 3, band: c.doubtBandDeg.frontal }),
    },
  },
];

export function evaluateJointPhases(
  analyses: readonly GaitAnalysis[],
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): JointPhaseResult[] {
  const src = metricSource(analyses, config);
  const out: JointPhaseResult[] = [];
  for (const jp of JOINT_PHASES)
    for (const side of ['L', 'R'] as const)
      out.push({ joint: jp.joint, phase: jp.phase, side, indicator: indicator(jp.spec, src, side) });
  return out;
}
