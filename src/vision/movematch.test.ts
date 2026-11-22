import { describe, expect, it } from 'vitest';
import { MoveMatcher, hintKey, reference, type Issue } from './movematch.ts';

const sideEx = { fig: { view: 'side', frames: [{ uarm: 0 }, { uarm: 90 }] } };

describe('reference', () => {
  it('main, pied et schémas obliques : pas de contrôle', () => {
    expect(reference({ fig: { view: 'palm', frames: [{}] } })).toBeNull();
    expect(reference({ fig: { view: 'side', mm: false, frames: [{}] } })).toBeNull();
  });
  it('vue de côté : tronc + membres, plages cohérentes', () => {
    const ref = reference(sideEx);
    expect(ref?.view).toBe('side');
    const feats = Object.values(ref?.feats ?? {});
    expect(feats.length).toBeGreaterThan(1);
    expect(ref?.feats['trunk']).toBeDefined();
    for (const f of feats) {
      expect(f.max).toBeGreaterThanOrEqual(f.min);
      expect(f.delta).toBeCloseTo(f.max - f.min, 9);
      expect(f.mid).toBeCloseTo((f.min + f.max) / 2, 9);
    }
    // l'épaule bouge : le bras « proche » est conservé ; les jambes immobiles sont écartées
    expect(Object.keys(ref?.feats ?? {})).toContain('shoulder.near');
    expect(Object.keys(ref?.feats ?? {})).not.toContain('knee.near');
  });
  it('vue de face : droite / gauche', () => {
    const ref = reference({ fig: { view: 'front', frames: [{ shAbdR: 0 }, { shAbdR: 80 }] } });
    expect(ref?.view).toBe('front');
    expect(Object.keys(ref?.feats ?? {}).some((k) => k.endsWith('.R'))).toBe(true);
  });
});

describe('hintKey', () => {
  const issue = (over: Partial<Issue>): Issue => ({
    k: 'x',
    name: 'trunk',
    kind: 'off',
    live: 10,
    expected: 20,
    dir: -1,
    ...over,
  });
  it('sans problème : consigne générique', () => {
    expect(hintKey(null)).toBe('mv_generic');
  });
  it('selon la nature du problème', () => {
    expect(hintKey(issue({ kind: 'still', name: 'elbow' }))).toBe('mv_armMove');
    expect(hintKey(issue({ kind: 'still', name: 'knee' }))).toBe('mv_legMove');
    expect(hintKey(issue({ kind: 'unexpected', name: 'elbow' }))).toBe('mv_elbowStill');
    expect(hintKey(issue({ live: 0, expected: 90 }))).toBe('mv_posture');
  });
  it('selon le sens de l’écart', () => {
    expect(hintKey(issue({ dir: -1 }))).toBe('mv_trunkForward');
    expect(hintKey(issue({ dir: 1 }))).toBe('mv_trunkUp');
    expect(hintKey(issue({ name: 'knee', dir: 1 }))).toBe('mv_kneeStraighter');
    expect(hintKey(issue({ name: 'shoulder', dir: 1 }), 'side')).toBe('mv_armHigher');
    expect(hintKey(issue({ name: 'shoulder', dir: 1 }), 'front')).toBe('mv_armLower');
    expect(hintKey(issue({ name: 'hipAbd', dir: -1 }))).toBe('mv_legOut');
  });
});

describe('MoveMatcher', () => {
  it('exercice non contrôlable : inutilisable, état « na »', () => {
    const m = new MoveMatcher({ fig: { view: 'palm', frames: [{}] } });
    expect(m.usable).toBe(false);
    expect(m.state.status).toBe('na');
    expect(m.describe()).toContain('not available');
    expect(m.wrongShare).toBe(0);
  });
  it('exercice contrôlable : usable, pas encore de verdict', () => {
    const m = new MoveMatcher(sideEx);
    expect(m.usable).toBe(true);
    expect(m.state.status).toBe('na');
    m.wrongTime = 1;
    m.totalTime = 4;
    expect(m.wrongShare).toBe(0.25);
    m.resetStats();
    expect(m.wrongShare).toBe(0);
  });
});
