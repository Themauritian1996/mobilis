import { describe, expect, it } from 'vitest';
import type { FollowUp, FollowUpId, MeasureDefinition } from '../../core/types/clinical.ts';
import type { IsoDate } from '../../core/types/common.ts';
import {
  addDays,
  daysBetween,
  followUpSchedule,
  reminderSummary,
  timepointForDate,
  toleranceDays,
} from './schedule.ts';

const measures: MeasureDefinition[] = [
  { id: 'pain', kind: 'prom', label: 'Douleur', metricId: 'pain_nrs' },
  { id: 'rom', kind: 'rom', label: 'Flexion', metricId: 'kn_flex', side: 'right' },
];
const fu = (done: FollowUp['done'] = {}): Pick<FollowUp, 'anchorDate' | 'timepoints' | 'measures' | 'done'> => ({
  anchorDate: '2026-01-01' as IsoDate,
  measures,
  timepoints: [
    { id: 'w2', label: 'T+2 sem', offsetDays: 14 },
    { id: 't0', label: 'T0', offsetDays: 0 },
    { id: 'w6', label: 'T+6 sem', offsetDays: 42 },
  ],
  done,
});

describe('dates', () => {
  it('additionne les jours en traversant mois et années', () => {
    expect(addDays('2026-01-25', 14)).toBe('2026-02-08');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
  });
  it('rejette une date invalide', () => {
    expect(() => addDays('2026/01/01', 1)).toThrow(RangeError);
  });
  it('tolérance : 3 j à T0, 15 % bornée à 2–14 j', () => {
    expect(toleranceDays(0)).toBe(3);
    expect(toleranceDays(7)).toBe(2);
    expect(toleranceDays(42)).toBe(6);
    expect(toleranceDays(365)).toBe(14);
  });
});

describe('followUpSchedule', () => {
  it('trie par délai, calcule échéances et fenêtres', () => {
    const s = followUpSchedule(fu(), '2026-01-01');
    expect(s.map((x) => x.timepoint.id)).toEqual(['t0', 'w2', 'w6']);
    expect(s[1]).toMatchObject({ dueDate: '2026-01-15', windowStart: '2026-01-13', windowEnd: '2026-01-17' });
    expect(s.map((x) => x.status)).toEqual(['due', 'upcoming', 'upcoming']);
    expect(s[1]!.daysUntil).toBe(14);
  });
  it('à faire dans la fenêtre, en retard après, fait quand toutes les mesures sont faites', () => {
    expect(followUpSchedule(fu(), '2026-01-13')[1]!.status).toBe('due');
    expect(followUpSchedule(fu(), '2026-01-17')[1]!.status).toBe('due');
    const late = followUpSchedule(fu(), '2026-01-18');
    expect(late[0]!.status).toBe('overdue');
    expect(late[1]!.status).toBe('overdue');
    const partial = followUpSchedule(fu(), '2026-01-14', { completed: { w2: ['pain'] } })[1]!;
    expect(partial.status).toBe('partial');
    expect(partial.pendingMeasures.map((m) => m.id)).toEqual(['rom']);
    expect(followUpSchedule(fu(), '2026-03-01', { completed: { w2: ['pain', 'rom'] } })[1]!.status).toBe('done');
  });
  it('sans détail par mesure, une évaluation dans done[tp] coche tout le point', () => {
    const s = followUpSchedule(fu({ t0: ['a1' as never] }), '2026-02-01');
    expect(s[0]!.status).toBe('done');
    expect(s[1]!.status).toBe('overdue');
  });
});

describe('timepointForDate', () => {
  it('rattache à la fenêtre qui contient la date, sinon null (strict) ou le plus proche', () => {
    expect(timepointForDate(fu(), '2026-01-16')?.id).toBe('w2');
    expect(timepointForDate(fu(), '2026-01-25')).toBeNull();
    expect(timepointForDate(fu(), '2026-01-25', { strict: false })?.id).toBe('w2');
  });
});

describe('reminderSummary', () => {
  it('compte les échéances à faire et en retard et donne la prochaine', () => {
    const r = reminderSummary([{ id: 'f1' as FollowUpId, ...fu() }], '2026-01-14');
    expect(r).toMatchObject({ due: 1, overdue: 1 });
    expect(r.next?.item.timepoint.id).toBe('t0');
    const none = reminderSummary(
      [{ id: 'f1' as FollowUpId, ...fu(), completed: { t0: ['pain', 'rom'], w2: ['pain', 'rom'] } }],
      '2026-01-14',
    );
    expect(none).toMatchObject({ due: 0, overdue: 0 });
    expect(none.next?.item.timepoint.id).toBe('w6');
  });
});
