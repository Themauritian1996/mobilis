/**
 * Extraction de la valeur d'une mesure de protocole à partir d'une évaluation enregistrée — fonctions pures.
 *
 * Sources, par ordre de préférence :
 * - marche : `assessment.result` (sortie sérialisée de `assessGait` : analyses → métriques, courbes, cycles), sinon le
 *   résumé `assessment.metrics` ; mesure personnalisée : `assessment.customMeasures[measure.id]` (calculée à la capture,
 *   aucune vidéo n'est conservée) ;
 * - amplitude, questionnaire, douleur : `assessment.metrics` (`metricId` = test, questionnaire ou `pain_nrs`).
 */
import type { Assessment, MeasureDefinition } from '../../core/types/clinical.ts';
import { PHASES } from '../gait/index.ts';
import { CURVE_PREFIX, decodePhase, measureUnit, toGaitSide } from './measures.ts';

export interface ExtractedValue {
  readonly value: number;
  readonly unit: string;
  readonly confidence: number;
  readonly estimate: boolean;
}

export interface ExtractedCurve {
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  readonly n: number;
  readonly unit: string;
}

// ---- Lecture défensive du résultat sérialisé du moteur (opaque pour le cœur).
interface SerMetric {
  id: string;
  side?: string;
  value: number | null;
  unit: string;
  confidence: number;
  estimate?: boolean;
}
interface SerCurve {
  id: string;
  side: string;
  unit: string;
  mean: number[];
  sd: number[];
  n: number;
}
interface SerPhase {
  id: string;
  startPct: number;
  endPct: number;
}
interface SerCycle {
  side: string;
  rejected: boolean;
  phases: SerPhase[];
}
interface SerAnalysis {
  metrics: SerMetric[];
  curves: SerCurve[];
  cycles: SerCycle[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Analyses du résultat de marche (`result.analyses`), ou liste vide. */
export function analysesOf(a: Pick<Assessment, 'result'>): SerAnalysis[] {
  const r = a.result;
  if (!isObj(r) || !Array.isArray(r['analyses'])) return [];
  return (r['analyses'] as unknown[]).filter(isObj).map((x) => ({
    metrics: Array.isArray(x['metrics']) ? (x['metrics'] as SerMetric[]) : [],
    curves: Array.isArray(x['curves']) ? (x['curves'] as SerCurve[]) : [],
    cycles: Array.isArray(x['cycles']) ? (x['cycles'] as SerCycle[]) : [],
  }));
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const meanOf = (x: readonly number[]): number => x.reduce((s, v) => s + v, 0) / x.length;

function bestMetric(a: Assessment, metricId: string, side: 'L' | 'R' | undefined): ExtractedValue | null {
  let best: ExtractedValue | null = null;
  for (const an of analysesOf(a))
    for (const m of an.metrics) {
      if (m.id !== metricId || !finite(m.value)) continue;
      if (side ? m.side !== side : m.side !== undefined && m.side !== null) continue;
      if (!best || m.confidence > best.confidence)
        best = { value: m.value, unit: m.unit, confidence: m.confidence, estimate: !!m.estimate };
    }
  if (best) return best;
  const coreSide = side === 'L' ? 'left' : side === 'R' ? 'right' : undefined;
  for (const m of a.metrics) {
    if (m.metricId !== metricId || !finite(m.value)) continue;
    const ms = m.side === 'none' || m.side === 'bilateral' ? undefined : m.side;
    if (ms !== coreSide) continue;
    if (!best || m.confidence > best.confidence)
      best = { value: m.value, unit: m.unit, confidence: m.confidence, estimate: false };
  }
  return best;
}

/** Fenêtre (début, fin en %) d'une phase de Perry : moyenne des cycles valides du côté, sinon proportions normatives. */
export function phaseWindow(cycles: readonly SerCycle[], side: 'L' | 'R', phase: string): [number, number] | null {
  const ws = cycles
    .filter((c) => !c.rejected && c.side === side)
    .map((c) => c.phases.find((p) => p.id === phase))
    .filter((p): p is SerPhase => !!p && finite(p.startPct) && finite(p.endPct));
  if (ws.length) return [meanOf(ws.map((w) => w.startPct)), meanOf(ws.map((w) => w.endPct))];
  const n = PHASES.find((p) => p.id === phase);
  return n ? [n.startPct, n.endPct] : null;
}

function curveOf(a: Assessment, curveId: string, side: 'L' | 'R'): { curve: SerCurve; cycles: SerCycle[] } | null {
  let best: { curve: SerCurve; cycles: SerCycle[] } | null = null;
  for (const an of analysesOf(a))
    for (const c of an.curves)
      if (c.id === curveId && c.side === side && Array.isArray(c.mean) && c.mean.length === 101)
        if (!best || c.n > best.curve.n) best = { curve: c, cycles: an.cycles };
  return best;
}

/** Valeur d'une courbe à une phase (moyenne sur la fenêtre) ou à un % du cycle. */
export function valueOnCurve(
  curve: readonly number[],
  at: number | string,
  cycles: readonly SerCycle[],
  side: 'L' | 'R',
): number | null {
  if (typeof at === 'number') {
    const v = curve[Math.round(Math.max(0, Math.min(100, at)))];
    return finite(v) ? v : null;
  }
  const w = phaseWindow(cycles, side, at);
  if (!w) return null;
  const s = curve.slice(Math.round(w[0]), Math.round(w[1]) + 1).filter(finite);
  return s.length ? meanOf(s) : null;
}

/** Valeur scalaire d'une mesure dans une évaluation, ou `null` si l'évaluation ne la contient pas. */
export function extractValue(m: MeasureDefinition, a: Assessment): ExtractedValue | null {
  const side = toGaitSide(m.side);
  switch (m.kind) {
    case 'gait_metric_at_phase': {
      if (a.kind !== 'gait' && a.kind !== 'prosthetic_gait') return null;
      if (!m.metricId) return null;
      if (m.metricId.startsWith(CURVE_PREFIX)) {
        const at = decodePhase(m.phase);
        if (!side || at === null) return null;
        const c = curveOf(a, m.metricId.slice(CURVE_PREFIX.length), side);
        if (!c) return null;
        const v = valueOnCurve(c.curve.mean, at, c.cycles, side);
        return v === null
          ? null
          : { value: v, unit: c.curve.unit, confidence: Math.min(1, c.curve.n / 3) * 0.8, estimate: false };
      }
      return bestMetric(a, m.metricId, side);
    }
    case 'gait_curve':
      return null;
    case 'custom_angle': {
      const v = a.customMeasures?.[m.id];
      return v && finite(v.value) ? { value: v.value, unit: v.unit, confidence: v.confidence, estimate: true } : null;
    }
    case 'rom':
    case 'prom': {
      if (!m.metricId) return null;
      const want = m.kind === 'rom' ? side : undefined;
      const hit = a.metrics.find(
        (x) =>
          x.metricId === m.metricId &&
          finite(x.value) &&
          (m.kind === 'prom' || (toGaitSide(x.side) ?? undefined) === want),
      );
      return hit ? { value: hit.value, unit: hit.unit || measureUnit(m), confidence: hit.confidence, estimate: false } : null;
    }
  }
}

/** Courbe moyenne ± ET d'une mesure `gait_curve` (ou de la courbe sous-jacente d'un `curve:` / angle personnalisé). */
export function extractCurve(m: MeasureDefinition, a: Assessment): ExtractedCurve | null {
  const side = toGaitSide(m.side);
  if (!side || !m.metricId) return null;
  const id = m.metricId.startsWith(CURVE_PREFIX) ? m.metricId.slice(CURVE_PREFIX.length) : m.metricId;
  if (m.kind !== 'gait_curve' && !m.metricId.startsWith(CURVE_PREFIX)) return null;
  const c = curveOf(a, id, side);
  return c ? { mean: c.curve.mean, sd: c.curve.sd, n: c.curve.n, unit: c.curve.unit } : null;
}

/** L'évaluation fournit-elle cette mesure (valeur ou courbe) ? */
export const provides = (m: MeasureDefinition, a: Assessment): boolean =>
  m.kind === 'gait_curve' ? extractCurve(m, a) !== null : extractValue(m, a) !== null;
