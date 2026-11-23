import { describe, expect, it } from 'vitest';
import { generateGait, variantParams } from '../../../domains/gait/testing/synthetic.ts';
import {
  CueGate,
  FpsMeter,
  HoldGate,
  StillnessDetector,
  averageFps,
  countCycles,
  fpsLevel,
  liveCheck,
  stopDecision,
  torsoSample,
  walkingDirectionIssue,
} from './live.ts';

interface Lm {
  x: number;
  y: number;
  visibility: number;
}
/** Corps debout fictif : 33 repères, tête en haut, pieds en bas, centré. */
function body(cx = 0.5, top = 0.12, bottom = 0.9, vis = 1, spread = 0.1): Lm[] {
  const lm: Lm[] = Array.from({ length: 33 }, () => ({ x: cx, y: top, visibility: vis }));
  const h = bottom - top;
  const set = (i: number, dx: number, f: number): void => {
    lm[i] = { x: cx + dx, y: top + h * f, visibility: vis };
  };
  set(0, 0, 0);
  set(7, -0.02, 0.02);
  set(8, 0.02, 0.02);
  set(11, spread, 0.2);
  set(12, -spread, 0.2);
  set(23, spread * 0.6, 0.5);
  set(24, -spread * 0.6, 0.5);
  set(25, spread * 0.6, 0.73);
  set(26, -spread * 0.6, 0.73);
  set(27, spread * 0.6, 0.94);
  set(28, -spread * 0.6, 0.94);
  set(29, spread * 0.6, 0.97);
  set(30, -spread * 0.6, 0.97);
  set(31, spread * 0.6, 1);
  set(32, -spread * 0.6, 1);
  return lm;
}

describe('fréquence d’images', () => {
  it('mesure les i/s réels et classe le niveau', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 90; i++) m.push(i * (1000 / 60));
    expect(m.fps).toBeGreaterThan(58);
    expect(m.fps).toBeLessThan(62);
    expect(fpsLevel(60)).toBe('good');
    expect(fpsLevel(35)).toBe('ok');
    expect(fpsLevel(20)).toBe('low');
    expect(averageFps([{ t: 0 }, { t: 500 }, { t: 1000 }])).toBe(2);
  });
});

describe('vérification de placement par la pose', () => {
  const base = { view: 'frontal' as const, frameW: 720, frameH: 1280 };
  it('accepte un corps entier centré, pieds visibles', () => {
    const c = liveCheck({ ...base, lm: body() });
    expect(c.fullBody && c.feetVisible && c.centered).toBe(true);
  });
  it('demande de reculer quand le corps est coupé', () => {
    const c = liveCheck({ ...base, lm: body(0.5, -0.02, 1.05) });
    expect(c.ok).toBe(false);
    expect(['moveBack', 'showBody']).toContain(c.cue);
  });
  it('signale des pieds non visibles', () => {
    const lm = body();
    for (const i of [29, 30, 31, 32]) lm[i] = { ...(lm[i] as Lm), visibility: 0.1 };
    const c = liveCheck({ ...base, lm });
    expect(c.feetVisible).toBe(false);
    expect(c.cue).toBe('feet');
  });
  it('signale un patient décentré en vue frontale mais pas en vue latérale', () => {
    expect(liveCheck({ ...base, lm: body(0.82) }).centered).toBe(false);
    const side = liveCheck({ view: 'sagittal-left', frameW: 1280, frameH: 720, lm: body(0.82, 0.12, 0.9, 1, 0.01) });
    expect(side.centered).toBe(true);
  });
  it('sans corps : noBody', () => {
    expect(liveCheck({ ...base, lm: null }).cue).toBe('noBody');
  });
});

describe('station debout immobile 2 s', () => {
  it('atteint 100 % après 2 s sans bouger et repart à zéro si le patient bouge', () => {
    const d = new StillnessDetector(2000, 0.08);
    let r = { still: false, progress: 0 };
    for (let t = 0; t <= 2100; t += 33) r = d.push(t, body(), 0.5625);
    expect(r.still).toBe(true);
    r = d.push(2200, body(0.6), 0.5625);
    expect(r.still).toBe(false);
    expect(r.progress).toBe(0);
    expect(d.since).toBe(2200);
  });
});

describe('sens de marche', () => {
  const a = torsoSample(body(0.5, 0.3, 0.7), 0.5625);
  const b = torsoSample(body(0.5, 0.2, 0.8), 0.5625);
  it('vue frontale : le tronc doit grandir ; postérieure : rapetisser', () => {
    if (!a || !b) throw new Error('tronc');
    expect(walkingDirectionIssue('frontal', a, b)).toBeNull();
    expect(walkingDirectionIssue('frontal', b, a)).toBe('toward');
    expect(walkingDirectionIssue('posterior', a, b)).toBe('away');
    expect(walkingDirectionIssue('posterior', b, a)).toBeNull();
  });
});

describe('consignes et fin automatique', () => {
  it('CueGate : pas de répétition rapprochée', () => {
    const g = new CueGate(7000, 2200);
    expect(g.offer('a', 0)).toBe(true);
    expect(g.offer('b', 1000)).toBe(false);
    expect(g.offer('a', 3000)).toBe(false);
    expect(g.offer('b', 3000)).toBe(true);
  });
  it('HoldGate : stable après la durée, tolère une brève coupure', () => {
    const g = new HoldGate(1000, 300);
    g.push(true, 0);
    g.push(false, 200);
    g.push(true, 400);
    const r = g.push(true, 1000);
    expect(r.stable).toBe(true);
    expect(g.push(false, 1200).progress).toBeGreaterThan(0);
    expect(g.push(false, 2000).progress).toBe(0);
  });
  it('stopDecision : cible atteinte, sortie du champ, arrêt, durée maximale', () => {
    const b = { elapsedMs: 6000, cycles: { L: 3, R: 3 }, target: 3, lostMs: 0, stillMs: 0 };
    expect(stopDecision(b)).toBe('target');
    expect(stopDecision({ ...b, cycles: { L: 1, R: 0 } })).toBeNull();
    expect(stopDecision({ ...b, cycles: { L: 1, R: 1 }, lostMs: 1600 })).toBe('left_frame');
    expect(stopDecision({ ...b, cycles: { L: 1, R: 1 }, stillMs: 1600 })).toBe('stopped');
    expect(stopDecision({ ...b, elapsedMs: 2000 })).toBeNull();
    expect(stopDecision({ ...b, cycles: null, elapsedMs: 46000 })).toBe('timeout');
  });
});

describe('compteur de cycles (squelette synthétique)', () => {
  it('compte des cycles valides des deux côtés', () => {
    const { frames, truth } = generateGait(variantParams('normal', { view: 'sagittal-left', fps: 30, cycles: 6 }));
    const c = countCycles(frames, 'sagittal-left', { heightCm: truth.params.heightM * 100 }, truth.imageAspect);
    expect(c).not.toBeNull();
    expect(c?.L).toBeGreaterThanOrEqual(2);
    expect(c?.R).toBeGreaterThanOrEqual(2);
  });
  it('retourne null quand il y a trop peu de trames', () => {
    expect(countCycles([], 'frontal', { heightCm: 170 }, 0.56)).toBeNull();
  });
});
