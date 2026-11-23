/**
 * Accès aux données du volet « traitement » : TOUJOURS par `getRecordsDb()` (jamais Firestore directement).
 * Plans (`plans`), évaluations (`assessments`) et fiche patient (`patients`). Aucune image ni vidéo n'est stockée.
 */
import * as store from '../../../../www/js/store.js';
import type { Assessment, Patient, Plan } from '../../../core/types/clinical.ts';
import { getRecordsDb } from '../../../services/db/records.ts';
import { fromStored, pickCurrent } from '../../../domains/treatment/plan.ts';
import type { TreatmentPlan } from '../../../domains/treatment/types.ts';

/** Identifiant du compte courant (compte local hors connexion). */
export function currentUid(): string {
  return (store.currentUser() as { uid?: string } | null)?.uid ?? 'local';
}

export async function loadPatient(patientId: string): Promise<Patient | null> {
  try {
    return await getRecordsDb().get('patients', patientId);
  } catch (e) {
    console.warn('patients', e);
    return null;
  }
}

export async function listPatients(): Promise<Patient[]> {
  try {
    return await getRecordsDb().query('patients');
  } catch (e) {
    console.warn('patients', e);
    return [];
  }
}

export async function loadAssessments(patientId: string): Promise<Assessment[]> {
  try {
    const list = await getRecordsDb().query('assessments', [{ field: 'patientId', op: '==', value: patientId }]);
    return list.sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  } catch (e) {
    console.warn('assessments', e);
    return [];
  }
}

export async function loadPlans(patientId: string): Promise<TreatmentPlan[]> {
  try {
    const list = await getRecordsDb().query('plans', [{ field: 'patientId', op: '==', value: patientId }]);
    return list.map(fromStored).sort((a, b) => a.revision - b.revision);
  } catch (e) {
    console.warn('plans', e);
    return [];
  }
}

export async function savePlan(plan: TreatmentPlan): Promise<void> {
  await getRecordsDb().set('plans', plan.id, plan as Plan);
}

export async function saveAssessment(a: Assessment): Promise<void> {
  await getRecordsDb().set('assessments', a.id, a);
}

/** Plan courant du patient (l'actif, sinon la dernière révision), brouillon créé au besoin par `ensureDraft`. */
export const currentPlan = (plans: readonly TreatmentPlan[]): TreatmentPlan | undefined => pickCurrent(plans);

/** Identifiant unique d'un nouveau document (évaluation, etc.). */
export function newId(prefix: string): string {
  const u =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
  return `${prefix}_${u}`;
}

/** Identifiant du patient connecté lui-même (rôle patient) : son uid (contrat du brief). */
export const selfPatientId = (): string => currentUid();
