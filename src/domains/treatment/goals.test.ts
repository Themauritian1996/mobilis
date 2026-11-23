import { describe, expect, it } from 'vitest';
import { errorOf, gapTo, trackGoal, trackGoals } from './goals.ts';
import type { PlanSource, TreatmentGoal } from './types.ts';

const goal = (p: Partial<TreatmentGoal> = {}): TreatmentGoal => ({
  id: 'g1',
  metricId: 'ankle_msw',
  comparator: '>=',
  target: 0,
  unit: '°',
  label: 'Cheville ≥ 0°',
  side: 'L',
  refs: [],
  thresholdType: 'proposed_heuristic',
  validated: true,
  ...p,
});
const at = (
  id: string,
  date: string,
  metricId: string,
  value: number | null,
  side: 'L' | 'R' | undefined = 'L',
  unit = '°',
): PlanSource => ({
  id,
  performedAt: `${date}T10:00:00Z`,
  kind: 'gait',
  findings: [],
  determinants: [],
  metrics: [{ id: metricId, ...(side ? { side } : {}), value, unit, confidence: 0.8, estimate: false }],
});

describe('erreur de mesure', () => {
  it('reprend celle du moteur de marche (cheville 7,4°, vitesse 0,10 m/s)', () => {
    expect(errorOf('ankle_msw', '°', false)?.value).toBe(7.4);
    expect(errorOf('gait_speed', 'm/s', false)?.value).toBe(0.1);
    expect(errorOf('pelvic_obliquity_swing', '°', true)?.value).toBe(3);
  });
});

describe('suivi des objectifs', () => {
  it('sans mesure : aucune donnée', () => {
    expect(trackGoal(goal(), []).status).toBe('no_data');
    expect(trackGoal(goal(), [at('a', '2026-11-01', 'autre', 3)]).status).toBe('no_data');
  });

  it('atteint : dernière valeur au-delà de la cible de plus que l’erreur', () => {
    const r = trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -12), at('b', '2026-12-01', 'ankle_msw', 4)]);
    expect(r.status).toBe('achieved');
    expect(r.withinError).toBe(true); // 4° < marge d'erreur de la cheville (7,4°) : à confirmer
  });

  it('atteint dans la marge d’erreur : signalé à confirmer', () => {
    const r = trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -12), at('b', '2026-12-01', 'ankle_msw', 2)]);
    expect(r.status).toBe('achieved');
    expect(r.withinError).toBe(true);
    expect(r.error).toBe(7.4);
    expect(r.errorSource).toContain('stenum2021');
  });

  it('atteint nettement : hors marge d’erreur', () => {
    const r = trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -12), at('b', '2026-12-01', 'ankle_msw', 10)]);
    expect(r.status).toBe('achieved');
    expect(r.withinError).toBe(false);
  });

  it('en progrès : amélioration supérieure à l’erreur sans atteindre la cible', () => {
    const r = trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -25), at('b', '2026-12-01', 'ankle_msw', -12)]);
    expect(r.status).toBe('in_progress');
    expect(r.improvement).toBe(13);
    expect(r.remaining).toBe(12);
  });

  it('non atteint : amélioration dans la marge d’erreur, ou recul', () => {
    expect(
      trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -12), at('b', '2026-12-01', 'ankle_msw', -8)]).status,
    ).toBe('not_achieved');
    const back = trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -12), at('b', '2026-12-01', 'ankle_msw', -30)]);
    expect(back.status).toBe('not_achieved');
    expect(back.improvement).toBeLessThan(0);
  });

  it('une seule mesure : atteint ou non atteint, jamais « en progrès »', () => {
    expect(trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', -12)]).status).toBe('not_achieved');
    expect(trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', 3)]).status).toBe('achieved');
  });

  it('comparateur « ≤ » (arc de circumduction, en m)', () => {
    const g = goal({ metricId: 'foot_lateral_excursion_swing', comparator: '<=', target: 0.03, unit: 'm' });
    const m = (id: string, d: string, v: number) => at(id, d, 'foot_lateral_excursion_swing', v, 'L', 'm');
    expect(trackGoal(g, [m('a', '2026-11-01', 0.08), m('b', '2026-12-01', 0.02)]).status).toBe('achieved');
    expect(trackGoal(g, [m('a', '2026-11-01', 0.1), m('b', '2026-12-01', 0.06)]).status).toBe('in_progress');
  });

  it('comparateur « = » : atteint à l’erreur près', () => {
    const g = goal({ comparator: '=', target: 10 });
    expect(trackGoal(g, [at('a', '2026-11-01', 'ankle_msw', 14)]).status).toBe('achieved');
    expect(trackGoal(g, [at('a', '2026-11-01', 'ankle_msw', 30)]).status).toBe('not_achieved');
  });

  it('les évaluations sont triées par date et la valeur sans côté sert de repli (vitesse)', () => {
    const g = goal({ metricId: 'gait_speed', target: 0.8, unit: 'm/s' });
    const sp = (id: string, d: string, v: number) => at(id, d, 'gait_speed', v, undefined, 'm/s');
    const r = trackGoal(g, [sp('b', '2026-12-01', 0.9), sp('a', '2026-11-01', 0.5)]);
    expect(r.points.map((p) => p.assessmentId)).toEqual(['a', 'b']);
    expect(r.status).toBe('achieved');
    expect(r.error).toBe(0.1);
  });

  it('trackGoals ne garde que les évaluations postérieures au début du plan', () => {
    const list = [at('old', '2026-09-01', 'ankle_msw', 5), at('new', '2026-12-01', 'ankle_msw', -20)];
    const r = trackGoals([goal()], list, '2026-11-01T00:00:00Z');
    expect(r[0]?.points.map((p) => p.assessmentId)).toEqual(['new']);
    expect(r[0]?.status).toBe('not_achieved');
  });

  it('valeur nulle ignorée', () => {
    expect(trackGoal(goal(), [at('a', '2026-11-01', 'ankle_msw', null)]).status).toBe('no_data');
  });
});

describe('écart à la cible', () => {
  it('est nul quand la cible est atteinte', () => {
    expect(gapTo(5, { comparator: '>=', target: 0 })).toBe(0);
    expect(gapTo(-5, { comparator: '>=', target: 0 })).toBe(5);
    expect(gapTo(0.05, { comparator: '<=', target: 0.03 })).toBeCloseTo(0.02);
  });
});
