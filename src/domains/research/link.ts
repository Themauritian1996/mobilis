/**
 * Rattachement des mesures faites par les écrans existants aux échéances d'un suivi — fonctions pures.
 *
 * Les écrans v1.15 `#/prom/<id>` et `#/rom/<test>/<côté>` n'acceptent pas d'échéance et ne renvoient pas d'identifiant
 * de résultat : ils ajoutent une ligne au journal du profil (`promLog` : { id, ts, score } ; `romLog` : { test, side,
 * ts, deg, conf? }). On relie donc PAR DATE ET PAR TYPE : une ligne du journal dont la date tombe dans la fenêtre de
 * l'échéance (voir schedule.ts) et dont le questionnaire / test (et le côté) correspondent à une mesure en attente
 * devient une évaluation `assessments` (kind 'prom' / 'rom') à identifiant déterministe (pas de doublon), ajoutée à
 * `done[timepointId]`. L'analyse de marche (`#/marche/<patientId>`) enregistre directement une évaluation `gait` :
 * elle est reliée si sa date tombe dans la fenêtre et si elle fournit la mesure.
 */
import type {
  Assessment,
  AssessmentId,
  FollowUp,
  MeasureDefinition,
  MetricResult,
  PatientId,
  StudyId,
} from '../../core/types/clinical.ts';
import type { IsoDateTime } from '../../core/types/common.ts';
import { fromGaitSide, isGaitMeasure, measureUnit, PAIN_METRIC_ID, toGaitSide } from './measures.ts';
import { followUpSchedule, todayIso, type ScheduleItem } from './schedule.ts';
import { provides } from './values.ts';

export interface PromLogRow {
  readonly id: string;
  readonly ts: number;
  readonly score?: number | null;
}
export interface RomLogRow {
  readonly test: string;
  readonly side?: string | null;
  readonly ts: number;
  readonly deg: number;
  readonly conf?: number;
}

export interface MeasureEntry {
  readonly measure: MeasureDefinition;
  readonly value: number;
  readonly confidence?: number;
  readonly performedAt: IsoDateTime;
  readonly source: string;
  readonly condition?: string;
}

/** Évaluation « une mesure » (questionnaire, amplitude, douleur, saisie manuelle) pour le dossier patient. */
export function measureAssessment(
  id: string,
  patientId: PatientId,
  ownerUid: string,
  e: MeasureEntry,
  nowIso: IsoDateTime,
  link: { readonly studyId?: StudyId; readonly timepointId?: string } = {},
): Assessment {
  const kind = e.measure.kind === 'rom' ? 'rom' : e.measure.kind === 'prom' ? 'prom' : 'custom';
  const metric: MetricResult = {
    metricId: e.measure.metricId ?? e.measure.id,
    value: e.value,
    unit: measureUnit(e.measure),
    confidence: e.confidence ?? 1,
    ...(e.measure.side && e.measure.kind === 'rom' ? { side: e.measure.side } : {}),
  };
  const conditions: Record<string, string> = { source: e.source };
  if (e.condition) conditions['studyCondition'] = e.condition;
  return {
    schemaVersion: 1,
    id: id as AssessmentId,
    patientId,
    kind,
    performedAt: e.performedAt,
    conditions,
    metrics: [metric],
    findings: [],
    videoRetained: false,
    ...(link.studyId ? { studyId: link.studyId } : {}),
    ...(link.timepointId ? { timepointId: link.timepointId } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
    ownerUid,
  };
}

/** Mesures faites à chaque point dans le temps (selon les évaluations de `done`). */
export function completedMeasures(
  fu: Pick<FollowUp, 'measures' | 'done'>,
  assessments: ReadonlyMap<string, Assessment>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [tp, ids] of Object.entries(fu.done)) {
    const as = ids.map((i) => assessments.get(i)).filter((a): a is Assessment => !!a);
    out[tp] = fu.measures.filter((m) => as.some((a) => provides(m, a))).map((m) => m.id);
  }
  return out;
}

const inWindow = (it: ScheduleItem, day: string, today: string): boolean =>
  day >= it.windowStart && day <= it.windowEnd && day <= today;

export interface ReconcileInput {
  readonly followUp: FollowUp;
  /** Évaluations déjà enregistrées du patient (marche, mesures reliées). */
  readonly assessments: readonly Assessment[];
  readonly promLog?: readonly PromLogRow[];
  readonly romLog?: readonly RomLogRow[];
  readonly today: string;
  readonly ownerUid: string;
  readonly nowIso: IsoDateTime;
}

export interface ReconcileResult {
  /** Nouvelles évaluations à enregistrer (lignes de journal converties). */
  readonly created: readonly Assessment[];
  /** `done` mis à jour (inchangé si `changed` est faux). */
  readonly done: Readonly<Record<string, readonly AssessmentId[]>>;
  readonly changed: boolean;
}

/** Relie au suivi les mesures faites dans la fenêtre de chaque échéance (journal du profil, analyses de marche). */
export function reconcileFollowUp(input: ReconcileInput): ReconcileResult {
  const fu = input.followUp;
  const byId = new Map(input.assessments.map((a) => [a.id as string, a]));
  const created: Assessment[] = [];
  const done: Record<string, AssessmentId[]> = Object.fromEntries(Object.entries(fu.done).map(([k, v]) => [k, [...v]]));
  let changed = false;
  const add = (tp: string, id: AssessmentId): void => {
    const list = (done[tp] ??= []);
    if (!list.includes(id)) {
      list.push(id);
      changed = true;
    }
  };
  const doneNow = (): Record<string, string[]> =>
    completedMeasures(
      { measures: fu.measures, done },
      new Map([...byId, ...created.map((a) => [a.id as string, a] as const)]),
    );
  const sched = followUpSchedule(fu, input.today, { completed: doneNow() });
  const used = new Set<string>(); // une ligne de journal ne sert qu'une échéance
  for (const it of sched) {
    if (it.status === 'done' || it.status === 'upcoming') continue;
    const tp = it.timepoint.id;
    const pending = new Set(it.pendingMeasures.map((m) => m.id));
    // Marche : évaluation existante dans la fenêtre qui fournit la mesure.
    for (const a of input.assessments) {
      if (a.patientId !== fu.patientId || (a.kind !== 'gait' && a.kind !== 'prosthetic_gait')) continue;
      if (!inWindow(it, a.performedAt.slice(0, 10), input.today)) continue;
      if (fu.measures.some((m) => pending.has(m.id) && isGaitMeasure(m) && provides(m, a))) {
        add(tp, a.id);
        for (const m of fu.measures) if (provides(m, a)) pending.delete(m.id);
      }
    }
    for (const m of fu.measures) {
      if (!pending.has(m.id)) continue;
      if (m.kind === 'prom' && m.metricId && m.metricId !== PAIN_METRIC_ID) {
        const row = [...(input.promLog ?? [])]
          .filter((r) => r.id === m.metricId && typeof r.score === 'number' && Number.isFinite(r.score))
          .filter((r) => !used.has(`p${r.id}${r.ts}`) && inWindow(it, todayIso(new Date(r.ts)), input.today))
          .sort((a, b) => b.ts - a.ts)[0];
        if (!row) continue;
        used.add(`p${row.id}${row.ts}`);
        const id = `fu-${fu.id}-${tp}-${m.id}-${row.ts}`;
        const existing = byId.get(id);
        const a =
          existing ??
          measureAssessment(
            id,
            fu.patientId,
            input.ownerUid,
            {
              measure: m,
              value: row.score as number,
              performedAt: new Date(row.ts).toISOString() as IsoDateTime,
              source: 'promLog',
            },
            input.nowIso,
          );
        if (!existing) created.push(a);
        add(tp, a.id);
        pending.delete(m.id);
      }
      if (m.kind === 'rom' && m.metricId) {
        const want = toGaitSide(m.side) ?? null;
        const row = [...(input.romLog ?? [])]
          .filter((r) => r.test === m.metricId && (want === null || r.side === want) && Number.isFinite(r.deg))
          .filter((r) => !used.has(`r${r.test}${r.side}${r.ts}`) && inWindow(it, todayIso(new Date(r.ts)), input.today))
          .sort((a, b) => b.ts - a.ts)[0];
        if (!row) continue;
        used.add(`r${row.test}${row.side}${row.ts}`);
        const id = `fu-${fu.id}-${tp}-${m.id}-${row.ts}`;
        const existing = byId.get(id);
        const a =
          existing ??
          measureAssessment(
            id,
            fu.patientId,
            input.ownerUid,
            {
              measure: row.side === 'L' || row.side === 'R' ? { ...m, side: fromGaitSide(row.side) } : m,
              value: row.deg,
              confidence: row.conf ?? 1,
              performedAt: new Date(row.ts).toISOString() as IsoDateTime,
              source: 'romLog',
            },
            input.nowIso,
          );
        if (!existing) created.push(a);
        add(tp, a.id);
        pending.delete(m.id);
      }
    }
  }
  return { created, done, changed };
}
