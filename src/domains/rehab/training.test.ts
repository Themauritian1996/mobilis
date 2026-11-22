import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Training from './training.ts';

// Les modules legacy lisent `window` / `localStorage` à l'import : navigateur minimal simulé avant le chargement.
let Tr: typeof Training;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  Tr = await import('./training.ts');
});

const set = (over: Partial<Training.SetRecord> = {}): Training.SetRecord => ({
  side: null,
  plane: 'side',
  mode: 'reps',
  reps: 8,
  full: 6,
  partial: 2,
  holdSec: 0,
  quality: 0.8,
  faults: {},
  ...over,
});

describe('training (logique pure)', () => {
  it('doseText : répétitions, maintien en haut, maintien seul', () => {
    expect(Tr.doseText({ type: 'reps', sets: 3, reps: 10 })).toBe('3 × 10');
    expect(Tr.doseText({ type: 'reps', sets: 2, reps: 8, holdTop: 2 })).toMatch(/^2 × 8 · .+ 2 .+$/);
    expect(Tr.doseText({ type: 'hold', sets: 1, reps: 1, hold: 30 })).toMatch(/^30 /);
    expect(Tr.doseText({ type: 'hold', sets: 2, reps: 3, hold: 20 })).toMatch(/^2 × 3 × 20 /);
  });

  it('validSets / isEmptySet : une série vide ne compte pas, sauf saisie manuelle', () => {
    const sets = [
      set(),
      set({ reps: 0 }),
      set({ empty: true }),
      set({ reps: 0, manual: true }),
      set({ mode: 'hold', reps: 0, holdSec: 12 }),
      set({ mode: 'hold', reps: 0, holdSec: 0 }),
    ];
    expect(Tr.validSets(sets)).toHaveLength(3);
    expect(Tr.isEmptySet({ mode: 'reps', reps: 0, holdSec: 5 })).toBe(true);
    expect(Tr.isEmptySet({ mode: 'hold', reps: 4, holdSec: 0 })).toBe(true);
    expect(Tr.isEmptySet({ mode: 'hold', reps: 0, holdSec: 5 })).toBe(false);
  });

  it('guidedSummary / manualSummary / manualBounds', () => {
    expect(Tr.guidedSummary({ type: 'hold', sets: 1, reps: 1, hold: 30 }, 25, 0)).toMatchObject({
      mode: 'hold',
      holdSec: 25,
      reps: 0,
    });
    expect(Tr.guidedSummary({ type: 'reps', sets: 3, reps: 10, hold: 0 }, 40, 7)).toMatchObject({
      mode: 'reps',
      reps: 7,
      full: 7,
      partial: 0,
    });
    expect(Tr.manualSummary(true, 15)).toMatchObject({ mode: 'hold', holdSec: 15 });
    expect(Tr.manualSummary(false, 9)).toMatchObject({ mode: 'reps', reps: 9, full: 9, holdSec: 0 });
    expect(Tr.manualBounds(true, 30)).toEqual({ max: 600, step: 5 });
    expect(Tr.manualBounds(true, 10)).toEqual({ max: 600, step: 1 });
    expect(Tr.manualBounds(false, 0)).toEqual({ max: 99, step: 1 });
  });

  it('moveMatchPct / applyMoveMismatch : mouvement non conforme < 70 %', () => {
    expect(Tr.moveMatchPct({ usable: true, totalTime: 10, wrongShare: 0.25 }, false)).toBe(75);
    expect(Tr.moveMatchPct({ usable: true, totalTime: 2, wrongShare: 0.25 }, false)).toBeNull();
    expect(Tr.moveMatchPct({ usable: false, totalTime: 10, wrongShare: 0 }, false)).toBeNull();
    expect(Tr.moveMatchPct({ usable: true, totalTime: 10, wrongShare: 0 }, true)).toBeNull();
    expect(Tr.moveMatchPct(null, false)).toBeNull();
    const sum = Tr.manualSummary(false, 5);
    sum.quality = 0.9;
    Tr.applyMoveMismatch(sum, 60);
    expect(sum.faults['wrongMove']).toBe(1);
    expect(sum.quality).toBe(0.4);
    const ok = Tr.manualSummary(false, 5);
    Tr.applyMoveMismatch(ok, 90);
    expect(ok.faults).toEqual({});
    expect(Tr.sortedFaults({ faults: { a: 1, b: 3, c: 2 } }).map(([k]) => k)).toEqual(['b', 'c', 'a']);
  });

  it('setSummaryData : données envoyées au coach', () => {
    const sum = { ...Tr.manualSummary(false, 5), plane: 'guided', faults: { depth: 2.4 } };
    const data = Tr.setSummaryData({
      exercise: 'Squat',
      condition: 'Genou',
      sum,
      level: 3,
      dose: { type: 'reps', sets: 3, reps: 10, hold: 0 },
      holdTarget: 0,
      painMax: 4,
      set: 1,
      totalSets: 3,
      moveOk: 80,
      aiNotes: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(data).toMatchObject({
      kind: 'set',
      target: 10,
      set: 2,
      totalSets: 3,
      faults: { depth: 2 },
      movementMatchesDemoPct: 80,
      techniqueNotAnalysed: true,
      liveCoachRemarks: ['b', 'c', 'd', 'e'],
    });
    const hold = Tr.setSummaryData({
      exercise: 'x',
      condition: 'y',
      sum: { ...Tr.manualSummary(true, 20), plane: 'side' },
      level: 1,
      dose: { type: 'hold', sets: 1, reps: 1, hold: 30 },
      holdTarget: 30,
      painMax: 4,
      set: 0,
      totalSets: 1,
      moveOk: null,
    });
    expect(hold['target']).toBe('30s');
    expect(hold).not.toHaveProperty('techniqueNotAnalysed');
  });

  it('localSetComment : mouvement non conforme, guidé, aucune répétition complète', () => {
    expect(Tr.localSetComment({ ...Tr.manualSummary(false, 4), plane: 'side' }, 50, {})).not.toBe('');
    const guided = Tr.localSetComment(
      { ...Tr.guidedSummary({ type: 'reps', sets: 1, reps: 5, hold: 0 }, 20, 5), plane: 'guided' },
      null,
      {},
    );
    expect(guided).not.toBe('');
    const noFull = Tr.localSetComment(
      { mode: 'reps', reps: 4, full: 0, partial: 4, holdSec: 0, quality: 0.5, faults: {}, plane: 'side' },
      null,
      {},
    );
    expect(noFull).not.toBe('');
  });

  it('partialItem : séries valides gardées, exercice déjà terminé non écrasé', () => {
    const sets = [set(), set({ reps: 0 })];
    expect(Tr.partialItem('squat', 2, sets, [], 5)).toEqual({
      id: 'squat',
      level: 2,
      sets: [set()],
      partial: true,
      ts: 5,
    });
    expect(Tr.partialItem('squat', 2, [set({ reps: 0 })], [], 5)).toBeNull();
    expect(Tr.partialItem('squat', 2, sets, [{ id: 'squat' }], 5)).toBeNull();
    expect(Tr.partialItem('squat', 2, sets, [{ id: 'squat', partial: true }], 5)).not.toBeNull();
  });

  it('levelToastText : maintien, hausse, baisse, poussée', () => {
    expect(Tr.levelToastText({ level: 4, change: 1 })).toContain('4');
    expect(Tr.levelToastText({ level: 2, change: -1 })).toContain('2');
    expect(Tr.levelToastText({ level: 3, change: 0 })).toContain('3');
    expect(Tr.levelToastText({ level: 3, change: 0, reason: 'flare' })).not.toContain('3');
  });

  it('nextAfterSave : la file « refaire » prime sur le programme', () => {
    expect(Tr.nextAfterSave('a', { id: 'z' }, undefined)).toEqual({ next: { id: 'z' }, redoQueue: undefined });
    expect(Tr.nextAfterSave('a', { id: 'z' }, [])).toEqual({ next: { id: 'z' }, redoQueue: [] });
    expect(Tr.nextAfterSave('a', { id: 'z' }, ['a', 'b'])).toEqual({ next: { id: 'b' }, redoQueue: ['a', 'b'] });
    expect(Tr.nextAfterSave('b', { id: 'z' }, ['a', 'b'])).toEqual({ next: null, redoQueue: null });
    expect(Tr.nextAfterSave('b', null, undefined).next).toBeNull();
  });
});
