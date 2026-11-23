import { describe, expect, it } from 'vitest';
import type { FollowUp, FollowUpId, MeasureDefinition, PatientId, StudyId } from '../../core/types/clinical.ts';
import type { IsoDate } from '../../core/types/common.ts';
import { analyzeGait, assessGait, measureCustomAngle, prepareRecording } from '../gait/index.ts';
import { generateGait } from '../gait/testing/synthetic.ts';
import {
  buildStudyData,
  changeThreshold,
  deltasFromBaseline,
  meanCurves,
  sampleSd,
  summarizeStudy,
} from './aggregate.ts';
import { decodePhase, encodePhase, toCustomAngleDefinition, validateMeasure } from './measures.ts';
import { PROTOCOL_TEMPLATES } from './templates.ts';
import { metricAssessment, patient, studyFromTemplate, T } from './testing/fixtures.ts';
import { extractCurve, extractValue } from './values.ts';

const painStudy = () => {
  const s = studyFromTemplate('s1', 'msk_injection', ['p1', 'p2', 'p3']);
  return s;
};

describe('mesures', () => {
  it('encode/décode phase ou pourcentage', () => {
    expect(encodePhase('MSw')).toBe('MSw');
    expect(encodePhase(37.4)).toBe('pct:37');
    expect(decodePhase('pct:37')).toBe(37);
    expect(decodePhase('pct:120')).toBeNull();
    expect(decodePhase('XX')).toBeNull();
  });
  it('mesure personnalisée → définition du moteur', () => {
    const m: MeasureDefinition = {
      id: 'ca1',
      kind: 'custom_angle',
      label: 'Hanche-genou-cheville',
      landmarks: [23, 25, 27],
      side: 'left',
      phase: 'MSw',
    };
    expect(toCustomAngleDefinition(m)).toEqual({
      id: 'ca1',
      a: 23,
      b: 25,
      c: 27,
      side: 'L',
      at: 'MSw',
      reference: 'raw',
    });
    expect(toCustomAngleDefinition({ ...m, landmarks: [23, 23, 27] })).toBeNull();
    expect(toCustomAngleDefinition({ ...m, side: 'none' })).toBeNull();
    expect(validateMeasure({ ...m, phase: 'pct:50' })).toEqual([]);
    expect(validateMeasure({ ...m, phase: undefined as never })).toContain('custom');
  });
  it('tous les gabarits sont valides', () => {
    for (const t of PROTOCOL_TEMPLATES) {
      for (const m of t.measures) expect(validateMeasure(m), `${t.id}/${m.id}`).toEqual([]);
      expect(t.timepoints.length).toBeGreaterThanOrEqual(2);
      expect(new Set(t.measures.map((m) => m.id)).size).toBe(t.measures.length);
    }
  });
});

describe('agrégation', () => {
  const study = painStudy();
  const patients = [patient('p1', 'R-001'), patient('p2', 'R-002'), patient('p3')];
  const A = (id: string, pid: string, tp: string, pain: number, date: string, cond?: string) =>
    metricAssessment(id, pid, date, [{ metricId: 'pain_nrs', value: pain, unit: '/10' }], {
      kind: 'custom',
      studyId: 's1' as StudyId,
      timepointId: tp,
      ...(cond ? { conditions: { studyCondition: cond } } : {}),
    });
  const assessments = [
    A('a1', 'p1', 't0', 8, '2026-01-01T09:00:00Z'),
    A('a2', 'p1', 'w2', 5, '2026-01-15T09:00:00Z'),
    A('a3', 'p2', 't0', 6, '2026-01-02T09:00:00Z'),
    A('a4', 'p2', 'w2', 5, '2026-01-16T09:00:00Z'),
    A('a4b', 'p2', 'w2', 4, '2026-01-17T09:00:00Z'), // plus récente : l'emporte
    // p3 : reliée par le suivi (done) et non par studyId/timepointId
    metricAssessment('a5', 'p3', '2026-01-03T09:00:00Z', [{ metricId: 'pain_nrs', value: 7 }], { kind: 'custom' }),
    // autre patient non inscrit : ignoré
    A('a9', 'pX', 't0', 1, '2026-01-01T09:00:00Z'),
  ];
  const followups: FollowUp[] = [
    {
      schemaVersion: 1,
      id: 'f3' as FollowUpId,
      patientId: 'p3' as PatientId,
      studyId: 's1' as StudyId,
      setBy: 'clinician',
      anchorDate: '2026-01-03' as IsoDate,
      measures: study.measures,
      timepoints: study.timepoints,
      done: { t0: ['a5' as never] },
      createdAt: T,
      updatedAt: T,
      ownerUid: 'clin',
    },
  ];
  const data = buildStudyData(study, patients, assessments, followups);

  it('une observation par patient × point × mesure, la plus récente', () => {
    const pain = data.observations.filter((o) => o.measureId === 'pain');
    expect(pain).toHaveLength(5);
    expect(pain.find((o) => o.patientId === 'p2' && o.timepointId === 'w2')?.value).toBe(4);
    expect(pain.find((o) => o.patientId === 'p3')).toMatchObject({ timepointId: 't0', value: 7, researchId: 'P-p3' });
    expect(pain.some((o) => o.patientId === ('pX' as PatientId))).toBe(false);
  });

  it('deltas appariés par rapport à T0', () => {
    const d = deltasFromBaseline(study, data.observations);
    expect(d.map((x) => [x.patientId, x.delta])).toEqual([
      ['p1', -3],
      ['p2', -2],
    ]);
    // seuil DMCI de l'ENS = 2 points (catalogue) : |−3| > 2 ; |−2| ≯ 2
    expect(d.map((x) => x.beyondThreshold)).toEqual([true, false]);
  });

  it('moyenne ± ET et delta moyen ± ET par cellule', () => {
    const s = summarizeStudy(study, data);
    const t0 = s.find((c) => c.measureId === 'pain' && c.timepointId === 't0')!;
    expect(t0.n).toBe(3);
    expect(t0.mean).toBeCloseTo(7, 10);
    expect(t0.sd).toBeCloseTo(1, 10);
    const w2 = s.find((c) => c.measureId === 'pain' && c.timepointId === 'w2')!;
    expect(w2).toMatchObject({ n: 2, nPaired: 2, deltaMean: -2.5, nBeyondThreshold: 1 });
    expect(w2.deltaSd).toBeCloseTo(Math.SQRT1_2, 10);
    expect(w2.threshold).toMatchObject({ kind: 'mcid', value: 2 });
    const w6 = s.find((c) => c.measureId === 'pain' && c.timepointId === 'w6')!;
    expect(w6).toMatchObject({ n: 0, mean: null, sd: null, deltaMean: null });
  });

  it('conditions séparées ; T0 de même condition si disponible', () => {
    const extra = [
      A('c1', 'p1', 't0', 8, '2026-01-01T09:00:00Z', 'AFO'),
      A('c2', 'p1', 'w2', 2, '2026-01-15T10:00:00Z', 'AFO'),
    ];
    const d2 = buildStudyData(study, patients, [...assessments, ...extra], followups);
    const s = summarizeStudy(study, d2).filter((c) => c.measureId === 'pain' && c.timepointId === 'w2');
    expect(s.map((c) => c.condition)).toEqual(['', 'AFO']);
    expect(s[1]).toMatchObject({ n: 1, deltaMean: -6 });
  });

  it('écart-type d’échantillon', () => {
    expect(sampleSd([1])).toBeNull();
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('seuils de changement : MDC vitesse (norms.json), DMCI questionnaire, erreur 2D angle', () => {
    expect(
      changeThreshold({ id: 'v', kind: 'gait_metric_at_phase', label: 'v', metricId: 'gait_speed' }),
    ).toMatchObject({
      kind: 'mdc',
      value: 0.08,
      unit: 'm/s',
      status: 'to_verify',
    });
    expect(changeThreshold({ id: 'a', kind: 'gait_metric_at_phase', label: 'a', metricId: 'ankle_msw' })).toMatchObject(
      {
        kind: 'error2d',
        value: 7.4,
      },
    );
    expect(changeThreshold({ id: 'r', kind: 'rom', label: 'r', metricId: 'kn_flex' })).toBeNull();
  });
});

describe('extraction depuis une analyse de marche réelle (squelette synthétique)', () => {
  const { frames, truth } = generateGait({ view: 'sagittal-left' });
  const input = {
    frames,
    view: 'sagittal-left' as const,
    patient: { heightCm: 175 },
    options: { imageAspect: truth.imageAspect },
  };
  const an = analyzeGait(input);
  const result = JSON.parse(JSON.stringify(assessGait([an]))) as unknown;
  const custom: MeasureDefinition = {
    id: 'ca_knee',
    kind: 'custom_angle',
    label: 'Angle hanche-genou-cheville en oscillation moyenne (G)',
    landmarks: [23, 25, 27],
    side: 'left',
    phase: 'MSw',
  };
  const def = toCustomAngleDefinition(custom)!;
  const cv = measureCustomAngle(prepareRecording(input), def);
  const a = metricAssessment('g1', 'p1', '2026-01-01T10:00:00Z', [], {
    kind: 'gait',
    result,
  });
  const ga = { ...a, customMeasures: { ca_knee: { value: cv.value!, unit: '°', confidence: cv.confidence } } };

  it('métrique du moteur à une phase', () => {
    const m: MeasureDefinition = {
      id: 'x',
      kind: 'gait_metric_at_phase',
      label: 'x',
      metricId: 'ankle_ic',
      phase: 'IC',
      side: 'left',
    };
    const v = extractValue(m, ga)!;
    const truthM = an.metrics.find((x) => x.id === 'ankle_ic' && x.side === 'L')!;
    expect(v.value).toBeCloseTo(truthM.value!, 10);
    expect(v.unit).toBe('°');
    const speed = extractValue({ id: 's', kind: 'gait_metric_at_phase', label: 's', metricId: 'gait_speed' }, ga)!;
    expect(speed.value).toBeGreaterThan(0.5);
  });

  it('courbe à une phase de Perry ou à un % du cycle, et courbe complète', () => {
    const atPct = extractValue(
      { id: 'c', kind: 'gait_metric_at_phase', label: 'c', metricId: 'curve:knee_angle', phase: 'pct:0', side: 'left' },
      ga,
    )!;
    const curve = an.curves.find((c) => c.id === 'knee_angle' && c.side === 'L')!;
    expect(atPct.value).toBeCloseTo(curve.mean[0]!, 10);
    const ph = extractValue(
      { id: 'c', kind: 'gait_metric_at_phase', label: 'c', metricId: 'curve:knee_angle', phase: 'ISw', side: 'left' },
      ga,
    )!;
    expect(ph.value).toBeGreaterThan(20); // flexion du genou en oscillation initiale
    const full = extractCurve({ id: 'k', kind: 'gait_curve', label: 'k', metricId: 'knee_angle', side: 'left' }, ga)!;
    expect(full.mean).toHaveLength(101);
  });

  it('mesure personnalisée enregistrée à la capture', () => {
    expect(extractValue(custom, ga)).toMatchObject({ value: cv.value, estimate: true });
    expect(extractValue(custom, a)).toBeNull();
  });

  it('courbes moyennes superposées par point dans le temps', () => {
    const s = studyFromTemplate('sb', 'botox', ['p1']);
    const g0 = { ...ga, studyId: 'sb' as StudyId, timepointId: 't0' };
    const g2 = { ...ga, id: 'g2' as never, studyId: 'sb' as StudyId, timepointId: 'w2' };
    const d = buildStudyData(s, [patient('p1', 'R-001')], [g0, g2], []);
    expect(d.curves.map((c) => c.timepointId)).toEqual(['t0', 'w2']);
    const mc = meanCurves(s, d.curves);
    expect(mc).toHaveLength(2);
    expect(mc[0]!.mean).toHaveLength(101);
    const sum = summarizeStudy(s, d).find((c) => c.measureId === 'ankle_ic_L' && c.timepointId === 'w2')!;
    expect(sum.deltaMean).toBeCloseTo(0, 10);
  });
});
