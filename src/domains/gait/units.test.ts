import { describe, expect, it } from 'vitest';
import { WINTER_PROPORTIONS } from './calibration.ts';
import { DEFAULT_GAIT_CONFIG } from './config.ts';
import { perryPhases } from './cycles.ts';
import { GAIT_FINDINGS } from './data/findings.ts';
import { NORMS, normFor, PHASES, reference, refStatus } from './data/norms.ts';
import { dominantPeriod } from './events.ts';
import { evaluateCriterion, metricSource, threshold, pick } from './rules.ts';
import { angle3, butterworthLowPass, filtfilt, findPeaks, interpolateGaps, lowPass, mean, sd } from './signal.ts';
import type { GaitAnalysis, GaitMetric } from './types.ts';
import { PROSTHETIC_DEVIATIONS, PROSTHETIC_CATALOG } from '../prosthetics/index.ts';

describe('signal', () => {
  it('Butterworth : gain unitaire en continu, atténuation au-delà de la coupure', () => {
    const c = butterworthLowPass(6, 60);
    expect(c.b.reduce((a, b) => a + b, 0) / (1 + c.a[1] + c.a[2])).toBeCloseTo(1, 10);
    const n = 600;
    const slow = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 1 * i) / 60));
    const fast = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 20 * i) / 60));
    const fs = filtfilt(c, slow);
    const ff = filtfilt(c, fast);
    expect(sd(fs.slice(100, 500)) / sd(slow.slice(100, 500))).toBeGreaterThan(0.97);
    expect(sd(ff.slice(100, 500))).toBeLessThan(0.02);
    // Phase nulle : pas de décalage du pic.
    const i0 = fs.slice(100, 160).indexOf(Math.max(...fs.slice(100, 160)));
    const i1 = slow.slice(100, 160).indexOf(Math.max(...slow.slice(100, 160)));
    expect(Math.abs(i0 - i1)).toBeLessThanOrEqual(1);
  });

  it('lowPass conserve les NaN et filtre chaque segment', () => {
    const x = [1, 1, 1, 1, 1, NaN, NaN, 2, 2, 2, 2, 2];
    const y = lowPass(x, 6, 30);
    expect(Number.isNaN(y[5]!)).toBe(true);
    expect(y[0]).toBeCloseTo(1, 6);
    expect(y[11]).toBeCloseTo(2, 6);
  });

  it('interpolation des trous courts seulement', () => {
    const r = interpolateGaps([0, NaN, NaN, 3, NaN, NaN, NaN, NaN, 8], 2);
    expect(r.values.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(r.filled[1]).toBe(true);
    expect(Number.isNaN(r.values[5]!)).toBe(true);
  });

  it('pics, angle, période', () => {
    const x = Array.from({ length: 300 }, (_, i) => Math.sin((2 * Math.PI * i) / 30));
    expect(findPeaks(x, 'max', 15, 0.5)).toHaveLength(10);
    expect(dominantPeriod(x, 20, 60)).toBe(30);
    expect(angle3({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 10);
    expect(mean([1, NaN, 3])).toBe(2);
  });
});

describe('données sourcées', () => {
  it('normes : références conservées, Bohannon 1997 par défaut, Hollman ≥ 70 ans, Bohannon 2011 seul 80–99 ans', () => {
    expect(NORMS.schemaVersion).toBe(1);
    const young = normFor('gait_speed', { heightCm: 170, ageYears: 25, sex: 'F' })!;
    expect(young.ref).toBe('bohannon1997');
    expect(young.mean).toBeCloseTo(1.407, 3);
    expect(young.sd).toBeCloseTo(0.175, 3);
    expect(normFor('gait_speed', { heightCm: 170, ageYears: 72, sex: 'M' })!.ref).toBe('hollman2011');
    const old = normFor('gait_speed', { heightCm: 170, ageYears: 85, sex: 'M' })!;
    expect(old.ref).toBe('bohannon2011');
    expect(old.sd).toBeNull();
    expect(normFor('gait_speed', { heightCm: 120, ageYears: 10 })).toBeNull();
    expect(normFor('cadence', { heightCm: 170, ageYears: 35, sex: 'M' })!.ref).toBe('oberg1993');
    expect(normFor('peak_knee_flexion_swing', { heightCm: 170 })!.ref).toBe('oberg1994');
    // Normes vides (to_verify) : pas de comparaison.
    expect(normFor('contralateral_pelvic_drop', { heightCm: 170 })).toBeNull();
    expect(normFor('step_width', { heightCm: 170, ageYears: 40 })).toBeNull();
  });

  it('références : déterminants vérifiés, statuts', () => {
    expect(reference('saunders1953')!.year).toBe(1953);
    expect(reference('kuo2007')!.doi).toBe('10.1016/j.humov.2007.04.003');
    expect(refStatus('webster2019')).toBe('to_verify');
    expect(refStatus(null)).toBe('to_verify');
    expect(WINTER_PROPORTIONS.ref).toBe('winter2009');
  });

  it('phases de Perry : norme et recalage sur les événements', () => {
    expect(PHASES.map((p) => p.id)).toEqual(['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw']);
    const ph = perryPhases(60, 10, 50);
    expect(ph.find((p) => p.id === 'LR')!.endPct).toBe(10);
    expect(ph.find((p) => p.id === 'PSw')!.endPct).toBe(60);
    expect(ph.at(-1)!.endPct).toBe(100);
  });

  it('catalogues : tous les défauts et déviations du JSON sont couverts', () => {
    expect(GAIT_FINDINGS).toHaveLength(18);
    expect(PROSTHETIC_DEVIATIONS).toHaveLength(PROSTHETIC_CATALOG.deviations.length);
    for (const f of [...GAIT_FINDINGS, ...PROSTHETIC_DEVIATIONS]) expect(f.determinants.length).toBeGreaterThan(0);
  });
});

describe('règles : concordance entre cycles', () => {
  const m = (perCycle: number[]): GaitMetric => ({
    id: 'ankle_msw',
    side: 'L',
    value: mean(perCycle),
    unit: '°',
    view: 'sagittal-left',
    confidence: 0.9,
    estimate: false,
    perCycle,
  });
  const src = (perCycle: number[]) =>
    metricSource([{ view: 'sagittal-left', metrics: [m(perCycle)] } as unknown as GaitAnalysis], DEFAULT_GAIT_CONFIG);
  const spec = {
    id: 'x',
    role: 'primary' as const,
    text: 'x',
    metric: 'ankle_msw',
    thresholdType: 'proposed_heuristic' as const,
    refs: [],
    evaluate: threshold(pick.self('ankle_msw'), 'below', 0, -5),
  };
  it('≥ 2/3 des cycles : confiant ; sinon rétrogradé', () => {
    expect(evaluateCriterion(spec, src([-10, -9, -8]), 'L').status).toBe('confident');
    expect(evaluateCriterion(spec, src([-30, 1, 2]), 'L').status).toBe('doubt');
    expect(evaluateCriterion(spec, src([-2, -3, -1]), 'L').status).toBe('doubt');
    expect(evaluateCriterion(spec, src([2, 3, 1]), 'L').status).toBe('absent');
    expect(evaluateCriterion(spec, src([2, 3, 1]), 'R').status).toBe('unavailable');
  });
});
