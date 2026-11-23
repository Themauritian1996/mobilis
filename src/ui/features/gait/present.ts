/**
 * Volet « marche » — mise en forme PURE des résultats pour un physiatre (testée dans present.test.ts) :
 * qualité de capture, tableau spatio-temporel, déterminants, articulations × phases de Perry, défauts probables,
 * estimations frontales, préparation des données de courbes et de la comparaison A/B. Aucun DOM.
 */
import {
  DEFAULT_GAIT_CONFIG,
  DETERMINANTS,
  GAIT_FINDINGS,
  metricSource,
  reference,
  type CriterionResult,
  type CycleCurve,
  type DeterminantResult,
  type FindingResult,
  type GaitAnalysis,
  type GaitComparison,
  type GaitMetric,
  type GaitView,
  type HealthStatus,
  type JointPhaseResult,
  type MetricDelta,
  type Side,
} from '../../../domains/gait/index.ts';
import { normalBand, type NormalBand } from './normal-band.ts';
import type { ChartSeries } from './charts.ts';
import { FPS_MIN, FPS_RECOMMENDED } from './live.ts';

// ---------------------------------------------------------------------------------------------------- Nombres
export function fmtNum(v: number | null | undefined, decimals: number, locale = 'fr-CA'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    Math.abs(v) < 0.5 * Math.pow(10, -decimals) ? 0 : v,
  );
}

/** « +0,12 » / « −0,12 » (vrai signe moins), pour les écarts. */
export function fmtSigned(v: number | null | undefined, decimals: number, locale = 'fr-CA'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const s = fmtNum(Math.abs(v), decimals, locale);
  const zero = Math.abs(v) < 0.5 * Math.pow(10, -decimals);
  return `${zero ? '' : v < 0 ? '−' : '+'}${s}`;
}

export const sideKey = (s: Side): 'left' | 'right' => (s === 'L' ? 'left' : 'right');

// ---------------------------------------------------------------------------------------------------- Qualité de capture
export interface ViewQuality {
  readonly view: GaitView;
  readonly fps: number;
  readonly fpsLevel: 'good' | 'ok' | 'low';
  readonly frames: number;
  readonly usablePct: number;
  readonly footVisibilityPct: { readonly L: number; readonly R: number };
  readonly interpolatedPct: number;
  readonly cycles: { readonly L: number; readonly R: number };
  readonly scaleMethod: string;
  /** Incertitude relative de l'échelle (%). */
  readonly scaleUncertaintyPct: number;
  readonly scaleConfidencePct: number;
  readonly ok: boolean;
  readonly warnings: readonly string[];
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function viewQuality(a: GaitAnalysis): ViewQuality {
  const n = (s: Side): number => a.cycles.filter((c) => c.side === s && !c.rejected).length;
  const fps = a.quality.fps;
  return {
    view: a.view,
    fps,
    fpsLevel: fps >= 50 ? 'good' : fps >= FPS_MIN ? 'ok' : 'low',
    frames: a.quality.frameCount,
    usablePct: Math.round(a.quality.usableFraction * 100),
    footVisibilityPct: {
      L: Math.round(a.quality.footVisibility.L * 100),
      R: Math.round(a.quality.footVisibility.R * 100),
    },
    interpolatedPct: Math.round(a.quality.interpolatedFraction * 100),
    cycles: { L: n('L'), R: n('R') },
    scaleMethod: a.scale.method,
    scaleUncertaintyPct: Math.round(a.scale.relativeUncertainty * 1000) / 10,
    scaleConfidencePct: Math.round(a.scale.confidence * 100),
    ok: a.quality.ok,
    warnings: [...new Set(a.warnings)],
  };
}

/**
 * Confiance de la capture (règle affichée à l'écran) : faible si une vue est jugée insuffisante par le moteur, si la
 * fréquence d'images est < 30 i/s ou s'il y a < 2 cycles valides d'un côté ; moyenne si < 3 cycles, < 50 i/s ou
 * échelle incertaine (> 8 %) ; sinon élevée. Ce n'est PAS un score de marche.
 */
export function captureConfidence(views: readonly ViewQuality[]): { level: ConfidenceLevel; reasons: string[] } {
  const reasons: string[] = [];
  let level: ConfidenceLevel = 'high';
  const down = (to: ConfidenceLevel, why: string): void => {
    reasons.push(why);
    if (to === 'low' || level === 'high') level = to === 'low' ? 'low' : level === 'low' ? 'low' : 'medium';
  };
  if (!views.length) return { level: 'low', reasons: ['noViews'] };
  for (const v of views) {
    if (!v.ok) down('low', `notOk:${v.view}`);
    if (v.fps < FPS_MIN) down('low', `fpsLow:${v.view}`);
    else if (v.fps < 50) down('medium', `fpsOk:${v.view}`);
    const c = Math.min(v.cycles.L, v.cycles.R);
    if (c < 2) down('low', `cycles<2:${v.view}`);
    else if (c < 3) down('medium', `cycles<3:${v.view}`);
    if (v.scaleUncertaintyPct > 8) down('medium', `scale:${v.view}`);
  }
  return { level, reasons };
}

export { FPS_MIN, FPS_RECOMMENDED };

// ---------------------------------------------------------------------------------------------------- Spatio-temporel
export interface MetricCell {
  readonly value: number | null;
  readonly text: string;
  readonly sd: number | null;
  readonly n: number;
  readonly confidencePct: number;
  readonly estimate: boolean;
  readonly view: GaitView;
  /** Valeur en % de la norme (moyenne normative) et score z si l'ET est publiée. */
  readonly pctOfNorm: number | null;
  readonly z: number | null;
  readonly normText: string | null;
  readonly normRef: string | null;
  readonly warning: string | null;
}

export interface SpatioRow {
  readonly id: string;
  readonly unit: string;
  readonly decimals: number;
  readonly both?: MetricCell;
  readonly L?: MetricCell;
  readonly R?: MetricCell;
}

interface RowSpec {
  readonly id: string;
  readonly unit: string;
  readonly decimals: number;
  readonly perSide: boolean;
}

/** Ordre et précision d'affichage des paramètres spatio-temporels. */
export const SPATIO_SPECS: readonly RowSpec[] = [
  { id: 'gait_speed', unit: 'm/s', decimals: 2, perSide: false },
  { id: 'cadence', unit: 'pas/min', decimals: 0, perSide: false },
  { id: 'step_length', unit: 'm', decimals: 2, perSide: true },
  { id: 'stride_length', unit: 'm', decimals: 2, perSide: true },
  { id: 'step_time', unit: 's', decimals: 2, perSide: true },
  { id: 'stride_time', unit: 's', decimals: 2, perSide: true },
  { id: 'stance_pct', unit: '%', decimals: 0, perSide: true },
  { id: 'swing_pct', unit: '%', decimals: 0, perSide: true },
  { id: 'double_support_pct', unit: '%', decimals: 0, perSide: true },
  { id: 'single_support_pct', unit: '%', decimals: 0, perSide: true },
  { id: 'symmetry_index_step_length', unit: '%', decimals: 1, perSide: false },
  { id: 'symmetry_index_step_time', unit: '%', decimals: 1, perSide: false },
  { id: 'symmetry_index_stance_time', unit: '%', decimals: 1, perSide: false },
  { id: 'step_length_cv', unit: '%', decimals: 1, perSide: true },
  { id: 'step_time_cv', unit: '%', decimals: 1, perSide: true },
];

function cellOf(m: GaitMetric | undefined, decimals: number, locale: string): MetricCell | undefined {
  if (!m || m.value === null || !Number.isFinite(m.value)) return undefined;
  const nm = m.norm;
  return {
    value: m.value,
    text: fmtNum(m.value, decimals, locale),
    sd: m.sd !== undefined && Number.isFinite(m.sd) ? m.sd : null,
    n: m.n ?? 0,
    confidencePct: Math.round(m.confidence * 100),
    estimate: m.estimate,
    view: m.view,
    pctOfNorm: nm ? Math.round(nm.pctOfMean) : null,
    z: nm && nm.z !== null ? Math.round(nm.z * 100) / 100 : null,
    normText: nm
      ? `${fmtNum(nm.mean, decimals, locale)}${nm.sd !== null ? ` ± ${fmtNum(nm.sd, decimals, locale)}` : ''} ${nm.unit}`
      : null,
    normRef: nm?.ref ?? null,
    warning: m.warning ?? null,
  };
}

/** Lignes du tableau spatio-temporel (métriques fusionnées de toutes les vues : la plus confiante par paramètre). */
export function spatioRows(analyses: readonly GaitAnalysis[], locale = 'fr-CA'): SpatioRow[] {
  const src = metricSource(analyses, DEFAULT_GAIT_CONFIG);
  const rows: SpatioRow[] = [];
  for (const s of SPATIO_SPECS) {
    if (s.perSide) {
      const L = cellOf(src.get(s.id, 'L'), s.decimals, locale);
      const R = cellOf(src.get(s.id, 'R'), s.decimals, locale);
      if (L || R) rows.push({ id: s.id, unit: s.unit, decimals: s.decimals, ...(L ? { L } : {}), ...(R ? { R } : {}) });
    } else {
      const both = cellOf(src.get(s.id), s.decimals, locale);
      if (both) rows.push({ id: s.id, unit: s.unit, decimals: s.decimals, both });
    }
  }
  return rows;
}

/** Vitesse de marche : en % de la norme et score z (mise en avant). */
export function speedSummary(analyses: readonly GaitAnalysis[], locale = 'fr-CA'): MetricCell | null {
  return cellOf(metricSource(analyses, DEFAULT_GAIT_CONFIG).get('gait_speed'), 2, locale) ?? null;
}

// ---------------------------------------------------------------------------------------------------- Déterminants
export const STATUS_ORDER: readonly HealthStatus[] = ['affected', 'preserved', 'uncertain'];
export const statusClass = (s: HealthStatus): 'neg' | 'pos' | 'warn' =>
  s === 'affected' ? 'neg' : s === 'preserved' ? 'pos' : 'warn';

export interface IndicatorView {
  readonly label: string;
  readonly side: Side | null;
  readonly valueText: string;
  readonly target: string;
  readonly status: HealthStatus;
  readonly explanation: string;
  readonly confidencePct: number;
  readonly estimate: boolean;
  readonly targetToVerify: boolean;
}

export interface DeterminantView {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly status: HealthStatus;
  readonly explanation: string;
  readonly indicators: readonly IndicatorView[];
  /** `name` : nom lisible du défaut (jamais l'identifiant interne à l'écran). */
  readonly linkedFindings: readonly { id: string; name: string; side: Side; status: string }[];
  readonly restorationGoal: string;
  readonly references: readonly string[];
}

/** Nom lisible d'un défaut du catalogue de marche (repli : identifiant). */
export function findingName(id: string, lang: string): string {
  const f = GAIT_FINDINGS.find((x) => x.id === id);
  return f ? (lang === 'fr' ? f.name_fr : f.name_en) : id;
}

/** Les six déterminants, dans l'ordre de Saunders, sans score global : statut + explication de chacun. */
export function determinantViews(
  list: readonly DeterminantResult[],
  lang: string,
  locale = 'fr-CA',
): DeterminantView[] {
  return [...list]
    .sort((a, b) => a.n - b.n)
    .map((d) => {
      const info = DETERMINANTS.find((x) => x.id === d.id);
      return {
        id: d.id,
        n: d.n,
        name: lang === 'fr' ? d.name_fr : (info?.name_en ?? d.name_fr),
        status: d.status,
        explanation: d.explanation,
        indicators: d.indicators.map((i) => ({
          label: i.label,
          side: i.side ?? null,
          valueText: i.value === null ? '–' : `${fmtNum(i.value, i.unit === 'm' ? 3 : 1, locale)} ${i.unit}`,
          target: i.target,
          status: i.status,
          explanation: i.explanation,
          confidencePct: Math.round(i.confidence * 100),
          estimate: i.estimate,
          targetToVerify: i.targetStatus === 'to_verify',
        })),
        linkedFindings: d.linkedFindings.map((f) => ({ ...f, name: findingName(f.id, lang) })),
        restorationGoal: d.restorationGoal,
        references: d.references,
      };
    });
}

// ---------------------------------------------------------------------------------------------------- Articulations × phases
export const JOINT_ORDER: readonly JointPhaseResult['joint'][] = ['hip', 'knee', 'ankle', 'pelvis', 'trunk'];
export const PHASE_ORDER: readonly string[] = ['IC', 'LR', 'MSt', 'MSt–TSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw'];

export interface JointCell {
  readonly status: HealthStatus;
  readonly valueText: string;
  readonly label: string;
  readonly explanation: string;
  readonly target: string;
  readonly estimate: boolean;
  readonly confidencePct: number;
}

export interface JointPhaseTable {
  /** Phases présentes, dans l'ordre de Perry. */
  readonly phases: readonly string[];
  readonly rows: readonly {
    readonly joint: JointPhaseResult['joint'];
    readonly side: Side;
    readonly cells: readonly (JointCell | null)[];
  }[];
}

export function jointPhaseTable(list: readonly JointPhaseResult[], locale = 'fr-CA'): JointPhaseTable {
  const present = new Set(list.map((x) => x.phase));
  const phases = PHASE_ORDER.filter((p) => present.has(p));
  for (const p of present) if (!phases.includes(p)) phases.push(p);
  const rows: { joint: JointPhaseResult['joint']; side: Side; cells: (JointCell | null)[] }[] = [];
  for (const joint of JOINT_ORDER)
    for (const side of ['L', 'R'] as const) {
      const here = list.filter((x) => x.joint === joint && x.side === side);
      if (!here.length) continue;
      rows.push({
        joint,
        side,
        cells: phases.map((ph) => {
          const x = here.find((h) => h.phase === ph);
          if (!x) return null;
          const i = x.indicator;
          return {
            status: i.status,
            valueText: i.value === null ? '–' : `${fmtNum(i.value, 1, locale)}${i.unit === '°' ? '°' : ` ${i.unit}`}`,
            label: i.label,
            explanation: i.explanation,
            target: i.target,
            estimate: i.estimate,
            confidencePct: Math.round(i.confidence * 100),
          };
        }),
      });
    }
  return { phases, rows };
}

// ---------------------------------------------------------------------------------------------------- Défauts probables
export const FINDING_SHOWN: readonly string[] = ['probable', 'possible', 'observe'];
const FINDING_RANK: Readonly<Record<string, number>> = {
  probable: 0,
  possible: 1,
  observe: 2,
  insufficient_data: 3,
  absent: 4,
};

export interface CriterionView {
  readonly role: string;
  readonly text: string;
  readonly valueText: string;
  readonly anomalyText: string | null;
  readonly confidentText: string | null;
  readonly agreementPct: number | null;
  readonly estimate: boolean;
  readonly thresholdStatus: string;
}

export interface FindingView {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly status: string;
  readonly confidencePct: number;
  readonly why: readonly CriterionView[];
  readonly causes: readonly string[];
  readonly differentials: readonly string[];
  readonly suggestions: readonly string[];
  readonly references: readonly string[];
  readonly determinants: readonly string[];
  readonly camera2dLimits: string | null;
  readonly unvalidated: readonly string[];
  readonly estimate: boolean;
  readonly evidenceLevel: string | null;
}

export function criterionView(c: CriterionResult, locale = 'fr-CA'): CriterionView {
  const u = c.unit === '°' ? '°' : ` ${c.unit}`;
  const d = c.unit === 'm' ? 3 : 1;
  const t = (v: number | null): string | null => (v === null ? null : `${fmtNum(v, d, locale)}${u}`);
  return {
    role: c.role,
    text: c.text,
    valueText: t(c.value) ?? '–',
    anomalyText: t(c.anomalyThreshold),
    confidentText: t(c.confidentThreshold),
    agreementPct: c.cycleAgreement === null ? null : Math.round(c.cycleAgreement * 100),
    estimate: c.estimate,
    thresholdStatus: c.thresholdStatus,
  };
}

/** Défauts à afficher (probable, possible, à observer), du plus probable au moins probable. */
export function findingViews(list: readonly FindingResult[], lang: string, locale = 'fr-CA'): FindingView[] {
  return list
    .filter((f) => FINDING_SHOWN.includes(f.status))
    .sort((a, b) => (FINDING_RANK[a.status] ?? 9) - (FINDING_RANK[b.status] ?? 9) || b.score - a.score)
    .map((f) => ({
      key: `${f.id}:${f.side}`,
      id: f.id,
      name: lang === 'fr' ? f.name_fr : f.name_en,
      side: f.side,
      status: f.status,
      confidencePct: Math.round(f.score * 100),
      why: f.why.map((c) => criterionView(c, locale)),
      causes: f.causes,
      differentials: f.differentials,
      suggestions: f.suggestions,
      references: f.references,
      determinants: f.determinants,
      camera2dLimits: f.camera2dLimits,
      // Texte du critère (jamais son identifiant interne ni le code « proposed_heuristic »).
      unvalidated: f.unvalidatedThresholds.map(
        (u) => f.criteria.find((c) => c.id === u.criterion)?.text ?? u.criterion,
      ),
      estimate: f.estimate,
      evidenceLevel: f.evidenceLevel,
    }));
}

/** Défauts non retenus faute de données (pour une mention discrète). */
export const insufficientFindings = (list: readonly FindingResult[]): FindingResult[] =>
  list.filter((f) => f.status === 'insufficient_data');

/** Citation d'une référence du moteur (« Auteurs (année). Titre. Revue. doi »), avec son statut. */
export function citation(id: string): { text: string; toVerify: boolean; doi: string | null } {
  const r = reference(id);
  if (!r) return { text: id, toVerify: true, doi: null };
  const parts = [r.authors, r.year ? `(${r.year})` : null, r.title ? `${r.title}.` : null, r.journal ?? null].filter(
    (x): x is string => !!x,
  );
  return { text: parts.join(' '), toVerify: r.status === 'to_verify', doi: r.doi ?? null };
}

// ---------------------------------------------------------------------------------------------------- Estimations (frontal / transverse)
export interface EstimateView {
  readonly id: string;
  readonly side: Side | null;
  readonly valueText: string;
  readonly unit: string;
  readonly confidencePct: number;
  readonly limitingFactor: boolean;
  readonly view: GaitView;
  readonly warning: string | null;
}

/**
 * Mesures marquées « estimation » (plan frontal, transverse). `featured` : seulement celles qui sont un facteur
 * limitant (`limitingFactor`) ; les autres restent informatives (`others`, repliées à l'écran).
 */
export function estimateViews(
  analyses: readonly GaitAnalysis[],
  locale = 'fr-CA',
): { featured: EstimateView[]; others: EstimateView[] } {
  const best = new Map<string, GaitMetric>();
  for (const a of analyses)
    for (const m of a.metrics) {
      if (!m.estimate || m.value === null || !Number.isFinite(m.value)) continue;
      const k = `${m.id}|${m.side ?? ''}`;
      const cur = best.get(k);
      if (!cur || m.confidence > cur.confidence || (m.limitingFactor && !cur.limitingFactor)) best.set(k, m);
    }
  const all = [...best.values()].map((m): EstimateView => ({
    id: m.id,
    side: m.side ?? null,
    valueText: fmtNum(m.value, m.unit === 'm' ? 3 : 1, locale),
    unit: m.unit,
    confidencePct: Math.round(m.confidence * 100),
    limitingFactor: m.limitingFactor === true,
    view: m.view,
    warning: m.warning ?? null,
  }));
  return { featured: all.filter((e) => e.limitingFactor), others: all.filter((e) => !e.limitingFactor) };
}

// ---------------------------------------------------------------------------------------------------- Courbes
export type CurveJoint = 'hip' | 'knee' | 'ankle' | 'trunk';
export const CURVE_JOINTS: readonly CurveJoint[] = ['hip', 'knee', 'ankle', 'trunk'];

/** Meilleure courbe moyenne d'une articulation et d'un côté (plus de cycles ; à égalité, la vue du côté proche). */
export function pickCurve(
  analyses: readonly GaitAnalysis[],
  joint: CurveJoint,
  side: Side,
): { curve: CycleCurve; view: GaitView } | null {
  let best: { curve: CycleCurve; view: GaitView; score: number } | null = null;
  for (const a of analyses)
    for (const c of a.curves) {
      if (c.id !== `${joint}_angle` || c.side !== side || !c.n || c.mean.length < 101) continue;
      const near = (side === 'L' && a.view === 'sagittal-left') || (side === 'R' && a.view === 'sagittal-right');
      const score = c.n * 10 + (near ? 1 : 0);
      if (!best || score > best.score) best = { curve: c, view: a.view, score };
    }
  return best ? { curve: best.curve, view: best.view } : null;
}

export interface JointChartData {
  readonly joint: CurveJoint;
  readonly unit: string;
  /** Une série par côté disponible (G, D). */
  readonly series: readonly { side: Side; mean: readonly number[]; sd: readonly number[]; n: number; view: GaitView }[];
  readonly band: NormalBand | null;
}

/** Données des quatre graphiques (hanche, genou, cheville, tronc) : moyenne ± ET par côté + bande normale indicative. */
export function jointCharts(analyses: readonly GaitAnalysis[]): JointChartData[] {
  const out: JointChartData[] = [];
  for (const joint of CURVE_JOINTS) {
    const series = (['L', 'R'] as const).flatMap((side) => {
      const p = pickCurve(analyses, joint, side);
      return p ? [{ side, mean: p.curve.mean, sd: p.curve.sd, n: p.curve.n, view: p.view }] : [];
    });
    if (series.length) out.push({ joint, unit: '°', series, band: normalBand(joint) });
  }
  return out;
}

/** Valeurs clés d'une courbe (pour la description textuelle et la vérification) : minimum, maximum et leur position. */
export function curveExtremes(
  mean: readonly number[],
): { min: number; minAt: number; max: number; maxAt: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let minAt = 0;
  let maxAt = 0;
  mean.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    if (v < min) [min, minAt] = [v, i];
    if (v > max) [max, maxAt] = [v, i];
  });
  return Number.isFinite(min) ? { min, minAt, max, maxAt } : null;
}

export const SERIES_CLASS: Readonly<Record<Side, ChartSeries['cls']>> = { L: 's0', R: 's1' };

// ---------------------------------------------------------------------------------------------------- Comparaison A/B
export interface DeltaRow {
  readonly id: string;
  readonly side: Side | null;
  readonly unit: string;
  readonly a: string;
  readonly b: string;
  readonly delta: string;
  readonly margin: string;
  readonly marginSource: string;
  readonly significant: boolean;
  readonly towardNorm: boolean | null;
  readonly estimate: boolean;
  /** Sens du changement (pour la couleur) : vrai si significatif et vers la norme. */
  readonly improved: boolean;
  readonly worsened: boolean;
}

const decimalsFor = (unit: string, id: string): number =>
  unit === 'm' ? 3 : unit === 'm/s' ? 2 : unit === 's' ? 3 : id === 'cadence' ? 0 : 1;

/** Lignes de la comparaison : significatives d'abord, puis par identifiant. */
export function deltaRows(cmp: GaitComparison, locale = 'fr-CA'): DeltaRow[] {
  const mk = (m: MetricDelta): DeltaRow => {
    const d = decimalsFor(m.unit, m.id);
    return {
      id: m.id,
      side: m.side ?? null,
      unit: m.unit,
      a: fmtNum(m.a, d, locale),
      b: fmtNum(m.b, d, locale),
      delta: fmtSigned(m.delta, d, locale),
      margin: `± ${fmtNum(m.margin, d, locale)}`,
      marginSource: m.marginSource,
      significant: m.significant,
      towardNorm: m.towardNorm,
      estimate: m.estimate,
      improved: m.significant && m.towardNorm === true,
      worsened: m.significant && m.towardNorm === false,
    };
  };
  return [...cmp.metrics]
    .map(mk)
    .sort(
      (x, y) =>
        Number(y.significant) - Number(x.significant) ||
        x.id.localeCompare(y.id) ||
        (x.side ?? '').localeCompare(y.side ?? ''),
    );
}

export interface StatusChange {
  readonly id: string;
  readonly side?: Side;
  readonly a: string;
  readonly b: string;
  /** Amélioration, aggravation ou autre changement. */
  readonly direction: 'better' | 'worse' | 'other';
}

const RANK_DET: Readonly<Record<string, number>> = { affected: 0, uncertain: 1, preserved: 2 };
const RANK_FIND: Readonly<Record<string, number>> = {
  probable: 0,
  possible: 1,
  observe: 2,
  insufficient_data: 3,
  absent: 4,
};

/** Changements de statut des déterminants (seulement ceux qui changent). */
export function determinantChanges(cmp: GaitComparison): StatusChange[] {
  return cmp.determinants
    .filter((d) => d.changed)
    .map((d) => {
      const ra = RANK_DET[d.a] ?? 1;
      const rb = RANK_DET[d.b] ?? 1;
      return { id: d.id, a: d.a, b: d.b, direction: rb > ra ? 'better' : rb < ra ? 'worse' : 'other' };
    });
}

/** Changements de statut des défauts (déjà filtrés par le moteur : a ≠ b). */
export function findingChanges(cmp: GaitComparison): StatusChange[] {
  return cmp.findings.map((f) => {
    const ra = RANK_FIND[f.a] ?? 3;
    const rb = RANK_FIND[f.b] ?? 3;
    return { id: f.id, side: f.side, a: f.a, b: f.b, direction: rb > ra ? 'better' : rb < ra ? 'worse' : 'other' };
  });
}

export interface OverlayChart {
  readonly joint: CurveJoint;
  readonly side: Side;
  readonly a: { mean: readonly number[]; sd: readonly number[]; n: number };
  readonly b: { mean: readonly number[]; sd: readonly number[]; n: number };
  readonly band: NormalBand | null;
}

/** Courbes A et B superposées (une par articulation et par côté disponible dans les deux évaluations). */
export function overlayCharts(a: readonly GaitAnalysis[], b: readonly GaitAnalysis[]): OverlayChart[] {
  const out: OverlayChart[] = [];
  for (const joint of CURVE_JOINTS)
    for (const side of ['L', 'R'] as const) {
      const ca = pickCurve(a, joint, side);
      const cb = pickCurve(b, joint, side);
      if (!ca || !cb) continue;
      out.push({
        joint,
        side,
        a: { mean: ca.curve.mean, sd: ca.curve.sd, n: ca.curve.n },
        b: { mean: cb.curve.mean, sd: cb.curve.sd, n: cb.curve.n },
        band: normalBand(joint),
      });
    }
  return out;
}

// ---------------------------------------------------------------------------------------------------- Divers
/** Identifiants de métrique → clé de libellé (`m_<id>`) ; les inconnus se lisent tels quels. */
export const metricLabelKey = (id: string): string => `m_${id}`;

export function dateLabel(iso: string, locale = 'fr-CA'): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
