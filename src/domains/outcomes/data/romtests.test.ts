import { describe, expect, it } from 'vitest';
import { PATHOLOGIES } from '../../rehab/data/pathologies.ts';
import {
  SUGGESTED,
  SUGGESTED_REGION,
  START,
  TESTS,
  TEST_IDS,
  getTest,
  jointIdx,
  measure,
  sidesOf,
} from './romtests.ts';

describe('catalogue des tests d’amplitude', () => {
  it('chaque test a un identifiant cohérent, des textes bilingues, une norme et une aide au départ', () => {
    expect(TEST_IDS.length).toBeGreaterThan(0);
    for (const id of TEST_IDS) {
      const t = getTest(id)!;
      expect(t.id).toBe(id);
      for (const txt of [t.name, t.pos, t.how, t.cam, t.note]) {
        expect(txt.fr, id).not.toBe('');
        expect(txt.en, id).not.toBe('');
      }
      expect(t.normal.lo, id).toBeLessThanOrEqual(t.normal.hi);
      expect(t.normal.src, id).not.toBe('');
      expect(t.start, id).toBe(START[id as keyof typeof START]);
      expect(typeof t.calc, id).toBe('function');
    }
  });
  it('getTest / sidesOf', () => {
    expect(getTest('zzz')).toBeNull();
    expect(sidesOf('sh_flex')).toEqual(['L', 'R']);
    expect(sidesOf('lumb_flex')).toEqual([null]);
    expect(sidesOf('zzz')).toEqual([null]);
  });
  it('jointIdx : indices de pose utilisés, selon le côté', () => {
    expect(jointIdx('sh_flex', 'L')).toEqual([11, 13, 23]);
    expect(jointIdx('sh_flex', 'R')).toEqual([12, 14, 24]);
    expect(jointIdx('sh_abd', 'L')).toEqual([11, 13, 23, 11, 12]);
    expect(jointIdx('zzz')).toEqual([]);
    expect(jointIdx(TESTS.sh_flex)).toEqual([11, 13, 23]);
  });
  it('measure : null pour un test inconnu ou une image sans points', () => {
    expect(measure('zzz', { lm: [], w: 1, h: 1 })).toBeNull();
    expect(measure('el_flex', { lm: [], w: 1, h: 1 }, 'L')).toBeNull();
  });
  it('measure : calcule la flexion du coude', () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
    lm[11] = { x: 0.5, y: 0.2, visibility: 1 };
    lm[13] = { x: 0.5, y: 0.4, visibility: 1 };
    lm[15] = { x: 0.7, y: 0.4, visibility: 1 };
    expect(measure('el_flex', { lm, w: 100, h: 100 }, 'L')?.deg).toBeCloseTo(90, 6);
  });
  it('les ensembles suggérés ne citent que des tests et des pathologies existants', () => {
    const ids = new Set<string>(PATHOLOGIES.map((p) => p.id));
    for (const [path, list] of Object.entries(SUGGESTED)) {
      expect(ids.has(path), path).toBe(true);
      for (const [test] of list) expect(TESTS, test).toHaveProperty(test);
    }
    for (const list of Object.values(SUGGESTED_REGION)) for (const [test] of list) expect(TESTS).toHaveProperty(test);
  });
});
