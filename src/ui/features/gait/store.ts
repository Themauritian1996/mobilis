/**
 * Volet « marche » — accès aux données cliniques. TOUJOURS par `getRecordsDb()` (jamais Firestore directement).
 * Aucune vidéo ni image : seulement des mesures dérivées (`videoRetained: false`).
 */
import type {
  Annotation,
  AnnotationId,
  Assessment,
  AssessmentId,
  Patient,
  PatientId,
} from '../../../core/types/clinical.ts';
import type { IsoDateTime } from '../../../core/types/common.ts';
import { getRecordsDb } from '../../../services/db/records.ts';
import { state } from '../../app-state.ts';

export const currentUid = (): string => (state.user as { uid?: string } | null)?.uid ?? 'local-user';

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* repli ci-dessous */
  }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export const nowIso = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

/**
 * Dossier du patient. Un patient connecté a un dossier dont l'id est son uid : s'il manque, il est créé (même id).
 * Pour un autre id, retourne null (le clinicien doit ouvrir un dossier existant).
 */
export async function loadPatient(patientId: string): Promise<Patient | null> {
  const db = getRecordsDb();
  const p = await db.get('patients', patientId);
  if (p) return p;
  const uid = currentUid();
  if (patientId !== uid) return null;
  const t = nowIso();
  const created: Patient = {
    schemaVersion: 1,
    id: patientId as PatientId,
    createdAt: t,
    updatedAt: t,
    ownerUid: uid,
  };
  await db.set('patients', patientId, created);
  return created;
}

export const loadAssessment = (id: string): Promise<Assessment | null> => getRecordsDb().get('assessments', id);

export async function saveAssessment(a: Assessment): Promise<void> {
  await getRecordsDb().set('assessments', a.id, a);
}

/** Évaluations de marche d'un patient, de la plus récente à la plus ancienne. */
export async function listGaitAssessments(patientId: string): Promise<Assessment[]> {
  const all = await getRecordsDb().query('assessments', [{ field: 'patientId', op: '==', value: patientId }]);
  return all
    .filter((a) => a.kind === 'gait' || a.kind === 'prosthetic_gait')
    .sort((x, y) => y.performedAt.localeCompare(x.performedAt));
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Annotations d'une évaluation (ids = [id]) ou d'une comparaison (ids = [idA, idB]), de la plus récente à la plus ancienne. */
export async function listAnnotations(patientId: string, assessmentIds: readonly string[]): Promise<Annotation[]> {
  const all = await getRecordsDb().query('annotations', [{ field: 'patientId', op: '==', value: patientId }]);
  return all
    .filter((x) => sameSet(x.assessmentIds, assessmentIds))
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

export async function saveAnnotation(
  patientId: string,
  assessmentIds: readonly string[],
  text: string,
  role: 'patient' | 'clinician',
): Promise<Annotation> {
  const t = nowIso();
  const id = newId();
  const doc: Annotation = {
    schemaVersion: 1,
    id: id as AnnotationId,
    patientId: patientId as PatientId,
    assessmentIds: assessmentIds as readonly AssessmentId[],
    authorRole: role,
    text: text.trim(),
    createdAt: t,
    updatedAt: t,
    ownerUid: currentUid(),
  };
  await getRecordsDb().set('annotations', id, doc);
  return doc;
}
