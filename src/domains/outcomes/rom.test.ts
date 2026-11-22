import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Rom from './rom.ts';
import type { RomLogRow } from './rom.ts';

const DAY = 86400000;
// Les modules legacy lisent `window` / `localStorage` à l'import : navigateur minimal simulé avant le chargement.
let R: typeof Rom;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  R = await import('./rom.ts');
});

const log: RomLogRow[] = [
  { test: 'sh_flex', side: 'L', deg: 100, ts: 1 * DAY },
  { test: 'sh_flex', side: 'L', deg: 130, ts: 3 * DAY, method: 'manual' },
  { test: 'sh_flex', side: 'R', deg: 150, ts: 2 * DAY },
  { test: 'inconnu', deg: 5, ts: 4 * DAY },
];

describe('rom (logique pure)', () => {
  it('itemKey et planEvery', () => {
    expect(R.itemKey('sh_flex', 'L')).toBe('sh_flex_L');
    expect(R.itemKey('lumb_flex', null)).toBe('lumb_flex_-');
    expect(R.planEvery({ every: 4 })).toBe(4);
    expect(R.planEvery({ every: -3 })).toBe(0);
    expect(R.planEvery(null)).toBe(0);
  });

  it('planItems normalise les formes acceptées et ignore les tests inconnus', () => {
    expect(R.planItems(['sh_flex_L'])).toEqual([{ test: 'sh_flex', side: 'L' }]);
    expect(R.planItems(['sh_flex'])).toEqual([
      { test: 'sh_flex', side: 'L' },
      { test: 'sh_flex', side: 'R' },
    ]);
    expect(R.planItems({ tests: [{ test: 'sh_flex', side: 'R' }, 'nope', { test: 'sh_flex', side: 'R' }] })).toEqual([
      { test: 'sh_flex', side: 'R' },
    ]);
    expect(R.planItems(undefined)).toEqual([]);
  });

  it('seriesOf filtre par côté et trie par date', () => {
    expect(R.seriesOf(log, 'sh_flex', 'L').map((r) => r.deg)).toEqual([100, 130]);
    expect(R.seriesOf(log, 'sh_flex', 'R').map((r) => r.deg)).toEqual([150]);
    expect(R.seriesOf(undefined, 'sh_flex', 'L')).toEqual([]);
  });

  it('trend calcule gain, dernière valeur et écart entre côtés', () => {
    const tr = R.trend(log, 'sh_flex', 'L');
    expect(tr.n).toBe(2);
    expect(tr.baseline).toBe(100);
    expect(tr.last).toBe(130);
    expect(tr.gain).toBe(30);
    expect(tr.sideDiff).toBe(-20);
    expect(R.trend([], 'sh_flex', 'L').n).toBe(0);
  });

  it('summaryPart : vide sans journal, sinon une ligne par test et côté', () => {
    expect(R.summaryPart({})).toEqual({});
    const part = R.summaryPart({ romLog: log });
    expect(part.rom).toHaveLength(2);
    const left = part.rom?.find((r) => r.s === 'L');
    expect(left).toMatchObject({ t: 'sh_flex', b: 100, l: 130, g: 30, n: 2, m: 'manual' });
    expect(left?.p).toEqual([
      [1 * DAY, 100],
      [3 * DAY, 130],
    ]);
  });
  it('romHash, fmtVal et fmtGain', () => {
    expect(R.romHash('sh_flex', 'L')).toBe('#/rom/sh_flex/L');
    expect(R.romHash('lumb_flex', null)).toBe('#/rom/lumb_flex/-');
    expect(R.fmtVal(92.4, { unit: '°' })).toBe('92°');
    expect(R.fmtVal(41.6, { unit: '%' })).toBe('42 %');
    expect(R.fmtVal(null)).toBe('–');
    expect(R.fmtGain(12.4)).toBe('+12°');
    expect(R.fmtGain(-5, { unit: '%' })).toBe('−5 %');
    expect(R.fmtGain(0)).toBe('0°');
    expect(R.fmtGain(undefined)).toBe('–');
  });

  it('planeScore et confidence', () => {
    expect(R.planeScore('side', null)).toBe(0.85);
    expect(R.planeScore('side', 0.1)).toBe(1);
    expect(R.planeScore('side', 0.8)).toBe(0.3);
    expect(R.planeScore('front', 0.7)).toBe(1);
    expect(R.confidence({ vis: 0.95, ratio: 0.1, view: 'side', sd: 0.5 })).toBeGreaterThanOrEqual(0.99);
    expect(R.confidence({ vis: 0.5, ratio: 0.1, view: 'side', sd: 0.5 })).toBeLessThan(R.CONF_MIN);
    expect(R.confLabel(0.8)).toBe('good');
    expect(R.confLabel(0.6)).toBe('fair');
    expect(R.confLabel(0.2)).toBe('low');
  });

  it('bestTrial : le meilleur essai fiable, dans le sens du test', () => {
    const trials = [
      { deg: 100, conf: 0.9 },
      { deg: 140, conf: 0.2 },
      { deg: 120, conf: 0.8 },
    ];
    expect(R.bestTrial(trials)).toEqual({ deg: 120, conf: 0.8 });
    expect(R.bestTrial(trials, { dir: -1 })).toEqual({ deg: 100, conf: 0.9 });
    expect(R.bestTrial([{ deg: 90, conf: 0.1 }])).toBeNull();
    expect(R.bestTrial(null)).toBeNull();
  });

  it('HoldDetector / findHold : un maintien stable loin du départ est détecté', () => {
    const samples = [];
    for (let i = 0; i < 10; i++) samples.push({ t: i * 50, deg: 5, vis: 1, ratio: 0.1 });
    for (let i = 0; i < 12; i++) samples.push({ t: 500 + i * 50, deg: 5 + i * 10, vis: 1, ratio: 0.1 });
    for (let i = 0; i < 40; i++) samples.push({ t: 1100 + i * 50, deg: 120 + (i % 2), vis: 1, ratio: 0.1 });
    const hold = R.findHold(samples, { minTravel: 25 });
    expect(hold).not.toBeNull();
    expect(hold?.deg).toBeGreaterThan(115);
    expect(R.findHold(samples.slice(0, 22), { minTravel: 25 })).toBeNull();
    const det = new R.HoldDetector();
    expect(det.push({ t: 0, deg: NaN, vis: 0 }).state).toBe('lost');
  });

  it('due / dueForProfile : départ, puis rappel selon la fréquence', () => {
    const plan = { tests: [{ test: 'sh_flex', side: 'L' }], every: 2 };
    const now = 100 * DAY;
    expect(R.due(plan, [], 0, now)).toEqual([
      { test: 'sh_flex', side: 'L', reason: 'baseline', last: null, dueTs: now },
    ]);
    const done = [{ test: 'sh_flex', side: 'L', deg: 90, ts: now - 3 * DAY }];
    expect(R.due(plan, done, 0, now)).toEqual([]);
    const late = R.due(plan, done, 0, now + 20 * DAY);
    expect(late[0]).toMatchObject({ reason: 'recurring', last: now - 3 * DAY });
    expect(R.due(plan, [], now + DAY, now)).toEqual([]);
    expect(R.dueForProfile({ romPlan: plan, romLog: [], joinedAt: 1 }, now)).toHaveLength(1);
    expect(R.dueForProfile(null, now)).toEqual([]);
  });

  it('rxExtrasRom et suggestFor', () => {
    expect(R.rxExtrasRom({ rom: ['sh_flex_L'] })).toEqual({
      romPlan: { tests: [{ test: 'sh_flex', side: 'L' }], every: 0 },
    });
    expect(R.rxExtrasRom({})).toEqual({ romPlan: null });
    expect(R.rxExtrasRom(null)).toEqual({ romPlan: null });
    expect(R.suggestFor({ pathology: 'frozen' }).length).toBeGreaterThan(0);
    expect(R.suggestFor({ pathology: 'inconnue', region: 'inconnue' })).toEqual([]);
    expect(R.EVERY_OPTIONS).toEqual([0, 1, 2, 4, 6, 8, 12]);
  });

  it('orientation : miroir et côté', () => {
    const T = R.getTest('sh_flex');
    expect(R.orientation(T, 'R', false)).toMatchObject({ mode: 'near', side: 'R', seen: 'right' });
    expect(R.orientation(T, 'R', true)).toMatchObject({ mode: 'near', side: 'R', seen: 'left' });
    expect(R.orientation(R.getTest('sh_abd'), 'R', true)).toMatchObject({ mode: 'front', scr: 'right' });
    expect(R.orientation(R.getTest('sh_abd'), 'R', false)).toMatchObject({ mode: 'front', scr: 'left' });
    expect(R.orientation(R.getTest('lumb_flex'), null, true)).toEqual({ mode: 'profile' });
    expect(R.orientation(null, 'L', true)).toEqual({ mode: 'none' });
    expect(R.orientText(null)).toBe('');
  });

  it('nearSide et checkStart', () => {
    const base = { deg: 0, vis: 1, ratio: 0.1, facing: 0, visL: 1, visR: 1, seg: null };
    expect(R.nearSide({ ...base, facing: 1 })).toBe('R');
    expect(R.nearSide({ ...base, facing: -1 })).toBe('L');
    expect(R.nearSide({ ...base, visL: 0.2, visR: 0.9 })).toBe('R');
    expect(R.nearSide(base)).toBeNull();
    const T = R.getTest('sh_flex');
    expect(R.checkStart(T, 'L', null).issues).toEqual(['lost']);
    expect(R.checkStart(T, 'L', { ...base, ratio: 0.9 }).issues).toEqual(['turnSide']);
    expect(R.checkStart(T, 'L', { ...base, facing: 1 }).issues).toEqual(['wrongSide']);
    expect(R.checkStart(T, 'L', { ...base, deg: -80, facing: -1 }).issues).toEqual(['startLow']);
    expect(R.checkStart(T, 'L', { ...base, deg: 80, facing: -1 }).issues).toEqual(['startHigh']);
    expect(R.checkStart(T, 'L', { ...base, facing: -1 })).toMatchObject({ ok: true, inRange: true });
  });

  it('StartGate : prêt après un temps d’immobilité', () => {
    const gate = new R.StartGate({ holdMs: 1000 });
    const chk = { ok: true, issues: [], view: true, side: true, inRange: true, near: null, deg: 0 };
    const s = { deg: 0, vis: 1, ratio: 0.1, facing: 0, visL: 1, visR: 1, seg: 10 };
    expect(gate.push(0, chk, s).ready).toBe(false);
    expect(gate.push(500, chk, s).progress).toBeCloseTo(0.5);
    expect(gate.push(1000, chk, s).ready).toBe(true);
    expect(gate.push(1100, chk, { ...s, deg: 40 }).still).toBe(false);
    expect(gate.push(1200, null, s)).toEqual({ ready: false, still: false, progress: 0 });
  });

  it('Voicer : une consigne n’est dite que si elle change ou après repeatMs', () => {
    const v = new R.Voicer({ minGap: 1000, repeatMs: 5000 });
    expect(v.offer('a', 'Bonjour', 0)).toBe(true);
    expect(v.offer('b', 'Autre', 100)).toBe(false);
    expect(v.offer('b', 'Autre', 2000)).toBe(true);
    expect(v.offer('b', 'Autre', 4000)).toBe(false);
    expect(v.offer('b', 'Autre', 8000)).toBe(true);
    expect(new R.Voicer({ muted: true }).offer('x', 'y', 0)).toBe(true);
  });

  it('SIDE_COLOR distingue gauche et droite ; segmentAngle sans point → null', () => {
    expect(R.SIDE_COLOR.L).not.toBe(R.SIDE_COLOR.R);
    expect(R.segmentAngle(R.getTest('sh_flex'), 'L', { lm: [], w: 1, h: 1 })).toBeNull();
    expect(R.segmentAngle(null, 'L', null)).toBeNull();
  });
});
