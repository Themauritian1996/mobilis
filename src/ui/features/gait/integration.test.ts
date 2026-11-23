import { describe, expect, it } from 'vitest';
import type { GaitView } from '../../../domains/gait/index.ts';
import { generateGait, variantParams } from '../../../domains/gait/testing/synthetic.ts';
import { STUDY_CONDITION_KEY, type MeasureDefinition, type PatientId } from '../../../core/types/clinical.ts';
import { analyzeCapture, type ViewRecording } from './analysis.ts';
import { buildAssessmentDoc, defaultsFromPatient, parseCaptureArgs, validateForm } from './model.ts';

describe('contexte de suivi dans l’URL', () => {
  it('sans contexte', () => {
    expect(parseCaptureArgs('p1', undefined)).toEqual({ patientId: 'p1', study: {} });
    expect(parseCaptureArgs('p1', 'base1')).toEqual({ patientId: 'p1', baselineId: 'base1', study: {} });
  });
  it('requête collée au patient ou à la référence', () => {
    expect(parseCaptureArgs('p1?study=s1&tp=t0&cond=Sans%20orth%C3%A8se', undefined)).toEqual({
      patientId: 'p1',
      study: { studyId: 's1', timepointId: 't0', condition: 'Sans orthèse' },
    });
    expect(parseCaptureArgs('p1', 'base1?study=s1&tp=w2')).toEqual({
      patientId: 'p1',
      baselineId: 'base1',
      study: { studyId: 's1', timepointId: 'w2' },
    });
  });
});

describe('capture : mesures personnalisées et suivi', () => {
  const views: GaitView[] = ['sagittal-left'];
  const recs: ViewRecording[] = [];
  let heightCm = 175;
  for (const view of views) {
    const { frames, truth } = generateGait(variantParams('normal', { view, fps: 60, cycles: 6 }));
    heightCm = truth.params.heightM * 100;
    recs.push({ view, frames, aspect: truth.imageAspect });
  }
  const r = validateForm({ ...defaultsFromPatient(null), heightCm: String(heightCm) });
  if (!r.ok) throw new Error('formulaire');
  const knee: MeasureDefinition = {
    id: 'cust1',
    kind: 'custom_angle',
    label: 'Genou',
    landmarks: [23, 25, 27],
    side: 'left',
    phase: 'MSt',
  };
  const incomplete: MeasureDefinition = { ...knee, id: 'cust2', side: 'none' };

  it('enregistre customMeasures[m.id] via toCustomAngleDefinition ; ignore les définitions incomplètes', () => {
    const out = analyzeCapture(recs, r.settings, null, 2026, [knee, incomplete]);
    expect(Object.keys(out.customMeasures)).toEqual(['cust1']);
    expect(out.customMeasures['cust1']?.unit).toBe('°');
    expect(Number.isFinite(out.customMeasures['cust1']?.value)).toBe(true);
  });

  it('renseigne studyId, timepointId et la condition normalisée', () => {
    const out = analyzeCapture(recs, r.settings, null, 2026, [knee]);
    const d = buildAssessmentDoc({
      id: 'a1',
      patientId: 'p1' as PatientId,
      ownerUid: 'u',
      nowIso: '2026-11-22T10:00:00.000Z',
      settings: r.settings,
      views: ['sagittal-left'],
      assessment: out.assessment,
      customMeasures: out.customMeasures,
      study: { studyId: 's1', timepointId: 't0', condition: 'Sans orthèse' },
    });
    expect(d.studyId).toBe('s1');
    expect(d.timepointId).toBe('t0');
    expect(d.conditions?.[STUDY_CONDITION_KEY]).toBe('Sans orthèse');
    expect(d.customMeasures?.['cust1']).toBeDefined();
    const plain = buildAssessmentDoc({
      id: 'a2',
      patientId: 'p1' as PatientId,
      ownerUid: 'u',
      nowIso: '2026-11-22T10:00:00.000Z',
      settings: r.settings,
      views: ['sagittal-left'],
      assessment: out.assessment,
    });
    expect(plain.studyId).toBeUndefined();
    expect(plain.conditions?.[STUDY_CONDITION_KEY]).toBeUndefined();
  });
});
