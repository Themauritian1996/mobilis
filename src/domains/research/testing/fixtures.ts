/**
 * Fabriques de documents pour les tests du domaine recherche (non importé par le code de production).
 */
import type { Assessment, AssessmentId, Patient, PatientId, Study, StudyId } from '../../../core/types/clinical.ts';
import type { IsoDateTime } from '../../../core/types/common.ts';
import type { DatabasePort } from '../../../services/db/port.ts';
import { PROTOCOL_TEMPLATES } from '../templates.ts';

export const T = '2026-01-01T10:00:00.000Z' as IsoDateTime;

export const patient = (id: string, researchId?: string, displayName = `Patient ${id}`): Patient => ({
  schemaVersion: 1,
  id: id as PatientId,
  displayName,
  ...(researchId ? { researchId } : {}),
  createdAt: T,
  updatedAt: T,
  ownerUid: 'clin',
});

export function metricAssessment(
  id: string,
  patientId: string,
  performedAt: string,
  metrics: { metricId: string; value: number; unit?: string; side?: 'left' | 'right' }[],
  extra: Partial<Pick<Assessment, 'studyId' | 'timepointId' | 'conditions' | 'kind' | 'result'>> = {},
): Assessment {
  return {
    schemaVersion: 1,
    id: id as AssessmentId,
    patientId: patientId as PatientId,
    kind: extra.kind ?? 'prom',
    performedAt: performedAt as IsoDateTime,
    metrics: metrics.map((m) => ({
      metricId: m.metricId,
      value: m.value,
      unit: m.unit ?? '',
      confidence: 0.9,
      ...(m.side ? { side: m.side } : {}),
    })),
    findings: [],
    videoRetained: false,
    ...(extra.studyId ? { studyId: extra.studyId } : {}),
    ...(extra.timepointId ? { timepointId: extra.timepointId } : {}),
    ...(extra.conditions ? { conditions: extra.conditions } : {}),
    ...(extra.result !== undefined ? { result: extra.result } : {}),
    createdAt: T,
    updatedAt: T,
    ownerUid: 'clin',
  };
}

export function studyFromTemplate(id: string, templateId: string, patientIds: string[]): Study {
  const tpl = PROTOCOL_TEMPLATES.find((t) => t.id === templateId)!;
  return {
    schemaVersion: 1,
    id: id as StudyId,
    name: tpl.name.fr,
    templateId,
    measures: tpl.measures,
    timepoints: tpl.timepoints,
    conditions: tpl.conditions,
    patientIds: patientIds as PatientId[],
    anonymizeExports: true,
    createdAt: T,
    updatedAt: T,
    ownerUid: 'clin',
  };
}

/** Base en mémoire minimale conforme au port (les domaines n'importent pas les adaptateurs de services). */
export function memoryDb(): DatabasePort {
  const cols = new Map<string, Map<string, unknown>>();
  const col = (c: string): Map<string, unknown> => {
    let m = cols.get(c);
    if (!m) cols.set(c, (m = new Map()));
    return m;
  };
  const match = (d: Record<string, unknown>, w: { field: string; op: string; value: unknown }): boolean => {
    const v = d[w.field];
    if (w.op === '==') return v === w.value;
    if (w.op === 'array-contains') return Array.isArray(v) && v.includes(w.value);
    if (w.op === 'in') return Array.isArray(w.value) && w.value.includes(v);
    throw new Error(`opérateur non pris en charge dans le test : ${w.op}`);
  };
  return {
    get: async (c, id) => (col(c).has(id) ? structuredClone(col(c).get(id)) : null) as never,
    set: async (c, id, doc) => void col(c).set(id, structuredClone(doc)),
    remove: async (c, id) => void col(c).delete(id),
    query: async (c, where = []) =>
      [...col(c).values()]
        .filter((d) => where.every((w) => match(d as Record<string, unknown>, w)))
        .map((d) => structuredClone(d)) as never,
    watch: () => () => undefined,
  };
}
