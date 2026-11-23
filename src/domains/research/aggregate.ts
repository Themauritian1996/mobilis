/**
 * Agrégation d'une étude : patients × points dans le temps × mesures (× condition) — fonctions pures.
 *
 * Rattachement d'une évaluation à un point dans le temps, par ordre de priorité :
 * 1. `assessment.studyId === study.id` et `assessment.timepointId` (capture faite depuis l'étude) ;
 * 2. `followUp.done[timepointId]` d'un suivi de l'étude (`followUp.studyId === study.id`) ;
 * Pour un même patient, point dans le temps, mesure et condition, l'évaluation la plus récente l'emporte.
 * Condition : `assessment.conditions.studyCondition` (vide si absente).
 * T0 (référence des deltas) = premier point dans le temps du protocole.
 */
import type {
  Assessment,
  FollowUp,
  MeasureDefinition,
  Patient,
  PatientId,
  Study,
  Timepoint,
} from '../../core/types/clinical.ts';
import { NORMS, measurementError, reference, type GaitMetric } from '../gait/index.ts';
import { INSTRUMENTS } from '../outcomes/data/proms.ts';
import { STUDY_CONDITION_KEY } from '../../core/types/clinical.ts';
import { isPainMeasure } from './measures.ts';
import { extractCurve, extractValue } from './values.ts';

export const CONDITION_KEY = STUDY_CONDITION_KEY;

export interface Observation {
  readonly patientId: PatientId;
  readonly researchId: string;
  readonly displayName: string;
  readonly timepointId: string;
  readonly timepointLabel: string;
  readonly offsetDays: number;
  readonly measureId: string;
  readonly measureLabel: string;
  readonly condition: string;
  readonly value: number;
  readonly unit: string;
  readonly confidence: number;
  readonly estimate: boolean;
  /** Date/heure de l'évaluation (ISO). */
  readonly date: string;
  readonly assessmentId: string;
}

export interface CurveObservation {
  readonly patientId: PatientId;
  readonly researchId: string;
  readonly timepointId: string;
  readonly measureId: string;
  readonly condition: string;
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  readonly n: number;
  readonly unit: string;
  readonly date: string;
}

export interface StudyData {
  readonly observations: readonly Observation[];
  readonly curves: readonly CurveObservation[];
}

/** Identifiant de recherche à afficher/exporter (repli : identifiant court dérivé, jamais le nom). */
export const researchIdOf = (p: Pick<Patient, 'id' | 'researchId'> | undefined, fallbackId: string): string =>
  p?.researchId || `P-${fallbackId.slice(0, 6)}`;

const conditionOf = (a: Assessment): string => a.conditions?.[CONDITION_KEY] ?? '';

/** Évaluations rattachées à chaque point dans le temps pour un patient. */
export function assessmentsByTimepoint(
  study: Pick<Study, 'id' | 'timepoints'>,
  patientId: PatientId,
  assessments: readonly Assessment[],
  followups: readonly FollowUp[],
): Map<string, Assessment[]> {
  const byId = new Map(assessments.map((a) => [a.id as string, a]));
  const out = new Map<string, Assessment[]>();
  for (const tp of study.timepoints) {
    const set = new Map<string, Assessment>();
    for (const a of assessments)
      if (a.patientId === patientId && a.studyId === study.id && a.timepointId === tp.id) set.set(a.id, a);
    for (const f of followups)
      if (f.patientId === patientId && f.studyId === study.id)
        for (const id of f.done[tp.id] ?? []) {
          const a = byId.get(id);
          if (a && a.patientId === patientId) set.set(a.id, a);
        }
    out.set(tp.id, [...set.values()]);
  }
  return out;
}

/** Jeu de données complet d'une étude. */
export function buildStudyData(
  study: Study,
  patients: readonly Patient[],
  assessments: readonly Assessment[],
  followups: readonly FollowUp[],
): StudyData {
  const pById = new Map(patients.map((p) => [p.id as string, p]));
  const observations: Observation[] = [];
  const curves: CurveObservation[] = [];
  for (const pid of study.patientIds) {
    const p = pById.get(pid);
    const rid = researchIdOf(p, pid);
    const byTp = assessmentsByTimepoint(study, pid, assessments, followups);
    for (const tp of study.timepoints) {
      const list = [...(byTp.get(tp.id) ?? [])].sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
      for (const m of study.measures) {
        const seen = new Set<string>();
        for (const a of list) {
          const cond = conditionOf(a);
          if (seen.has(cond)) continue;
          if (m.kind === 'gait_curve') {
            const c = extractCurve(m, a);
            if (!c) continue;
            seen.add(cond);
            curves.push({
              patientId: pid,
              researchId: rid,
              timepointId: tp.id,
              measureId: m.id,
              condition: cond,
              ...c,
              date: a.performedAt,
            });
            continue;
          }
          const v = extractValue(m, a);
          if (!v) continue;
          seen.add(cond);
          observations.push({
            patientId: pid,
            researchId: rid,
            displayName: p?.displayName ?? '',
            timepointId: tp.id,
            timepointLabel: tp.label,
            offsetDays: tp.offsetDays,
            measureId: m.id,
            measureLabel: m.label,
            condition: cond,
            ...v,
            date: a.performedAt,
            assessmentId: a.id,
          });
        }
      }
    }
  }
  return { observations, curves };
}

// ---------------------------------------------------------------- Statistiques

export const mean = (x: readonly number[]): number | null =>
  x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;

/** Écart-type d'échantillon (n − 1) ; `null` si n < 2. */
export function sampleSd(x: readonly number[]): number | null {
  if (x.length < 2) return null;
  const m = mean(x)!;
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}

export interface ChangeThreshold {
  readonly value: number;
  /** `mdc` : changement minimal détectable ; `mcid` : différence minimale cliniquement importante (indicative) ;
   *  `error2d` : erreur de mesure 2D publiée (pas un MDC). */
  readonly kind: 'mdc' | 'mcid' | 'error2d';
  readonly unit: string;
  readonly source: string;
  readonly status: 'verified' | 'verified_secondary' | 'to_verify';
}

/** Seuil de changement connu pour une mesure (norms.json, catalogue des questionnaires, précision 2D), sinon `null`. */
export function changeThreshold(m: MeasureDefinition): ChangeThreshold | null {
  if (m.kind === 'gait_metric_at_phase' && m.metricId === 'gait_speed') {
    const block = NORMS.spatiotemporal.find((b) => b.id === 'gait_speed_mcid');
    const rows = block && Array.isArray(block.values) ? block.values : [];
    const row = rows.find((r) => typeof r['mdc'] === 'number');
    if (row && block) {
      const ref = block.ref ? reference(block.ref) : undefined;
      return {
        value: row['mdc'] as number,
        kind: 'mdc',
        unit: 'm/s',
        source: ref ? `${ref.authors} ${ref.year} — ${String(row['population'] ?? '')}` : String(block.ref),
        status: 'to_verify',
      };
    }
  }
  if ((m.kind === 'prom' && m.metricId) || m.kind === 'pain') {
    const pain = isPainMeasure(m);
    const def = INSTRUMENTS[pain ? 'nprs' : (m.metricId ?? '')];
    if (def?.mcid && def.mcid.type !== 'level')
      return {
        value: def.mcid.value,
        kind: 'mcid',
        unit: pain ? '/10' : 'points',
        source: def.mcid.note.fr,
        status: 'to_verify',
      };
  }
  if (
    (m.kind === 'gait_metric_at_phase' && m.metricId && !m.metricId.startsWith('curve:')) ||
    m.kind === 'custom_angle'
  ) {
    const probe: GaitMetric = {
      id: m.kind === 'custom_angle' ? 'custom' : (m.metricId ?? ''),
      value: null,
      unit: m.kind === 'custom_angle' ? '°' : '',
      view: 'sagittal-left',
      confidence: 1,
      estimate: m.kind === 'custom_angle',
    };
    const unit = m.kind === 'custom_angle' ? '°' : unitGuess(m.metricId ?? '');
    const err = measurementError({ ...probe, unit });
    if (err) return { value: err.value, kind: 'error2d', unit, source: err.source, status: 'to_verify' };
  }
  return null;
}

function unitGuess(id: string): string {
  if (id === 'gait_speed') return 'm/s';
  if (id === 'step_length' || id === 'stride_length') return 'm';
  if (id === 'cadence') return 'pas/min';
  if (id.endsWith('_time')) return 's';
  if (id.endsWith('_pct') || id.startsWith('symmetry_index')) return '%';
  return '°';
}

export interface CellSummary {
  readonly measureId: string;
  readonly timepointId: string;
  readonly condition: string;
  readonly n: number;
  readonly mean: number | null;
  readonly sd: number | null;
  readonly unit: string;
  /** Deltas appariés par rapport à T0 (même patient, même mesure, même condition si disponible). */
  readonly nPaired: number;
  readonly deltaMean: number | null;
  readonly deltaSd: number | null;
  /** Patients dont |delta| dépasse le seuil de changement connu (null si aucun seuil). */
  readonly nBeyondThreshold: number | null;
  readonly threshold: ChangeThreshold | null;
}

export interface PatientDelta {
  readonly patientId: PatientId;
  readonly researchId: string;
  readonly measureId: string;
  readonly timepointId: string;
  readonly condition: string;
  readonly baseline: number;
  readonly value: number;
  readonly delta: number;
  readonly beyondThreshold: boolean | null;
}

const key = (...p: string[]): string => p.join('\u0001');

/** Deltas individuels (valeur − T0) pour chaque observation hors T0. */
export function deltasFromBaseline(
  study: Pick<Study, 'timepoints' | 'measures'>,
  obs: readonly Observation[],
): PatientDelta[] {
  const t0 = study.timepoints[0];
  if (!t0) return [];
  const base = new Map<string, Observation>();
  for (const o of obs) if (o.timepointId === t0.id) base.set(key(o.patientId, o.measureId, o.condition), o);
  const anyBase = new Map<string, Observation>();
  for (const o of obs)
    if (o.timepointId === t0.id && !anyBase.has(key(o.patientId, o.measureId)))
      anyBase.set(key(o.patientId, o.measureId), o);
  const thr = new Map(study.measures.map((m) => [m.id, changeThreshold(m)]));
  const out: PatientDelta[] = [];
  for (const o of obs) {
    if (o.timepointId === t0.id) continue;
    const b = base.get(key(o.patientId, o.measureId, o.condition)) ?? anyBase.get(key(o.patientId, o.measureId));
    if (!b) continue;
    const delta = o.value - b.value;
    const t = thr.get(o.measureId) ?? null;
    out.push({
      patientId: o.patientId,
      researchId: o.researchId,
      measureId: o.measureId,
      timepointId: o.timepointId,
      condition: o.condition,
      baseline: b.value,
      value: o.value,
      delta,
      beyondThreshold: t ? Math.abs(delta) > t.value : null,
    });
  }
  return out;
}

/** Tableau de synthèse : mesure × point dans le temps × condition (moyenne ± ET, delta moyen ± ET, seuil). */
export function summarizeStudy(study: Pick<Study, 'timepoints' | 'measures'>, data: StudyData): CellSummary[] {
  const deltas = deltasFromBaseline(study, data.observations);
  const out: CellSummary[] = [];
  for (const m of study.measures) {
    if (m.kind === 'gait_curve') continue;
    const thr = changeThreshold(m);
    const conds = [...new Set(data.observations.filter((o) => o.measureId === m.id).map((o) => o.condition))].sort();
    if (!conds.length) conds.push('');
    for (const tp of study.timepoints)
      for (const c of conds) {
        const vals = data.observations.filter(
          (o) => o.measureId === m.id && o.timepointId === tp.id && o.condition === c,
        );
        const ds = deltas.filter((d) => d.measureId === m.id && d.timepointId === tp.id && d.condition === c);
        out.push({
          measureId: m.id,
          timepointId: tp.id,
          condition: c,
          n: vals.length,
          mean: mean(vals.map((o) => o.value)),
          sd: sampleSd(vals.map((o) => o.value)),
          unit: vals[0]?.unit ?? '',
          nPaired: ds.length,
          deltaMean: mean(ds.map((d) => d.delta)),
          deltaSd: sampleSd(ds.map((d) => d.delta)),
          nBeyondThreshold: thr ? ds.filter((d) => d.beyondThreshold).length : null,
          threshold: thr,
        });
      }
  }
  return out;
}

export interface MeanCurve {
  readonly measureId: string;
  readonly timepointId: string;
  readonly condition: string;
  readonly mean: readonly number[];
  readonly n: number;
  readonly unit: string;
}

/** Courbe moyenne entre patients (101 points) par mesure × point dans le temps × condition, pour la superposition. */
export function meanCurves(
  study: Pick<Study, 'timepoints' | 'measures'>,
  curves: readonly CurveObservation[],
): MeanCurve[] {
  const out: MeanCurve[] = [];
  for (const m of study.measures)
    for (const tp of study.timepoints) {
      const conds = [...new Set(curves.filter((c) => c.measureId === m.id).map((c) => c.condition))];
      for (const cond of conds) {
        const cs = curves.filter((c) => c.measureId === m.id && c.timepointId === tp.id && c.condition === cond);
        if (!cs.length) continue;
        const avg: number[] = [];
        for (let k = 0; k < 101; k++) avg.push(mean(cs.map((c) => c.mean[k] ?? NaN).filter(Number.isFinite)) ?? NaN);
        out.push({ measureId: m.id, timepointId: tp.id, condition: cond, mean: avg, n: cs.length, unit: cs[0]!.unit });
      }
    }
  return out;
}

/** Points dans le temps triés par délai (ordre du protocole pour les ex æquo). */
export const sortedTimepoints = (tps: readonly Timepoint[]): Timepoint[] =>
  tps
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.offsetDays - b.t.offsetDays || a.i - b.i)
    .map((x) => x.t);
