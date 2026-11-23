/**
 * Mesures de recherche et de suivi actives pour un patient (études auxquelles il est inscrit + suivis
 * post-intervention). Appelé par la capture de marche pour calculer les mesures personnalisées au moment
 * de l'enregistrement (aucune vidéo n'est conservée : on ne peut pas recalculer plus tard).
 */
import type { DatabasePort } from '../../services/db/port.ts';
import type { MeasureDefinition, PatientId } from '../../core/types/clinical.ts';

export async function getActiveMeasures(db: DatabasePort, patientId: PatientId): Promise<MeasureDefinition[]> {
  const [studies, followups] = await Promise.all([
    db.query('studies', [{ field: 'patientIds', op: 'array-contains', value: patientId }]),
    db.query('followups', [{ field: 'patientId', op: '==', value: patientId }]),
  ]);
  const byId = new Map<string, MeasureDefinition>();
  for (const m of [...studies.flatMap((s) => s.measures), ...followups.flatMap((f) => f.measures)]) byId.set(m.id, m);
  return [...byId.values()];
}
