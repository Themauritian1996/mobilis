/**
 * Moteur de règles transparent (spec v2 §4.5) : métriques → défauts probables, avec « pourquoi », causes, suggestions
 * orientées vers la restauration des déterminants de la marche, références et validation clinique obligatoire.
 *
 * Schéma (décisions cliniques du 22 nov. 2026) : chaque critère a un seuil d'ANOMALIE et un seuil « CONFIANT » ; entre
 * les deux = « doute ». Le critère doit être présent dans ≥ `minCycleAgreement` des cycles (≥ `minCyclesPerSide`
 * cycles valides). Les signes compensatoires (autres articulations, autres vues) augmentent la confiance ; les signes
 * contraires la réduisent. Aucune boîte noire : tous les seuils, valeurs et sources sont rendus.
 */
import { DEFAULT_GAIT_CONFIG, type GaitConfig } from './config.ts';
import type { DeterminantId } from './determinant-ids.ts';
import type { GaitAnalysis, GaitMetric, GaitView, Side, ThresholdType } from './types.ts';

export type CriterionStatus = 'confident' | 'doubt' | 'absent' | 'unavailable';
export type CriterionRole = 'primary' | 'required' | 'supporting' | 'compensation' | 'contrary';

/** Accès aux métriques fusionnées de plusieurs vues. */
export interface MetricSource {
  get(id: string, side?: Side): GaitMetric | undefined;
  readonly views: readonly GaitView[];
  readonly config: GaitConfig;
}

export interface CriterionSpec {
  readonly id: string;
  readonly role: CriterionRole;
  /** Texte du critère (français), affiché comme « pourquoi ». */
  readonly text: string;
  readonly metric: string;
  readonly thresholdType: ThresholdType;
  readonly status?: 'to_verify';
  readonly refs: readonly string[];
  /** Évaluation : valeur testée et seuils (anomalie / confiant), sens de la comparaison. */
  readonly evaluate: (src: MetricSource, side: Side) => CriterionValue | null;
}

export interface CriterionValue {
  readonly value: number;
  readonly anomaly: number;
  readonly confident: number;
  readonly direction: 'below' | 'above';
  /** Valeurs par cycle (pour la concordance), si disponibles. */
  readonly perCycle?: readonly number[];
  readonly confidence: number;
  readonly estimate: boolean;
  readonly unit: string;
}

export interface CriterionResult {
  readonly id: string;
  readonly role: CriterionRole;
  readonly text: string;
  readonly metric: string;
  readonly side: Side;
  readonly value: number | null;
  readonly unit: string;
  readonly anomalyThreshold: number | null;
  readonly confidentThreshold: number | null;
  readonly status: CriterionStatus;
  /** Fraction des cycles où le seuil d'anomalie est franchi. */
  readonly cycleAgreement: number | null;
  readonly thresholdType: ThresholdType;
  readonly thresholdStatus: 'published' | 'norm_relative' | 'proposed_heuristic' | 'to_verify';
  readonly refs: readonly string[];
  readonly estimate: boolean;
}

export type FindingStatus = 'probable' | 'possible' | 'absent' | 'insufficient_data' | 'observe';

export interface FindingResult {
  readonly id: string;
  readonly kind: 'gait' | 'prosthetic';
  readonly name_fr: string;
  readonly name_en: string;
  readonly side: Side;
  readonly status: FindingStatus;
  /** Confiance du défaut 0–1 (ce n'est PAS un score global de marche). */
  readonly score: number;
  /** Critères remplis : le « pourquoi ». */
  readonly why: readonly CriterionResult[];
  readonly criteria: readonly CriterionResult[];
  readonly causes: readonly string[];
  readonly differentials: readonly string[];
  /** Suggestions : d'abord la restauration du/des déterminant(s) altéré(s), puis la prise en charge de la littérature. */
  readonly suggestions: readonly string[];
  readonly references: readonly string[];
  readonly determinants: readonly DeterminantId[];
  readonly evidenceLevel: string | null;
  readonly camera2dLimits: string | null;
  /** Seuils non publiés ou à vérifier utilisés par ce défaut (à trancher par le clinicien). */
  readonly unvalidatedThresholds: readonly { criterion: string; type: 'proposed_heuristic' | 'to_verify' }[];
  readonly estimate: boolean;
  readonly requiresClinicianValidation: true;
  readonly audience: 'clinician' | 'patient_and_clinician';
}

export interface FindingDefinition {
  readonly id: string;
  readonly kind: 'gait' | 'prosthetic';
  readonly name_fr: string;
  readonly name_en: string;
  readonly criteria: readonly CriterionSpec[];
  readonly determinants: readonly DeterminantId[];
  readonly causes: readonly string[];
  readonly differentials: readonly string[];
  readonly management: readonly string[];
  readonly refs: readonly string[];
  readonly evidenceLevel: string | null;
  readonly camera2dLimits: string | null;
  /** Défaut non mesurable de façon fiable en 2D : produit une alerte « à observer » (estimate). */
  readonly observeOnly?: boolean;
  readonly audience: 'clinician' | 'patient_and_clinician';
  /** Défaut global (ex. vitesse) : évalué une fois, rapporté côté « L » par convention, `side` ignoré. */
  readonly global?: boolean;
}

// ------------------------------------------------------------------------------------------------ Sources

/** Fusionne les métriques de plusieurs analyses : pour chaque (id, côté), la plus confiante. */
export function metricSource(
  analyses: readonly GaitAnalysis[],
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): MetricSource {
  const best = new Map<string, GaitMetric>();
  for (const a of analyses)
    for (const m of a.metrics) {
      if (m.value === null) continue;
      const k = `${m.id}|${m.side ?? ''}`;
      const cur = best.get(k);
      if (!cur || m.confidence > cur.confidence) best.set(k, m);
    }
  return {
    get: (id, side) => best.get(`${id}|${side ?? ''}`),
    views: analyses.map((a) => a.view),
    config,
  };
}

export const OTHER_SIDE: Record<Side, Side> = { L: 'R', R: 'L' };

// ------------------------------------------------------------------------------------------------ Fabriques de critères

type Getter = (src: MetricSource, side: Side) => GaitMetric | undefined;
const self =
  (id: string): Getter =>
  (s, side) =>
    s.get(id, side);
const other =
  (id: string): Getter =>
  (s, side) =>
    s.get(id, OTHER_SIDE[side]);
const global =
  (id: string): Getter =>
  (s) =>
    s.get(id);

export const pick = { self, other, global };

/** Critère « valeur < seuil » (ou « > » avec direction 'above'), seuils fixes. */
export function threshold(
  getter: Getter,
  direction: 'below' | 'above',
  anomaly: number | ((src: MetricSource, side: Side) => number | null),
  confident: number | ((src: MetricSource, side: Side, anomaly: number) => number | null),
): CriterionSpec['evaluate'] {
  return (src, side) => {
    const m = getter(src, side);
    if (!m || m.value === null) return null;
    const a = typeof anomaly === 'number' ? anomaly : anomaly(src, side);
    if (a === null) return null;
    const c = typeof confident === 'number' ? confident : confident(src, side, a);
    if (c === null) return null;
    return {
      value: m.value,
      anomaly: a,
      confident: c,
      direction,
      ...(m.perCycle ? { perCycle: m.perCycle } : {}),
      confidence: m.confidence,
      estimate: m.estimate,
      unit: m.unit,
    };
  };
}

/** Critère sur la différence côté − autre côté (ex. « > côté sain + 3° »). */
export function sideDelta(
  id: string,
  direction: 'below' | 'above',
  anomaly: number,
  confident: number,
  transform: (v: number) => number = (v) => v,
): CriterionSpec['evaluate'] {
  return (src, side) => {
    const a = src.get(id, side);
    const b = src.get(id, OTHER_SIDE[side]);
    if (!a || !b || a.value === null || b.value === null) return null;
    const bv = transform(b.value);
    return {
      value: transform(a.value) - bv,
      anomaly,
      confident,
      direction,
      ...(a.perCycle ? { perCycle: a.perCycle.map((v) => transform(v) - bv) } : {}),
      confidence: Math.min(a.confidence, b.confidence),
      estimate: a.estimate || b.estimate,
      unit: a.unit,
    };
  };
}

/** Critère relatif (%) : (côté − autre) / autre × 100. */
export function sideRatioPct(
  id: string,
  direction: 'below' | 'above',
  anomaly: number,
  confident: number,
  swap = false,
): CriterionSpec['evaluate'] {
  return (src, side) => {
    const s1 = swap ? OTHER_SIDE[side] : side;
    const a = src.get(id, s1);
    const b = src.get(id, OTHER_SIDE[s1]);
    if (!a || !b || a.value === null || b.value === null || b.value === 0) return null;
    const f = (v: number): number => ((v - b.value!) / Math.abs(b.value!)) * 100;
    return {
      value: f(a.value),
      anomaly,
      confident,
      direction,
      ...(a.perCycle ? { perCycle: a.perCycle.map(f) } : {}),
      confidence: Math.min(a.confidence, b.confidence),
      estimate: a.estimate || b.estimate,
      unit: '%',
    };
  };
}

/** Critère sur le score z de la norme (anomalie à ± zThreshold, « confiant » au-delà de la bande de doute). */
export function normZ(
  getter: Getter,
  direction: 'below' | 'above',
  doubtBand: (cfg: GaitConfig) => number,
): CriterionSpec['evaluate'] {
  return (src, side) => {
    const m = getter(src, side);
    if (!m || m.value === null || !m.norm || m.norm.sd === null) return null;
    const z = src.config.zThreshold;
    const sign = direction === 'below' ? -1 : 1;
    const anomaly = m.norm.mean + sign * z * m.norm.sd;
    return {
      value: m.value,
      anomaly,
      confident: anomaly + sign * doubtBand(src.config),
      direction,
      ...(m.perCycle ? { perCycle: m.perCycle } : {}),
      confidence: m.confidence,
      estimate: m.estimate,
      unit: m.unit,
    };
  };
}

// ------------------------------------------------------------------------------------------------ Évaluation

function crosses(v: number, t: number, dir: 'below' | 'above'): boolean {
  return dir === 'below' ? v < t : v > t;
}

export function evaluateCriterion(spec: CriterionSpec, src: MetricSource, side: Side): CriterionResult {
  const r = spec.evaluate(src, side);
  const thresholdStatus = spec.status === 'to_verify' ? 'to_verify' : spec.thresholdType;
  const base = {
    id: spec.id,
    role: spec.role,
    text: spec.text,
    metric: spec.metric,
    side,
    thresholdType: spec.thresholdType,
    thresholdStatus,
    refs: spec.refs,
  } as const;
  if (!r)
    return {
      ...base,
      value: null,
      unit: '',
      anomalyThreshold: null,
      confidentThreshold: null,
      status: 'unavailable',
      cycleAgreement: null,
      estimate: true,
    };
  const pc = r.perCycle?.filter((v) => Number.isFinite(v));
  const agreement = pc && pc.length ? pc.filter((v) => crosses(v, r.anomaly, r.direction)).length / pc.length : null;
  let status: CriterionStatus = 'absent';
  if (crosses(r.value, r.confident, r.direction)) status = 'confident';
  else if (crosses(r.value, r.anomaly, r.direction)) status = 'doubt';
  // Concordance entre cycles : sous le seuil (2/3 par défaut), un critère « confiant » descend à « doute ».
  if (status !== 'absent' && agreement !== null && agreement < src.config.minCycleAgreement)
    status = status === 'confident' ? 'doubt' : 'absent';
  return {
    ...base,
    value: r.value,
    unit: r.unit,
    anomalyThreshold: r.anomaly,
    confidentThreshold: r.confident,
    status,
    cycleAgreement: agreement,
    estimate: r.estimate,
  };
}

const present = (c: CriterionResult): boolean => c.status === 'confident' || c.status === 'doubt';

export function evaluateFinding(
  def: FindingDefinition,
  src: MetricSource,
  side: Side,
  restoration: (ids: readonly DeterminantId[]) => string[],
): FindingResult {
  const criteria = def.criteria.map((c) => evaluateCriterion(c, src, side));
  const prim = criteria.filter((c) => c.role === 'primary');
  const req = criteria.filter((c) => c.role === 'required');
  const support = criteria.filter((c) => c.role === 'supporting' || c.role === 'compensation');
  const contrary = criteria.filter((c) => c.role === 'contrary');
  const why = criteria.filter((c) => c.role !== 'contrary' && present(c));
  const unvalidatedThresholds = criteria
    .filter((c) => c.thresholdStatus === 'proposed_heuristic' || c.thresholdStatus === 'to_verify')
    .map((c) => ({ criterion: c.id, type: c.thresholdStatus as 'proposed_heuristic' | 'to_verify' }));
  let status: FindingStatus;
  let score = 0;
  const available = prim.filter((c) => c.status !== 'unavailable');
  if (def.observeOnly) {
    status = 'observe';
    score = 0.1;
  } else if (!available.length) {
    status = 'insufficient_data';
  } else {
    const conf = prim.some((c) => c.status === 'confident');
    const doubt = prim.some((c) => c.status === 'doubt');
    const reqOk = req.every((c) => c.status === 'unavailable' || present(c));
    if ((conf || doubt) && reqOk) {
      score = conf ? 0.6 : 0.35;
      score += Math.min(0.3, 0.1 * support.filter(present).length);
      score -= 0.15 * contrary.filter(present).length;
      const dataConf = Math.min(1, Math.max(0.2, mean(why.map((c) => (c.estimate ? 0.5 : 1)))));
      score = Math.max(0, Math.min(1, score * (0.6 + 0.4 * dataConf)));
      status = conf && score >= 0.45 ? 'probable' : 'possible';
    } else status = 'absent';
  }
  const restore = restoration(def.determinants);
  return {
    id: def.id,
    kind: def.kind,
    name_fr: def.name_fr,
    name_en: def.name_en,
    side,
    status,
    score,
    why,
    criteria,
    causes: def.causes,
    differentials: def.differentials,
    suggestions: [...restore, ...def.management],
    references: def.refs,
    determinants: def.determinants,
    evidenceLevel: def.evidenceLevel,
    camera2dLimits: def.camera2dLimits,
    unvalidatedThresholds,
    estimate: def.observeOnly === true || why.some((c) => c.estimate),
    requiresClinicianValidation: true,
    audience: def.audience,
  };
}

function mean(x: readonly number[]): number {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 1;
}

/** Nombre de cycles valides minimal atteint pour ce côté dans au moins une analyse. */
export function enoughCycles(analyses: readonly GaitAnalysis[], side: Side, cfg: GaitConfig): boolean {
  return analyses.some((a) => a.cycles.filter((c) => c.side === side && !c.rejected).length >= cfg.minCyclesPerSide);
}
