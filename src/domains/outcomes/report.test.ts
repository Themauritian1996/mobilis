import { describe, expect, it } from 'vitest';
import {
  REPORT_EVERY,
  buildReportData,
  dataFromSummary,
  lastReportTs,
  reportDue,
  reportPeriod,
  rxExtrasReport,
  summaryPart,
} from './report.ts';

const DAY = 86400000;
const NOW = Date.UTC(2025, 5, 15, 12);

describe('échéance du rapport', () => {
  it('options de fréquence', () => {
    expect(REPORT_EVERY).toEqual([0, 2, 4, 6, 8, 12]);
  });

  it('dernier rapport et échéance', () => {
    expect(lastReportTs(null)).toBeNull();
    expect(lastReportTs({ reportLog: [{ ts: 5 }, { ts: 9 }, { ts: 7 }] })).toBe(9);
    expect(reportDue(null, NOW)).toBe(false);
    expect(reportDue({ joinedAt: NOW - 20 * DAY }, NOW)).toBe(false); // pas de plan
    expect(reportDue({ joinedAt: NOW - 20 * DAY, reportPlan: { every: 2 } }, NOW)).toBe(true);
    expect(reportDue({ joinedAt: NOW - 20 * DAY, reportPlan: { every: 4 } }, NOW)).toBe(false);
    // après un rapport : l'échéance repart du dernier rapport
    const p = { joinedAt: NOW - 60 * DAY, reportPlan: { every: 2 }, reportLog: [{ ts: NOW - 3 * DAY }] };
    expect(reportDue(p, NOW)).toBe(false);
    expect(reportDue(p, NOW + 12 * DAY)).toBe(true);
    expect(reportDue({ reportPlan: { every: 2 } }, NOW)).toBe(false); // aucune date de départ
  });

  it('période : depuis le dernier rapport, sinon le début, sinon la 1re séance, sinon 4 semaines', () => {
    expect(reportPeriod({ reportLog: [{ ts: NOW - 5 * DAY }] }, [], NOW)).toEqual({ from: NOW - 5 * DAY, to: NOW });
    expect(reportPeriod({ joinedAt: NOW - 9 * DAY }, [], NOW).from).toBe(NOW - 9 * DAY);
    expect(reportPeriod({}, [{ id: 1, date: NOW - 3 * DAY, items: [] }], NOW).from).toBe(NOW - 3 * DAY);
    expect(reportPeriod({}, [], NOW).from).toBe(NOW - 28 * DAY);
    expect(reportPeriod({ reportStart: NOW + DAY }, [], NOW).from).toBe(NOW); // jamais dans le futur
  });
});

describe('données du rapport', () => {
  it('profil vide : structure complète, aucune donnée', () => {
    const d = buildReportData({}, [], [], { now: NOW });
    expect(d).toMatchObject({
      version: 1,
      source: 'full',
      sessionsCount: 0,
      adherence: { planned: 12, done: 0, pct: 0 }, // 3 jours par semaine par défaut, 28 jours
      pain: { avg: null, first: null, series: [] },
      badges: { total: 0, inPeriod: 0 },
      fields: null,
      logTruncated: false,
    });
    expect(d.period.days).toBe(28);
  });

  it('formulaire du patient : bornes, texte rogné, exercices inconnus écartés ; nom omis sur demande', () => {
    const d = buildReportData({ name: ' Camille ' }, [], [], {
      now: NOW,
      includeName: false,
      fields: {
        global: 7,
        pain: '4.6',
        goalsProgress: -3,
        goals: `  ${'x'.repeat(1500)} `,
        comment: '   ',
        hardEx: ['inconnu'],
      },
    });
    expect(d.patient.name).toBe('');
    expect(d.fields?.global).toBe(2);
    expect(d.fields?.pain).toBe(5);
    expect(d.fields?.goalsProgress).toBe(0);
    expect(d.fields?.goals).toHaveLength(1200);
    expect(d.fields).not.toHaveProperty('comment');
    expect(d.fields).not.toHaveProperty('hardEx');
    expect(buildReportData({ name: ' Camille ' }, [], [], { now: NOW }).patient.name).toBe('Camille');
    expect(buildReportData({}, [], [], { now: NOW, fields: { global: '' } }).fields).toBeNull();
  });

  it('douleur : séances et journal de la période seulement', () => {
    const sess = [
      {
        id: 1,
        date: NOW - 2 * DAY,
        items: [
          { id: 'x', sets: [], pain: 4 },
          { id: 'y', sets: [], pain: 6 },
        ],
      },
    ];
    const d = buildReportData(
      { joinedAt: NOW - 10 * DAY },
      sess,
      [{ day: '2025-06-10', pain: 2 }, { day: '2024-01-01', pain: 9 }, null],
      {
        now: NOW,
      },
    );
    expect(d.pain.series.map((p) => [p.src, p.v])).toEqual([
      ['j', 2],
      ['s', 5],
    ]);
    expect(d.pain).toMatchObject({ avg: 3.5, first: 2, last: 5, delta: 3, min: 2, max: 5 });
    expect(d.sessionsCount).toBe(1);
  });
});

describe('résumé partagé', () => {
  it('résumé vide', () => {
    const d = dataFromSummary({}, { now: NOW });
    expect(d).toMatchObject({ source: 'summary', sessionsCount: 0, adherence: { planned: null, done: 0, pct: null } });
    expect(d.period).toEqual({ from: NOW - 7 * DAY, to: NOW, days: 7 });
    expect(d.badges).toEqual({ total: 0, inPeriod: 0 });
  });

  it('adhérence plafonnée à 100 %, badges (liste ou nombre), douleur des séances', () => {
    const d = dataFromSummary(
      {
        planned: 3,
        sessions7: 5,
        badges: [1, 2],
        last: [
          { date: 2, pain: 4, n: 3 },
          { date: 1, pain: 6, n: 2 },
          { date: 3, pain: null },
        ],
      },
      { now: NOW },
    );
    expect(d.adherence.pct).toBe(100);
    expect(d.badges.total).toBe(2);
    expect(d.pain.series.map((p) => p.ts)).toEqual([1, 2]);
    expect(d.pain).toMatchObject({ avg: 5, first: 6, last: 4, delta: -2 });
    expect(d.log.map((l) => l.ts)).toEqual([1, 2, 3]);
    expect(dataFromSummary({ badges: 4 }, { now: NOW }).badges.total).toBe(0); // comportement de v1.15
    expect(dataFromSummary({ badges: { total: 6 } }, { now: NOW }).badges.total).toBe(6);
  });
});

describe('extras du programme et du résumé', () => {
  it('rxExtrasReport', () => {
    expect(rxExtrasReport({ report: { every: '4' } })).toEqual({ reportPlan: { every: 4 } });
    expect(rxExtrasReport({ report: { every: 0 } })).toEqual({ reportPlan: null });
    expect(rxExtrasReport(null)).toEqual({ reportPlan: null });
  });

  it('summaryPart : dernier rapport du patient', () => {
    expect(summaryPart(null)).toEqual({});
    expect(summaryPart({ reportLog: [] })).toEqual({});
    const p = { reportPlan: { every: 2 }, reportLog: [{ ts: 1, fields: { pain: 3 } }, { ts: 5 }] };
    expect(summaryPart(p)).toEqual({ report: { ts: 5, every: 2, fields: null, n: 2 } });
  });
});
