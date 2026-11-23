/**
 * Lecture défensive d'un document `assessments` : `result` est opaque pour le cœur (sortie sérialisée de `assessGait`,
 * et `result.prosthetic` pour `assessProstheticGait`). On n'en extrait que ce dont le plan a besoin.
 */
import type { Assessment } from '../../core/types/clinical.ts';
import { DETERMINANTS, type DeterminantId } from '../gait/determinant-ids.ts';
import type { PlanDeterminant, PlanFinding, PlanMetric, PlanSource, Side } from './types.ts';

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const side = (x: unknown): Side | undefined => (x === 'L' || x === 'R' ? x : undefined);
const DET_IDS = new Set<string>(DETERMINANTS.map((d) => d.id));
const isDet = (x: unknown): x is DeterminantId => typeof x === 'string' && DET_IDS.has(x);
const STATUSES = new Set(['probable', 'possible', 'absent', 'insufficient_data', 'observe']);

function toFinding(x: unknown, kind: 'gait' | 'prosthetic'): PlanFinding | null {
  if (!isRec(x)) return null;
  const id = str(x['id']);
  const s = side(x['side']);
  const status = str(x['status']);
  if (!id || !s || !status || !STATUSES.has(status)) return null;
  return {
    id,
    kind: x['kind'] === 'prosthetic' ? 'prosthetic' : kind,
    name_fr: str(x['name_fr']) ?? id,
    side: s,
    status: status as PlanFinding['status'],
    score: num(x['score']) ?? 0,
    determinants: arr(x['determinants']).filter(isDet),
    references: arr(x['references']).filter((r): r is string => typeof r === 'string'),
    unvalidatedThresholds: arr(x['unvalidatedThresholds'])
      .filter(isRec)
      .map((u) => ({ criterion: str(u['criterion']) ?? '', type: str(u['type']) ?? '' })),
  };
}

function toDeterminant(x: unknown): PlanDeterminant | null {
  if (!isRec(x) || !isDet(x['id'])) return null;
  const st = x['status'];
  if (st !== 'affected' && st !== 'preserved' && st !== 'uncertain') return null;
  return {
    id: x['id'],
    status: st,
    linkedFindings: arr(x['linkedFindings'])
      .filter(isRec)
      .flatMap((l) => {
        const id = str(l['id']);
        const s = side(l['side']);
        return id && s ? [{ id, side: s, status: str(l['status']) ?? '' }] : [];
      }),
  };
}

function toMetric(x: unknown): PlanMetric | null {
  if (!isRec(x)) return null;
  const id = str(x['id']);
  const unit = str(x['unit']);
  if (!id || unit === undefined) return null;
  const v = x['value'];
  const n = isRec(x['norm']) ? x['norm'] : null;
  const mean = n ? num(n['mean']) : undefined;
  const s = side(x['side']);
  return {
    id,
    ...(s ? { side: s } : {}),
    value: typeof v === 'number' && Number.isFinite(v) ? v : null,
    unit,
    confidence: num(x['confidence']) ?? 0,
    estimate: x['estimate'] === true,
    ...(n && mean !== undefined
      ? {
          norm: {
            mean,
            sd: num(n['sd']) ?? null,
            normId: str(n['normId']) ?? '',
            ref: str(n['ref']) ?? null,
          },
        }
      : {}),
  };
}

/** Métrique du cœur (`MetricResult`) → métrique du plan (côté 'left'/'right' → 'L'/'R'). */
function fromCoreMetric(m: Assessment['metrics'][number]): PlanMetric {
  const s: Side | undefined = m.side === 'left' ? 'L' : m.side === 'right' ? 'R' : undefined;
  return {
    id: m.metricId,
    ...(s ? { side: s } : {}),
    value: Number.isFinite(m.value) ? m.value : null,
    unit: m.unit,
    confidence: m.confidence,
    estimate: false,
  };
}

/** Réduit un document `assessments` à ce que `proposePlan` et le suivi des objectifs lisent. */
export function planSourceOf(a: Assessment): PlanSource {
  const result = isRec(a.result) ? a.result : {};
  const findings: PlanFinding[] = arr(result['findings'])
    .map((f) => toFinding(f, 'gait'))
    .filter((f): f is PlanFinding => f !== null);
  const prosthetic = isRec(result['prosthetic']) ? result['prosthetic'] : null;
  if (prosthetic)
    for (const d of arr(prosthetic['deviations'])) {
      const f = toFinding(d, 'prosthetic');
      if (f) findings.push({ ...f, kind: 'prosthetic' });
    }
  const determinants = arr(result['determinants'])
    .map(toDeterminant)
    .filter((d): d is PlanDeterminant => d !== null);
  const metrics: PlanMetric[] = [];
  for (const an of arr(result['analyses']))
    if (isRec(an))
      for (const m of arr(an['metrics'])) {
        const pm = toMetric(m);
        if (pm) metrics.push(pm);
      }
  if (!metrics.length) metrics.push(...a.metrics.map(fromCoreMetric));
  return {
    id: a.id,
    performedAt: a.performedAt,
    kind: a.kind === 'gait' || a.kind === 'prosthetic_gait' ? a.kind : 'other',
    findings,
    determinants,
    metrics,
  };
}

/** Meilleure valeur (confiance maximale) d'une métrique dans une évaluation ; repli sur la métrique sans côté. */
export function metricIn(src: Pick<PlanSource, 'metrics'>, id: string, s?: Side): PlanMetric | undefined {
  const pick = (want: Side | undefined): PlanMetric | undefined => {
    let best: PlanMetric | undefined;
    for (const m of src.metrics)
      if (m.id === id && m.side === want && m.value !== null && (!best || m.confidence > best.confidence)) best = m;
    return best;
  };
  return (s ? pick(s) : undefined) ?? pick(undefined);
}
