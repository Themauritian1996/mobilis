import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LandmarkSmoother,
  OneEuro,
  Pacer,
  SubjectGuard,
  canvasSize,
  delegates,
  fitRect,
  fromCanvas,
  poseColors,
  projectLandmarks,
  toCanvas,
} from './overlay.ts';

afterEach(() => vi.unstubAllGlobals());

describe('géométrie', () => {
  it('canvasSize : plafonne le DPR et garde au moins 1 pixel', () => {
    expect(canvasSize(100, 50, 3)).toEqual({ W: 200, H: 100, k: 2 });
    expect(canvasSize(100, 50, 0.5)).toEqual({ W: 100, H: 50, k: 1 });
    expect(canvasSize(0, 0)).toEqual({ W: 1, H: 1, k: 1 });
  });
  it('fitRect : cover rogne, contain laisse des bandes, dimensions invalides = identité', () => {
    expect(fitRect(200, 100, 100, 100, 'cover')).toEqual({ sc: 1, ox: -50, oy: 0, w: 200, h: 100 });
    expect(fitRect(200, 100, 100, 100, 'contain')).toEqual({ sc: 0.5, ox: 0, oy: 25, w: 100, h: 50 });
    expect(fitRect(0, 100, 100, 80)).toEqual({ sc: 1, ox: 0, oy: 0, w: 100, h: 80 });
  });
  it('toCanvas / fromCanvas sont inverses, avec ou sans miroir', () => {
    for (const mirror of [false, true]) {
      const p = toCanvas({ x: 0.25, y: 0.75 }, 640, 480, 300, 500, { mirror });
      const q = fromCanvas(p, 640, 480, 300, 500, { mirror });
      expect(q.x).toBeCloseTo(0.25, 9);
      expect(q.y).toBeCloseTo(0.75, 9);
    }
    expect(toCanvas({ x: 0, y: 0 }, 100, 100, 100, 100, { mirror: true }).x).toBe(100);
  });
  it('projectLandmarks : coordonnées normalisées de l’écran, autres champs conservés', () => {
    const r = projectLandmarks([{ x: 0.5, y: 0.5, visibility: 0.9 }], 200, 100, 100, 100, 'cover');
    expect(r).toEqual([{ x: 0.5, y: 0.5, visibility: 0.9 }]);
    const c = projectLandmarks([{ x: 1, y: 0 }], 200, 100, 100, 100, 'contain');
    expect(c[0]?.x).toBeCloseTo(1, 9);
    expect(c[0]?.y).toBeCloseTo(0.25, 9);
  });
});

describe('filtre et lissage', () => {
  it('OneEuro : première valeur inchangée, trou de plus de 500 ms = réinitialisation', () => {
    const f = new OneEuro();
    expect(f.filter(10, 0)).toBe(10);
    expect(f.filter(10, 1000)).toBe(10);
    f.reset();
    expect(f.x).toBeNull();
  });
  it('LandmarkSmoother : écart limité à maxLag et null accepté', () => {
    const s = new LandmarkSmoother({ maxLag: 0.01 });
    // eslint-disable-next-line prefer-spread -- LandmarkSmoother.apply n’est pas Function.prototype.apply
    expect(s.apply(null, 0)).toBeNull();
    s.apply([{ x: 0, y: 0 }], 0);
    const out = s.apply([{ x: 1, y: 1 }], 33);
    expect(out[0]?.x).toBeGreaterThanOrEqual(0.99);
    expect(out[0]?.x).toBeLessThanOrEqual(1);
  });
});

describe('SubjectGuard et Pacer', () => {
  const torso = (cx: number, scale = 1) => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }));
    lm[11] = { x: cx - 0.1 * scale, y: 0.3 };
    lm[12] = { x: cx + 0.1 * scale, y: 0.3 };
    lm[23] = { x: cx - 0.1 * scale, y: 0.3 + 0.3 * scale };
    lm[24] = { x: cx + 0.1 * scale, y: 0.3 + 0.3 * scale };
    return lm;
  };
  it('box : null si un point du tronc manque', () => {
    expect(SubjectGuard.box([])).toBeNull();
    expect(SubjectGuard.box(torso(0.5))?.size).toBeCloseTo(0.3, 9);
  });
  it('garde le squelette précédent pendant un saut, puis accepte', () => {
    const g = new SubjectGuard({ maxHoldMs: 700 });
    const a = torso(0.2);
    expect(g.check(a, 0)).toEqual({ lm: a, jumped: false });
    const b = torso(0.9, 1.0);
    expect(g.check(b, 100)).toEqual({ lm: a, jumped: true });
    expect(g.check(b, 900)).toEqual({ lm: b, jumped: false });
    expect(g.check(null, 1000)).toEqual({ lm: null, jumped: false });
  });
  it('Pacer : respecte la cadence minimale', () => {
    const p = new Pacer(10);
    expect(p.due(0)).toBe(true);
    p.done(0, 10);
    expect(p.due(50)).toBe(false);
    expect(p.due(100)).toBe(true);
  });
});

describe('environnement', () => {
  it('delegates : GPU puis CPU, ou CPU seulement si imposé ; stockage indisponible toléré', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(delegates()).toEqual(['GPU', 'CPU']);
    vi.stubGlobal('localStorage', { getItem: () => 'CPU' });
    expect(delegates()).toEqual(['CPU']);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqué');
      },
    });
    expect(delegates()).toEqual(['GPU', 'CPU']);
  });
  it('poseColors : couleurs par défaut hors navigateur', () => {
    expect(poseColors()).toEqual({ ok: '#2dd4bf', bad: '#ff7a59' });
  });
});
