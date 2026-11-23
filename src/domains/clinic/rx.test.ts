import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Rx from './rx.ts';

// Les modules legacy lisent `window` / `localStorage` à l'import : navigateur minimal simulé avant le chargement.
let X: typeof Rx;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  X = await import('./rx.ts');
});

const form = (over: Partial<Rx.RxForm> = {}): Rx.RxForm => ({
  ...X.newRxForm(null, null, { name: 'Dre Test' }),
  ...over,
});

describe('rx (prescription du clinicien)', () => {
  it('newRxForm : programme vide, ou copie profonde du programme chargé', () => {
    const empty = X.newRxForm(null, null, { clinicianName: 'Dr X', name: 'Y' });
    expect(empty).toMatchObject({
      clinician: 'Dr X',
      region: 'shoulder',
      phase: 1,
      days: [1, 3, 5],
      auto: true,
      code: null,
    });
    expect(X.newRxForm(undefined, null, { name: 'Y' }).clinician).toBe('Y');
    const stored: Rx.StoredRx = { ids: ['a'], dose: { a: { reps: 8 } }, auto: false, prom: [{ id: 'p' }] };
    const f = X.newRxForm('ABC123', stored, {});
    expect(f).toMatchObject({ code: 'ABC123', ids: ['a'], auto: false });
    f.dose['a'] = { reps: 9 };
    expect(stored.dose?.['a']).toEqual({ reps: 8 });
  });

  it('rxRef, linkOf, shareMessage', () => {
    expect(X.rxRef({ code: 'ABC123', localId: 'L1' })).toBe('ABC123');
    expect(X.rxRef({ localId: 'L1' })).toBe('L1');
    expect(X.linkOf({ code: 'ABC123' })).toContain('#/rx/ABC123');
    expect(X.linkOf({ code: 'ABC123', lang: 'en' })).toMatch(/#\/rx\/ABC123\/en$/);
    expect(X.shareMessage('ABC123')).toContain('ABC-123');
    expect(X.shareMessage(null)).not.toContain('{code}');
  });

  it('qrSvg : un SVG pour un lien', async () => {
    const svg = await X.qrSvg('https://example.com/#/rx/ABC123');
    expect(svg).toContain('<svg');
  });

  it('shownDose et steppedDose : la dose fixée remplace celle du niveau, dans les bornes', () => {
    const base = X.shownDose('wall_slide', 2, undefined);
    expect(base.rest).toBeGreaterThanOrEqual(0);
    const over = X.shownDose('wall_slide', 2, { sets: 5, rest: 0 });
    expect(over).toMatchObject({ sets: 5, rest: 0 });
    const up = X.steppedDose({ type: 'reps', sets: 3, reps: 10, hold: 0, rest: 30 }, 'reps', 1);
    expect(up).toEqual({ sets: 3, rest: 30, reps: 11 });
    const max = X.steppedDose({ type: 'reps', sets: 6, reps: 30, hold: 0, rest: 180 }, 'sets', 1);
    expect(max.sets).toBe(6);
    const hold = X.steppedDose({ type: 'hold', sets: 2, reps: 1, hold: 20, rest: 30 }, 'hold', -1);
    expect(hold).toEqual({ sets: 2, rest: 30, hold: 15 });
    const rest = X.steppedDose({ type: 'reps', sets: 2, reps: 8, hold: 0, rest: 0 }, 'rest', -1);
    expect(rest.rest).toBe(0);
  });

  it('setLevel, stepMaxLevel, toggleDefaultOn', () => {
    const f = form({ levels: { a: 2 }, maxLevel: { a: 2 } });
    X.setLevel(f, 'a', 1);
    expect(f.levels['a']).toBe(3);
    expect(f.maxLevel['a']).toBe(3);
    X.setLevel(f, 'a', 9);
    expect(f.levels['a']).toBe(5);
    X.setLevel(f, 'b', -1);
    expect(f.levels['b']).toBe(1);
    const g = form({ levels: { a: 2 }, maxLevel: {} });
    X.stepMaxLevel(g, 'a', -1);
    expect(g.maxLevel).toEqual({ a: 4 });
    X.stepMaxLevel(g, 'a', 1);
    expect(g.maxLevel).toEqual({});
    X.stepMaxLevel(g, 'a', -9);
    expect(g.maxLevel['a']).toBe(2);
    const m: Record<string, boolean> = {};
    X.toggleDefaultOn(m, 'a');
    expect(m).toEqual({ a: false });
    X.toggleDefaultOn(m, 'a');
    expect(m).toEqual({});
  });

  it('moveId, replaceExercise, toggleEquip', () => {
    const ids = ['a', 'b', 'c'];
    X.moveId(ids, 'b', 1);
    expect(ids).toEqual(['a', 'c', 'b']);
    X.moveId(ids, 'a', -1);
    expect(ids).toEqual(['a', 'c', 'b']);
    const f = form({ ids: ['a', 'b'], levels: { a: 4 }, dose: { a: { reps: 8 } } });
    X.replaceExercise(f, 'a', 'z');
    expect(f.ids).toEqual(['z', 'b']);
    expect(f.levels['z']).toBe(4);
    expect(f.dose).toEqual({});
    expect(X.toggleEquip(['chair', 'wall'], 'wall')).toEqual(['chair']);
    expect(X.toggleEquip(['chair'], 'wall')).toEqual(['chair', 'wall']);
    expect(X.toggleEquip(null, 'chair')).not.toContain('chair');
  });

  it('DAYS_BY_FREQ, levelsOf, onlyIds, levelIn', () => {
    expect(X.DAYS_BY_FREQ[3]).toEqual([1, 3, 5]);
    expect(X.DAYS_BY_FREQ[7]).toHaveLength(7);
    const f = form({ ids: ['a', 'b'], levels: { a: 4, z: 5 } });
    expect(X.levelsOf(f)).toEqual({ a: 4, b: 2 });
    expect(X.onlyIds(f, { a: 1, z: 2 })).toEqual({ a: 1 });
    expect(X.levelIn(f, 'q')).toBe(2);
  });

  it('rxPayload et trialRx : seuls les exercices du programme, textes nettoyés', () => {
    const f = form({
      clinician: ' Dre T ',
      label: ' lbl ',
      notes: ' n ',
      ids: ['a'],
      levels: { a: 3, z: 5 },
      dose: { a: { reps: 8 }, z: { reps: 5 } },
      nextVisit: '',
      lang: '',
    });
    const p = X.rxPayload(f);
    expect(p).toMatchObject({
      clinician: 'Dre T',
      label: 'lbl',
      notes: 'n',
      levels: { a: 3 },
      dose: { a: { reps: 8 } },
      nextVisit: null,
      equip: null,
      ai: null,
    });
    expect(p.lang).toBeTruthy();
    const trial = X.trialRx(f);
    expect(trial).toMatchObject({ code: null, levels: { a: 3 }, dose: { a: { reps: 8 } } });
  });

  it('cleanSharedAi : un proxy doit être en https', () => {
    expect(X.cleanSharedAi({ mode: 'proxy', proxy: 'http://x.example/api', cap: 40 })).toBeNull();
    expect(X.cleanSharedAi({ mode: 'proxy', proxy: 'https://x.example/api', token: 't', cap: 40 })).toMatchObject({
      mode: 'proxy',
    });
  });

  it('watchCount : poussée, douleur au-dessus du seuil, assiduité < 50 %', () => {
    const list = [
      {
        pathology: null,
        patients: [
          { sessions7: 3, planned: 3 },
          { sessions7: 3, planned: 3, flare: true },
          { sessions7: 3, planned: 3, pain7: 7 },
          { sessions7: 1, planned: 4 },
          { sessions7: 0 },
        ],
      },
      { pathology: null },
    ];
    expect(X.watchCount(list)).toBe(3);
    expect(X.watchCount([])).toBe(0);
  });

  it('patientFileBase et regionExercises', () => {
    expect(X.patientFileBase('Jean Dupont')).toBe('jean-dupont');
    expect(X.patientFileBase('Éloïse')).toBe('e-loi-se');
    expect(X.patientFileBase(null)).toBe('patient');
    expect(X.patientFileBase('***')).toBe('patient');
    expect(X.regionExercises('shoulder').length).toBeGreaterThan(0);
    expect(X.regionExercises('inconnue')).toEqual([]);
    expect(X.pathologyOf('inconnue')).toBeUndefined();
  });
});
