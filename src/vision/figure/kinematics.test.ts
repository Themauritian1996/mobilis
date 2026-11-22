import { describe, expect, it } from 'vitest';
import { add, dir, ease, interpParams, pose } from './kinematics.ts';

describe('kinematics : utilitaires', () => {
  it('dir : vecteur de longueur donnée selon l’angle (0° = haut)', () => {
    const [x, y] = dir(0, 10);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(-10, 9);
    const [x2, y2] = dir(90, 10);
    expect(x2).toBeCloseTo(10, 9);
    expect(y2).toBeCloseTo(0, 9);
  });
  it('add additionne deux points', () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
  });
  it('ease : 0 → 0, 1 → 1, monotone', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.75)).toBeGreaterThan(ease(0.25));
  });
});

describe('interpParams', () => {
  it('interpole linéairement les nombres et bascule les autres valeurs à mi-course', () => {
    const r = interpParams({ trunk: 0, tag: 'a' }, { trunk: 10, tag: 'b' }, 0.25);
    expect(r.trunk).toBeCloseTo(2.5, 9);
    expect(r.tag).toBe('a');
    expect(interpParams({ tag: 'a' }, { tag: 'b' }, 0.75).tag).toBe('b');
  });
});

describe('pose', () => {
  it('vue de côté : articulations numériques, corps posé au sol', () => {
    const j = pose({ view: 'side' }, {});
    for (const k of ['pelvis', 'shoulder', 'head', 'knee', 'ankle']) {
      const p = j[k] as [number, number];
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
    expect(j.pelvis[1]).toBeLessThan(j.ankle[1]);
  });
  it('est déterministe', () => {
    const f = { view: 'front' };
    expect(pose(f, { trunk: 5 })).toEqual(pose(f, { trunk: 5 }));
  });
});
