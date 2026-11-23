/**
 * Synthèse clinique d'une ou plusieurs analyses (vues) : défauts probables, déterminants, articulations × phases,
 * facteurs limitants ; et comparaison A/B (avant/après un ajustement) tenant compte de l'erreur de mesure.
 * Aucune sortie n'est un diagnostic : `requiresClinicianValidation: true` partout.
 */
import { DEFAULT_GAIT_CONFIG, type GaitConfig } from './config.ts';
import { GAIT_FINDINGS } from './data/findings.ts';
import { restorationGoals } from './determinant-ids.ts';
import {
  evaluateDeterminants,
  evaluateJointPhases,
  type DeterminantResult,
  type HealthStatus,
  type JointPhaseResult,
} from './determinants.ts';
import { enoughCycles, evaluateFinding, metricSource, type FindingDefinition, type FindingResult } from './rules.ts';
import type { GaitAnalysis, GaitMetric, Side } from './types.ts';

/** Évalue un catalogue de défauts sur les analyses (toutes vues fusionnées). */
export function evaluateFindings(
  defs: readonly FindingDefinition[],
  analyses: readonly GaitAnalysis[],
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
  sides: readonly Side[] = ['L', 'R'],
): FindingResult[] {
  const src = metricSource(analyses, config);
  const out: FindingResult[] = [];
  for (const def of defs) {
    const ss: readonly Side[] = def.global ? ['L'] : sides;
    for (const side of ss) {
      const r = evaluateFinding(def, src, side, restorationGoals);
      const ok = def.global
        ? enoughCycles(analyses, 'L', config) || enoughCycles(analyses, 'R', config)
        : enoughCycles(analyses, side, config);
      out.push(!ok && r.status !== 'observe' && r.status !== 'absent' ? { ...r, status: 'insufficient_data' } : r);
    }
  }
  return out;
}

export interface GaitAssessment {
  readonly findings: readonly FindingResult[];
  readonly determinants: readonly DeterminantResult[];
  readonly jointPhases: readonly JointPhaseResult[];
  /** Analyses dont les estimations portent `limitingFactor`. */
  readonly analyses: readonly GaitAnalysis[];
  readonly requiresClinicianValidation: true;
  readonly disclaimer: string;
}

export const DISCLAIMER =
  'Outil d’évaluation clinique — non homologué Santé Canada. Défauts « probables » fondés sur la littérature, à valider par le clinicien ; jamais un diagnostic.';

/** Marque les estimations qui sont un facteur limitant potentiel (défaut retenu ou déterminant affecté). */
export function flagLimitingFactors(
  analyses: readonly GaitAnalysis[],
  findings: readonly FindingResult[],
  determinants: readonly DeterminantResult[],
): GaitAnalysis[] {
  const key = (id: string, side?: Side): string => `${id}|${side ?? ''}`;
  const limiting = new Set<string>();
  for (const f of findings)
    if (f.status === 'probable' || f.status === 'possible')
      for (const c of f.why) {
        limiting.add(key(c.metric, c.side));
        limiting.add(key(c.metric));
      }
  for (const d of determinants)
    if (d.status === 'affected')
      for (const i of d.indicators) if (i.status === 'affected') limiting.add(key(i.metric, i.side));
  return analyses.map((a) => ({
    ...a,
    metrics: a.metrics.map((m): GaitMetric =>
      m.estimate ? { ...m, limitingFactor: limiting.has(key(m.id, m.side)) } : m,
    ),
  }));
}

export function assessGait(
  analyses: readonly GaitAnalysis[],
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): GaitAssessment {
  const findings = evaluateFindings(GAIT_FINDINGS, analyses, config);
  const determinants = evaluateDeterminants(analyses, findings, config);
  return {
    findings,
    determinants,
    jointPhases: evaluateJointPhases(analyses, config),
    analyses: flagLimitingFactors(analyses, findings, determinants),
    requiresClinicianValidation: true,
    disclaimer: DISCLAIMER,
  };
}

// ------------------------------------------------------------------------------------------------ Comparaison A/B

export interface MetricDelta {
  readonly id: string;
  readonly side?: Side;
  readonly unit: string;
  readonly a: number;
  readonly b: number;
  readonly delta: number;
  /** Marge d'erreur : max(MDC connu, précision 2D publiée, IC95 % statistique de la différence). */
  readonly margin: number;
  readonly marginSource: string;
  /** |delta| > marge. */
  readonly significant: boolean;
  readonly towardNorm: boolean | null;
  readonly estimate: boolean;
}

export interface DeterminantDelta {
  readonly id: string;
  readonly a: HealthStatus;
  readonly b: HealthStatus;
  readonly changed: boolean;
}

export interface GaitComparison {
  readonly metrics: readonly MetricDelta[];
  readonly determinants: readonly DeterminantDelta[];
  readonly findings: readonly { id: string; side: Side; a: string; b: string }[];
  readonly requiresClinicianValidation: true;
}

/**
 * Erreur de mesure par métrique : MDC quand il est connu (vitesse : 0,08 m/s post-fracture de hanche, norms.json >
 * gait_speed_mcid), sinon précision 2D de Stenum 2021 (`stenum2021` : hanche 4,0°, genou 5,6°, cheville 7,4° ; pas
 * 1,8 cm en moyenne par participant ; temps 0,01 s ; vitesse < 0,10 m/s). Mesures frontales : 3° (proposition, aucune
 * validation 2D publiée).
 */
export function measurementError(m: GaitMetric): { value: number; source: string } | null {
  const id = m.id;
  if (id === 'gait_speed')
    return { value: 0.1, source: 'stenum2021 (< 0,10 m/s) ≥ MDC 0,08 m/s (perera2006, to_verify)' };
  if (id === 'step_length' || id === 'stride_length')
    return { value: 0.018, source: 'stenum2021 (moyenne par participant)' };
  // Seulement les durées en secondes : les indices de symétrie « symmetry_index_*_time » sont en % (pas en s).
  if (id.endsWith('_time') && m.unit === 's') return { value: 0.01, source: 'stenum2021' };
  if (id.endsWith('_pct') && !id.startsWith('heel') && !id.startsWith('foot'))
    return { value: 2, source: 'stenum2021 (0,02 s ≈ 2 % du cycle)' };
  if (id === 'cadence') return { value: 2, source: 'stenum2021 (0,01 s par foulée ≈ 1–2 pas/min)' };
  if (m.unit === '°') {
    if (m.estimate) return { value: 3, source: 'proposition (mesure frontale non validée)' };
    if (id.includes('hip') || id.includes('trunk')) return { value: 4.0, source: 'stenum2021 (hanche)' };
    if (id.includes('knee')) return { value: 5.6, source: 'stenum2021 (genou)' };
    if (id.includes('ankle')) return { value: 7.4, source: 'stenum2021 (cheville)' };
  }
  return null;
}

export function compareAssessments(
  a: readonly GaitAnalysis[],
  b: readonly GaitAnalysis[],
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): GaitComparison {
  const sa = metricSource(a, config);
  const sb = metricSource(b, config);
  const ids = new Set<string>();
  for (const an of a) for (const m of an.metrics) ids.add(`${m.id}|${m.side ?? ''}`);
  const metrics: MetricDelta[] = [];
  for (const k of ids) {
    const [id, s] = k.split('|') as [string, string];
    const side = (s || undefined) as Side | undefined;
    const ma = sa.get(id, side);
    const mb = sb.get(id, side);
    if (!ma || !mb || ma.value === null || mb.value === null) continue;
    const err = measurementError(ma);
    const stat =
      ma.sd !== undefined && mb.sd !== undefined && ma.n && mb.n
        ? 1.96 * Math.sqrt(ma.sd ** 2 / ma.n + mb.sd ** 2 / mb.n)
        : 0;
    const margin = Math.max(err?.value ?? 0, stat);
    const delta = mb.value - ma.value;
    const norm = ma.norm;
    metrics.push({
      id,
      ...(side ? { side } : {}),
      unit: ma.unit,
      a: ma.value,
      b: mb.value,
      delta,
      margin,
      marginSource: err && err.value >= stat ? err.source : 'IC95 % de la différence (variabilité entre cycles)',
      significant: margin > 0 ? Math.abs(delta) > margin : false,
      towardNorm: norm ? Math.abs(mb.value - norm.mean) < Math.abs(ma.value - norm.mean) : null,
      estimate: ma.estimate || mb.estimate,
    });
  }
  const A = assessGait(a, config);
  const B = assessGait(b, config);
  return {
    metrics,
    determinants: A.determinants.map((d) => {
      const bd = B.determinants.find((x) => x.id === d.id)!;
      return { id: d.id, a: d.status, b: bd.status, changed: d.status !== bd.status };
    }),
    findings: A.findings
      .map((f) => {
        const bf = B.findings.find((x) => x.id === f.id && x.side === f.side);
        return { id: f.id, side: f.side, a: f.status, b: bf?.status ?? 'absent' };
      })
      .filter((x) => x.a !== x.b),
    requiresClinicianValidation: true,
  };
}
