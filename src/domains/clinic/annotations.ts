/**
 * Annotations du dossier patient : note libre sur une évaluation (1 id) ou une comparaison A/B (2 ids).
 * Logique pure ; l'enregistrement passe par `DatabasePort` (getRecordsDb()).
 */
import { AppError } from '../../core/errors.ts';
import type { Annotation, AnnotationId, AssessmentId, PatientId } from '../../core/types/clinical.ts';
import type { IsoDateTime } from '../../core/types/common.ts';

export const ANNOTATION_MAX = 4000;

export function cleanAnnotationText(text: string): string {
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) throw new AppError('annotation_empty', 'Note vide');
  if (t.length > ANNOTATION_MAX) throw new AppError('annotation_too_long', `Note > ${ANNOTATION_MAX} caractères`);
  return t;
}

export function newAnnotation(a: {
  id: string;
  ownerUid: string;
  patientId: string;
  assessmentIds: readonly string[];
  authorRole: Annotation['authorRole'];
  text: string;
  now: string;
}): Annotation {
  const ids = [...new Set(a.assessmentIds.filter(Boolean))];
  if (ids.length < 1 || ids.length > 2)
    throw new AppError('annotation_target', 'Une note porte sur une évaluation ou une comparaison de deux évaluations');
  return {
    schemaVersion: 1,
    id: a.id as AnnotationId,
    ownerUid: a.ownerUid,
    patientId: a.patientId as PatientId,
    assessmentIds: ids as AssessmentId[],
    authorRole: a.authorRole,
    text: cleanAnnotationText(a.text),
    createdAt: a.now as IsoDateTime,
    updatedAt: a.now as IsoDateTime,
  };
}

export function editAnnotation(prev: Annotation, text: string, now: string): Annotation {
  return { ...prev, text: cleanAnnotationText(text), updatedAt: now as IsoDateTime };
}

/** Notes d'une évaluation ou d'une comparaison précise (ordre des ids indifférent). */
export function annotationsFor(list: readonly Annotation[], assessmentIds: readonly string[]): Annotation[] {
  const want = [...new Set(assessmentIds)].sort().join('|');
  return list
    .filter((n) => [...new Set(n.assessmentIds)].sort().join('|') === want)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
