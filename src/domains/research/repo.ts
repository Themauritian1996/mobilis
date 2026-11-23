/**
 * Accès aux dossiers du volet recherche par le PORT `DatabasePort` (jamais Firestore directement) :
 * études, inscriptions, interventions, suivis, mesures enregistrées. Horloge et identifiants injectés (testable).
 */
import type {
  Assessment,
  AssessmentId,
  FollowUp,
  FollowUpId,
  Intervention,
  InterventionId,
  MeasureDefinition,
  Patient,
  PatientId,
  Study,
  StudyId,
  Timepoint,
} from '../../core/types/clinical.ts';
import type { IsoDate, IsoDateTime } from '../../core/types/common.ts';
import type { DatabasePort } from '../../services/db/port.ts';
import {
  completedMeasures,
  measureAssessment,
  reconcileFollowUp,
  type MeasureEntry,
  type PromLogRow,
  type RomLogRow,
} from './link.ts';
import { reminderSummary, type ReminderSummary } from './schedule.ts';

export interface RepoContext {
  readonly uid: string;
  readonly now: () => Date;
  readonly newId: (prefix: string) => string;
}

const iso = (ctx: RepoContext): IsoDateTime => ctx.now().toISOString() as IsoDateTime;

/** Identifiant de recherche suivant (« R-001 », « R-002 »…), unique parmi ceux déjà attribués. */
export function nextResearchId(existing: readonly (string | undefined)[]): string {
  let max = 0;
  for (const e of existing) {
    const m = /^R-(\d+)$/.exec(e ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R-${String(max + 1).padStart(3, '0')}`;
}

/** Dossier patient : le crée s'il est absent (même id ; patient connecté : id = uid). */
export async function ensurePatient(
  db: DatabasePort,
  ctx: RepoContext,
  patientId: string,
  init: { displayName?: string } = {},
): Promise<Patient> {
  const cur = await db.get('patients', patientId);
  if (cur) return cur;
  const t = iso(ctx);
  const p: Patient = {
    schemaVersion: 1,
    id: patientId as PatientId,
    ...(init.displayName ? { displayName: init.displayName } : {}),
    createdAt: t,
    updatedAt: t,
    ownerUid: ctx.uid,
  };
  await db.set('patients', patientId, p);
  return p;
}

export interface StudyDraft {
  readonly id?: string;
  readonly name: string;
  readonly templateId?: string;
  readonly measures: readonly MeasureDefinition[];
  readonly timepoints: readonly Timepoint[];
  readonly conditions: readonly string[];
  readonly anonymizeExports: boolean;
}

/** Crée ou met à jour une étude ; les suivis des patients inscrits reprennent les mesures et points dans le temps. */
export async function saveStudy(db: DatabasePort, ctx: RepoContext, d: StudyDraft): Promise<Study> {
  const t = iso(ctx);
  const prev = d.id ? await db.get('studies', d.id) : null;
  const id = (prev?.id ?? d.id ?? ctx.newId('st')) as StudyId;
  const s: Study = {
    schemaVersion: 1,
    id,
    name: d.name.trim() || 'Étude',
    ...(d.templateId ? { templateId: d.templateId } : {}),
    measures: d.measures,
    timepoints: d.timepoints,
    conditions: d.conditions,
    patientIds: prev?.patientIds ?? [],
    anonymizeExports: d.anonymizeExports,
    createdAt: prev?.createdAt ?? t,
    updatedAt: t,
    ownerUid: prev?.ownerUid ?? ctx.uid,
  };
  await db.set('studies', id, s);
  if (prev)
    for (const f of await db.query('followups', [{ field: 'studyId', op: '==', value: id }]))
      await db.set('followups', f.id, { ...f, measures: s.measures, timepoints: s.timepoints, updatedAt: t });
  return s;
}

/** Inscrit un patient : identifiant de recherche (si absent) + suivi ancré sur `anchorDate` (T0). */
export async function enrolPatient(
  db: DatabasePort,
  ctx: RepoContext,
  studyId: string,
  patientId: string,
  anchorDate: IsoDate,
  interventionId?: InterventionId,
): Promise<{ study: Study; followUp: FollowUp; patient: Patient }> {
  const study = await db.get('studies', studyId);
  if (!study) throw new Error(`Étude introuvable : ${studyId}`);
  let patient = await ensurePatient(db, ctx, patientId);
  const t = iso(ctx);
  if (!patient.researchId) {
    const all = await db.query('patients');
    patient = { ...patient, researchId: nextResearchId(all.map((p) => p.researchId)), updatedAt: t };
    await db.set('patients', patientId, patient);
  }
  const nextStudy: Study = study.patientIds.includes(patient.id)
    ? study
    : { ...study, patientIds: [...study.patientIds, patient.id], updatedAt: t };
  if (nextStudy !== study) await db.set('studies', studyId, nextStudy);
  const existing = (await db.query('followups', [{ field: 'patientId', op: '==', value: patientId }])).find(
    (f) => f.studyId === study.id,
  );
  const followUp: FollowUp = {
    schemaVersion: 1,
    id: (existing?.id ?? ctx.newId('fu')) as FollowUpId,
    patientId: patient.id,
    ...(interventionId
      ? { interventionId }
      : existing?.interventionId
        ? { interventionId: existing.interventionId }
        : {}),
    studyId: study.id,
    setBy: 'clinician',
    anchorDate,
    measures: study.measures,
    timepoints: study.timepoints,
    done: existing?.done ?? {},
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    ownerUid: existing?.ownerUid ?? ctx.uid,
  };
  await db.set('followups', followUp.id, followUp);
  return { study: nextStudy, followUp, patient };
}

/** Retire un patient de l'étude (son suivi d'étude est supprimé ; ses évaluations restent au dossier). */
export async function unenrolPatient(
  db: DatabasePort,
  ctx: RepoContext,
  studyId: string,
  patientId: string,
): Promise<void> {
  const study = await db.get('studies', studyId);
  if (!study) return;
  await db.set('studies', studyId, {
    ...study,
    patientIds: study.patientIds.filter((p) => p !== patientId),
    updatedAt: iso(ctx),
  });
  for (const f of await db.query('followups', [{ field: 'patientId', op: '==', value: patientId }]))
    if (f.studyId === study.id) await db.remove('followups', f.id);
}

export async function saveIntervention(
  db: DatabasePort,
  ctx: RepoContext,
  d: { id?: string; patientId: string; type: Intervention['type']; date: IsoDate; details?: Record<string, string> },
): Promise<Intervention> {
  const prev = d.id ? await db.get('interventions', d.id) : null;
  const t = iso(ctx);
  const details = Object.fromEntries(Object.entries(d.details ?? {}).filter(([, v]) => v.trim() !== ''));
  const it: Intervention = {
    schemaVersion: 1,
    id: (prev?.id ?? d.id ?? ctx.newId('iv')) as InterventionId,
    patientId: d.patientId as PatientId,
    type: d.type,
    date: d.date,
    ...(Object.keys(details).length ? { details } : {}),
    createdAt: prev?.createdAt ?? t,
    updatedAt: t,
    ownerUid: prev?.ownerUid ?? ctx.uid,
  };
  await db.set('interventions', it.id, it);
  return it;
}

/** Suivi post-intervention (hors étude) : ancré sur la date de l'intervention. */
export async function createFollowUp(
  db: DatabasePort,
  ctx: RepoContext,
  d: {
    patientId: string;
    interventionId?: InterventionId;
    setBy: FollowUp['setBy'];
    anchorDate: IsoDate;
    measures: readonly MeasureDefinition[];
    timepoints: readonly Timepoint[];
  },
): Promise<FollowUp> {
  const t = iso(ctx);
  const f: FollowUp = {
    schemaVersion: 1,
    id: ctx.newId('fu') as FollowUpId,
    patientId: d.patientId as PatientId,
    ...(d.interventionId ? { interventionId: d.interventionId } : {}),
    setBy: d.setBy,
    anchorDate: d.anchorDate,
    measures: d.measures,
    timepoints: d.timepoints,
    done: {},
    createdAt: t,
    updatedAt: t,
    ownerUid: ctx.uid,
  };
  await db.set('followups', f.id, f);
  return f;
}

/** Enregistre une mesure (douleur, saisie manuelle…) et coche l'échéance du suivi. */
export async function recordMeasure(
  db: DatabasePort,
  ctx: RepoContext,
  fu: FollowUp,
  timepointId: string,
  entry: Omit<MeasureEntry, 'performedAt'> & { performedAt?: IsoDateTime },
): Promise<{ assessment: Assessment; followUp: FollowUp }> {
  const t = iso(ctx);
  const a = measureAssessment(
    ctx.newId('as'),
    fu.patientId,
    ctx.uid,
    { ...entry, performedAt: entry.performedAt ?? t },
    t,
    { ...(fu.studyId ? { studyId: fu.studyId } : {}), timepointId },
  );
  await db.set('assessments', a.id, a);
  const followUp = await markDone(db, ctx, fu, timepointId, a.id);
  return { assessment: a, followUp };
}

/** Ajoute une évaluation à `done[timepointId]` (idempotent). */
export async function markDone(
  db: DatabasePort,
  ctx: RepoContext,
  fu: FollowUp,
  timepointId: string,
  assessmentId: AssessmentId,
): Promise<FollowUp> {
  const cur = (await db.get('followups', fu.id)) ?? fu;
  const list = cur.done[timepointId] ?? [];
  if (list.includes(assessmentId)) return cur;
  const next: FollowUp = { ...cur, done: { ...cur.done, [timepointId]: [...list, assessmentId] }, updatedAt: iso(ctx) };
  await db.set('followups', next.id, next);
  return next;
}

export interface PatientFollowUpData {
  readonly patient: Patient | null;
  readonly followups: FollowUp[];
  readonly interventions: Intervention[];
  readonly assessments: Assessment[];
  readonly studies: Study[];
}

export async function loadPatientFollowUps(db: DatabasePort, patientId: string): Promise<PatientFollowUpData> {
  const [patient, followups, interventions, assessments, studies] = await Promise.all([
    db.get('patients', patientId),
    db.query('followups', [{ field: 'patientId', op: '==', value: patientId }]),
    db.query('interventions', [{ field: 'patientId', op: '==', value: patientId }]),
    db.query('assessments', [{ field: 'patientId', op: '==', value: patientId }]),
    db.query('studies', [{ field: 'patientIds', op: 'array-contains', value: patientId }]),
  ]);
  return { patient, followups, interventions, assessments, studies };
}

/**
 * Relie aux suivis du patient les mesures faites depuis les écrans existants (journal du profil, analyses de marche)
 * et enregistre les évaluations créées. Renvoie les données à jour.
 */
export async function reconcilePatient(
  db: DatabasePort,
  ctx: RepoContext,
  patientId: string,
  logs: { promLog?: readonly PromLogRow[]; romLog?: readonly RomLogRow[] },
  today: string,
): Promise<PatientFollowUpData> {
  const data = await loadPatientFollowUps(db, patientId);
  let assessments = data.assessments;
  const followups: FollowUp[] = [];
  for (const fu of data.followups) {
    const r = reconcileFollowUp({
      followUp: fu,
      assessments,
      ...(logs.promLog ? { promLog: logs.promLog } : {}),
      ...(logs.romLog ? { romLog: logs.romLog } : {}),
      today,
      ownerUid: ctx.uid,
      nowIso: iso(ctx),
    });
    for (const a of r.created) await db.set('assessments', a.id, a);
    assessments = [...assessments, ...r.created];
    if (r.changed) {
      const next: FollowUp = { ...fu, done: r.done, updatedAt: iso(ctx) };
      await db.set('followups', fu.id, next);
      followups.push(next);
    } else followups.push(fu);
  }
  return { ...data, followups, assessments };
}

/** Rappel de l'accueil : échéances à faire / en retard pour le patient. */
export async function patientReminder(db: DatabasePort, patientId: string, today: string): Promise<ReminderSummary> {
  const d = await loadPatientFollowUps(db, patientId);
  const byId = new Map(d.assessments.map((a) => [a.id as string, a]));
  return reminderSummary(
    d.followups.map((f) => ({ ...f, completed: completedMeasures(f, byId) })),
    today,
  );
}

export interface StudyBundle {
  readonly study: Study;
  readonly patients: Patient[];
  readonly assessments: Assessment[];
  readonly followups: FollowUp[];
  readonly interventions: Intervention[];
}

export async function loadStudyBundle(db: DatabasePort, studyId: string): Promise<StudyBundle | null> {
  const study = await db.get('studies', studyId);
  if (!study) return null;
  const per = await Promise.all(study.patientIds.map((pid) => loadPatientFollowUps(db, pid)));
  return {
    study,
    patients: per.map((p) => p.patient).filter((p): p is Patient => !!p),
    assessments: per.flatMap((p) => p.assessments),
    followups: per.flatMap((p) => p.followups),
    interventions: per.flatMap((p) => p.interventions),
  };
}
