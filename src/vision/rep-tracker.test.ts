import { afterEach, describe, expect, it } from 'vitest';
import type { BodyKey } from './pose.ts';
import {
  FULL_MIN,
  HAND_METRICS,
  METRIC_INFO,
  PARTIAL_MIN,
  Tracker,
  bodyVisible,
  detectPlane,
  handDir3,
  metric,
  partialMinFor,
  setPartialPolicy,
  tiltCorrect,
  type Frame,
  type TrackedExercise,
} from './rep-tracker.ts';

const KEYS: BodyKey[] = [
  'nose', 'earL', 'earR', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'idxL', 'idxR', 'hipL', 'hipR',
  'knL', 'knR', 'anL', 'anR', 'heelL', 'heelR', 'ftL', 'ftR',
]; // prettier-ignore

/** Personne debout, de face, bras le long du corps. */
function standing(over: Partial<Record<BodyKey, { x: number; y: number }>> = {}): Frame {
  const base: Record<string, { x: number; y: number }> = {
    nose: { x: 100, y: 20 }, earL: { x: 90, y: 22 }, earR: { x: 110, y: 22 },
    shL: { x: 85, y: 50 }, shR: { x: 115, y: 50 }, elL: { x: 78, y: 80 }, elR: { x: 122, y: 80 },
    wrL: { x: 78, y: 110 }, wrR: { x: 122, y: 110 }, idxL: { x: 78, y: 118 }, idxR: { x: 122, y: 118 },
    hipL: { x: 85, y: 110 }, hipR: { x: 115, y: 110 }, knL: { x: 85, y: 150 }, knR: { x: 115, y: 150 },
    anL: { x: 85, y: 190 }, anR: { x: 115, y: 190 }, heelL: { x: 83, y: 195 }, heelR: { x: 117, y: 195 },
    ftL: { x: 95, y: 195 }, ftR: { x: 125, y: 195 },
  }; // prettier-ignore
  const p = {} as Frame;
  for (const k of KEYS) p[k] = { ...(over[k] ?? base[k]!), v: 1 };
  return p;
}

describe('metric', () => {
  it('jambe tendue : genou et hanche à 180°', () => {
    const p = standing();
    expect(metric('knee', p, 'L')).toBeCloseTo(180, 6);
    expect(metric('hip', p, 'R')).toBeCloseTo(180, 6);
  });
  it('genou fléchi : angle plus petit ; « both » moyenne les deux côtés', () => {
    const p = standing({ knL: { x: 85, y: 150 }, anL: { x: 40, y: 150 } });
    const left = metric('knee', p, 'L');
    expect(left).toBeLessThan(120);
    expect(metric('knee', p, 'L', { both: true })).toBeCloseTo((left + metric('knee', p, 'R')) / 2, 9);
  });
  it('mesures de la main : NaN sans points de main', () => {
    expect(metric('hClose', standing(), null)).toBeNaN();
    expect([...HAND_METRICS].every((m) => m in METRIC_INFO)).toBe(true);
  });
  it('hAxis : main verticale = 0°', () => {
    const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    hand[0] = { x: 50, y: 100 };
    hand[9] = { x: 50, y: 40 };
    expect(metric('hAxis', { hand }, null)).toBeCloseTo(0, 9);
  });
});

describe('orientation et visibilité', () => {
  it('detectPlane : de face quand les épaules sont larges, de côté quand elles se superposent', () => {
    expect(detectPlane(standing({ shL: { x: 92, y: 50 }, shR: { x: 108, y: 50 } }))).toBe('between');
    const side = standing({ shL: { x: 100, y: 50 }, shR: { x: 102, y: 50 } });
    expect(detectPlane(side)).toBe('side');
    const front = standing({ shL: { x: 60, y: 50 }, shR: { x: 140, y: 50 } });
    expect(detectPlane(front)).toBe('front');
  });
  it('bodyVisible exige épaules et hanches visibles', () => {
    const p = standing();
    expect(bodyVisible(p)).toBe(true);
    p.hipL = { ...p.hipL, v: 0.2 };
    expect(bodyVisible(p)).toBe(false);
  });
});

describe('main : correction de biais et direction 3D', () => {
  it('tiltCorrect : jamais de réduction, au plus +35 %, rien sous 4°', () => {
    expect(tiltCorrect(10, null)).toBe(10);
    expect(tiltCorrect(3, 50)).toBe(3);
    expect(tiltCorrect(10, 5)).toBe(10);
    expect(tiltCorrect(10, 11)).toBeCloseTo(11, 9);
    expect(tiltCorrect(10, 40)).toBeCloseTo(13.5, 9);
    expect(tiltCorrect(-10, 40)).toBeCloseTo(-13.5, 9);
  });
  it('handDir3 : null sans points 3D, vecteur unitaire sinon', () => {
    const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    expect(handDir3('hAxis', { hand })).toBeNull();
    const hand3 = hand.map((h) => ({ ...h, z: 0 }));
    hand3[9] = { x: 0, y: 0.1, z: 0 };
    const d = handDir3('hAxis', { hand, hand3 });
    expect(d?.y).toBeCloseTo(1, 9);
    expect(handDir3('hPinch', { hand, hand3 })).toBeNull();
  });
});

describe('partialMinFor', () => {
  const ex: TrackedExercise = { track: { mode: 'reps', planes: {} } };
  afterEach(() => setPartialPolicy(null));
  it('valeur numérique bornée, false = amplitude complète', () => {
    expect(partialMinFor(ex, undefined, 0.1)).toBe(0.25);
    expect(partialMinFor(ex, undefined, 0.9)).toBe(FULL_MIN);
    expect(partialMinFor(ex, undefined, false)).toBe(FULL_MIN);
    expect(partialMinFor(ex, undefined)).toBe(PARTIAL_MIN);
    expect(partialMinFor(ex, { metric: 'knee', partialMin: 0.5 })).toBe(0.5);
  });
  it('la règle de l’exercice peut exiger l’amplitude complète', () => {
    setPartialPolicy(() => false);
    expect(partialMinFor(ex, undefined)).toBe(FULL_MIN);
    setPartialPolicy(() => {
      throw new Error('règle défaillante');
    });
    expect(partialMinFor(ex, undefined)).toBe(PARTIAL_MIN);
  });
});

describe('Tracker : répétitions', () => {
  const ex: TrackedExercise = {
    track: { mode: 'reps', planes: { side: { metric: 'knee', from: 175, to: 90, side: 'L' } } },
  };
  const knee = (deg: number): Frame => {
    const a = (deg * Math.PI) / 180;
    return standing({ anL: { x: 85 + 40 * Math.sin(a), y: 150 - 40 * Math.cos(a) } });
  };
  it('calibre puis compte 3 répétitions complètes', () => {
    const reps: number[] = [];
    const tr = new Tracker(ex, 'side', { side: 'L', onRep: (r) => reps.push(r.n) });
    let t = 0;
    const step = (deg: number): void => {
      t += 33;
      tr.update(knee(deg), t);
    };
    for (let i = 0; i < 40; i++) step(178);
    expect(tr.calibrated).toBe(true);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i <= 45; i++) step(178 - (88 * i) / 45);
      for (let i = 0; i < 20; i++) step(90);
      for (let i = 0; i <= 45; i++) step(90 + (88 * i) / 45);
      for (let i = 0; i < 25; i++) step(178);
    }
    const s = tr.summary();
    expect(s.reps).toBe(3);
    expect(s.full).toBe(3);
    expect(reps).toEqual([1, 2, 3]);
    expect(s.quality).toBeGreaterThan(0.5);
  });
  it('immobile : aucune répétition', () => {
    const tr = new Tracker(ex, 'side', { side: 'L' });
    for (let i = 0; i < 200; i++) tr.update(knee(178), 33 * (i + 1));
    expect(tr.summary().reps).toBe(0);
    expect(tr.calibrated).toBe(true);
  });
  it('flagRep déclasse la dernière répétition complète', () => {
    const tr = new Tracker(ex, 'side', { side: 'L' });
    tr.repLog.push({
      n: 1, full: true, dur: 2, faults: [], quality: 1, peak: 1,
      meas: { metric: 'knee', peakValue: 90, targetValue: 90, romPct: 100, minRepSec: 1, checks: [] },
    }); // prettier-ignore
    tr.reps = 1;
    tr.full = 1;
    tr.flagRep('valgus');
    const s = tr.summary();
    expect([s.full, s.partial]).toEqual([0, 1]);
    expect(s.faults.valgus).toBe(1);
    expect(s.reps_detail[0]?.quality).toBe(0.6);
  });
});

describe('Tracker : maintien', () => {
  it('compte le temps passé dans la plage', () => {
    const ex: TrackedExercise = {
      track: { mode: 'hold', planes: { side: { metric: 'knee', min: 160, max: 185, side: 'L' } } },
    };
    const tr = new Tracker(ex, 'side', { side: 'L' });
    for (let i = 0; i < 150; i++) tr.update(standing(), 33 * (i + 1));
    expect(tr.summary().holdSec).toBeGreaterThanOrEqual(3);
  });
});
