import { describe, expect, it } from 'vitest';
import type { IsoDate } from '../../core/types/common.ts';
import { getActiveMeasures } from './active-measures.ts';
import { reconcileFollowUp } from './link.ts';
import {
  createFollowUp,
  enrolPatient,
  loadStudyBundle,
  nextResearchId,
  patientReminder,
  reconcilePatient,
  recordMeasure,
  saveIntervention,
  saveStudy,
  type RepoContext,
} from './repo.ts';
import { templateById } from './templates.ts';
import { memoryDb, metricAssessment } from './testing/fixtures.ts';
import { buildStudyData, summarizeStudy } from './aggregate.ts';

const ctx = (iso = '2026-01-01T12:00:00.000Z'): RepoContext => {
  let n = 0;
  return { uid: 'clin', now: () => new Date(iso), newId: (p) => `${p}${++n}` };
};
const local = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime();

describe('nextResearchId', () => {
  it('suit le plus grand numéro attribué', () => {
    expect(nextResearchId([])).toBe('R-001');
    expect(nextResearchId(['R-002', undefined, 'X-9', 'R-010'])).toBe('R-011');
  });
});

describe('rattachement par date et par type', () => {
  it('relie questionnaire, amplitude et marche dans la fenêtre ; sans doublon', async () => {
    const db = memoryDb();
    const c = ctx();
    const tpl = templateById('surgery')!;
    const fu = await createFollowUp(db, c, {
      patientId: 'u1',
      setBy: 'patient',
      anchorDate: '2026-01-01' as IsoDate,
      measures: [
        ...tpl.measures,
        { id: 'speed', kind: 'gait_metric_at_phase', label: 'Vitesse', metricId: 'gait_speed' },
      ],
      timepoints: tpl.timepoints,
    });
    const gait = metricAssessment('g1', 'u1', '2026-01-15T10:00:00.000Z', [{ metricId: 'gait_speed', value: 1.1 }], {
      kind: 'gait',
    });
    const promLog = [
      { id: 'nprs', ts: local(2025, 12, 30), score: 6 }, // T0 (fenêtre J−3)
      { id: 'nprs', ts: local(2026, 1, 14), score: 4 }, // T+2 sem
      { id: 'nprs', ts: local(2026, 1, 25), score: 3 }, // hors fenêtre
      { id: 'sane', ts: local(2026, 1, 14), score: 70 }, // autre questionnaire
    ];
    const romLog = [
      { test: 'kn_flex', side: 'L', ts: local(2026, 1, 15), deg: 80 }, // mauvais côté
      { test: 'kn_flex', side: 'R', ts: local(2026, 1, 15), deg: 95 },
    ];
    const r = reconcileFollowUp({
      followUp: fu,
      assessments: [gait],
      promLog,
      romLog,
      today: '2026-01-16',
      ownerUid: 'u1',
      nowIso: '2026-01-16T12:00:00.000Z' as never,
    });
    expect(r.changed).toBe(true);
    expect(Object.keys(r.done).sort()).toEqual(['t0', 'w2']);
    expect(r.done['w2']).toContain('g1');
    const created = r.created.map((a) => [
      a.kind,
      a.metrics[0]!.metricId,
      a.metrics[0]!.value,
      a.metrics[0]!.side ?? null,
    ]);
    expect(created).toEqual([
      ['prom', 'nprs', 6, null],
      ['prom', 'nprs', 4, null],
      ['rom', 'kn_flex', 95, 'right'],
    ]);
    expect(r.created.every((a) => a.videoRetained === false && a.conditions?.['source'])).toBe(true);
    // Deuxième passage avec les évaluations enregistrées : rien de nouveau.
    const again = reconcileFollowUp({
      followUp: { ...fu, done: r.done },
      assessments: [gait, ...r.created],
      promLog,
      romLog,
      today: '2026-01-16',
      ownerUid: 'u1',
      nowIso: '2026-01-16T12:00:00.000Z' as never,
    });
    expect(again.created).toEqual([]);
    expect(again.changed).toBe(false);
  });
});

describe('dépôt (base en mémoire)', () => {
  it('étude : gabarit → inscription → mesures → synthèse ; mesures actives pour la capture', async () => {
    const db = memoryDb();
    const c = ctx();
    const tpl = templateById('botox')!;
    const s = await saveStudy(db, c, {
      name: 'Toxine mollet',
      templateId: tpl.id,
      measures: tpl.measures,
      timepoints: tpl.timepoints,
      conditions: tpl.conditions,
      anonymizeExports: true,
    });
    const iv = await saveIntervention(db, c, {
      patientId: 'p1',
      type: 'botulinum_toxin',
      date: '2026-01-01' as IsoDate,
      details: { site: 'Gastrocnémien', dose: '' },
    });
    expect(iv.details).toEqual({ site: 'Gastrocnémien' });
    const { followUp, patient } = await enrolPatient(db, c, s.id, 'p1', '2026-01-01' as IsoDate, iv.id);
    expect(patient.researchId).toBe('R-001');
    expect((await enrolPatient(db, c, s.id, 'p2', '2026-01-05' as IsoDate)).patient.researchId).toBe('R-002');
    // Réinscription : même suivi, pas de doublon.
    const again = await enrolPatient(db, c, s.id, 'p1', '2026-01-02' as IsoDate);
    expect(again.followUp.id).toBe(followUp.id);
    expect(again.study.patientIds).toEqual(['p1', 'p2']);

    const active = await getActiveMeasures(db, 'p1' as never);
    expect(active.map((m) => m.id).sort()).toEqual(tpl.measures.map((m) => m.id).sort());

    const rom = tpl.measures.find((m) => m.kind === 'rom')!;
    await recordMeasure(db, c, again.followUp, 't0', { measure: rom, value: 5, source: 'manual' });
    const fu2 = (await db.get('followups', followUp.id))!;
    await recordMeasure(db, c, fu2, 'w2', { measure: rom, value: 12, source: 'manual' });

    const b = (await loadStudyBundle(db, s.id))!;
    const data = buildStudyData(b.study, b.patients, b.assessments, b.followups);
    const cell = summarizeStudy(b.study, data).find((x) => x.measureId === rom.id && x.timepointId === 'w2')!;
    expect(cell).toMatchObject({ n: 1, deltaMean: 7 });

    // Modifier l'étude met à jour les suivis inscrits.
    await saveStudy(db, c, {
      ...s,
      id: s.id,
      timepoints: [...s.timepoints, { id: 'w24', label: 'T+24 sem', offsetDays: 168 }],
    });
    expect((await db.get('followups', followUp.id))!.timepoints).toHaveLength(5);
  });

  it('rappel : échéances à faire après rattachement du journal', async () => {
    const db = memoryDb();
    const c = ctx();
    const tpl = templateById('msk_injection')!;
    await createFollowUp(db, c, {
      patientId: 'u1',
      setBy: 'patient',
      anchorDate: '2026-01-01' as IsoDate,
      measures: tpl.measures.filter((m) => m.metricId === 'nprs'),
      timepoints: tpl.timepoints,
    });
    expect(await patientReminder(db, 'u1', '2026-01-15')).toMatchObject({ due: 1, overdue: 1 });
    await reconcilePatient(
      db,
      c,
      'u1',
      {
        promLog: [
          { id: 'nprs', ts: local(2026, 1, 1), score: 5 },
          { id: 'nprs', ts: local(2026, 1, 15), score: 3 },
        ],
      },
      '2026-01-15',
    );
    expect(await patientReminder(db, 'u1', '2026-01-15')).toMatchObject({ due: 0, overdue: 0 });
  });
});
