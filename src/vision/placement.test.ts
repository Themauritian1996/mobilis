import { describe, expect, it } from 'vitest';
import {
  ICON_SVG,
  PlacementGate,
  TH,
  assessPlacement,
  guideRect,
  issueIcon,
  measurementsText,
  palmNeed,
  palmRatio,
  requiredJoints,
  scopeOf,
  subjectBox,
} from './placement.ts';

describe('placement : fonctions pures', () => {
  it('scopeOf et palmNeed selon la métrique', () => {
    expect(scopeOf('neckFwd')).toBe('upper');
    expect(scopeOf('kneeFlex')).toBe('full');
    expect(palmNeed('hAxis')).toBe('side');
    expect(palmNeed('hPinch')).toBe('front');
    expect(palmNeed('elbow')).toBeNull();
  });
  it('requiredJoints : un côté (le mieux vu) en vue de profil, deux de face', () => {
    expect(requiredJoints('side', 'full', 'R')).toEqual(['shR', 'hipR', 'knR', 'anR']);
    expect(requiredJoints('front', 'upper', null)).toHaveLength(8);
    const lm = Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, visibility: i % 2 ? 0 : 1 }));
    expect(requiredJoints('side', 'upper', null, lm)[0]).toBe('shL'.replace('L', 'R'));
  });
  it('subjectBox : null sans points, sinon boîte englobante', () => {
    expect(subjectBox(null)).toBeNull();
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    lm[0] = { x: 0.2, y: 0.1, visibility: 1 };
    expect(subjectBox(lm, 'upper')?.x0).toBe(0.2);
  });
  it('guideRect et issueIcon', () => {
    expect(guideRect('hand', undefined)).toEqual({ x: 0.22, y: 0.18, w: 0.56, h: 0.64 });
    expect(guideRect('body', 'side', 'upper').w).toBe(0.44);
    expect(issueIcon(null)).toBe('ok');
    expect(issueIcon({ key: 'moveBack', dir: 'out' })).toBe('out');
    expect(issueIcon({ key: 'moreLight' })).toBe('sun');
    expect(issueIcon({ key: 'phoneUpright' })).toBe('phone');
    expect(issueIcon({ key: 'noBody' })).toBe('eye');
    expect(Object.keys(ICON_SVG)).toContain('turn');
  });
  it('palmRatio : largeur index–auriculaire ÷ longueur de paume', () => {
    const h = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    h[9] = { x: 0, y: 1 };
    h[5] = { x: 0, y: 0 };
    h[17] = { x: 0.5, y: 0 };
    expect(palmRatio(h)).toBeCloseTo(0.5, 9);
  });
  it('assessPlacement : sans corps → noBody ; lumière faible signalée', () => {
    const r = assessPlacement({ kind: 'body', plane: 'side', lm: null, luma: { mean: 20, center: 20, edges: 20 } });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.key)).toEqual(['moreLight', 'noBody']);
    expect(r.issues[0]?.first).toBe(true);
    expect(assessPlacement({ kind: 'hand', hand: null }).issues[0]?.key).toBe('noHand');
  });
  it('measurementsText mentionne les problèmes', () => {
    expect(measurementsText({ plane: 'front' }, {}, [{ key: 'moveBack' }], null)).toContain('issues=[moveBack]');
  });
});

describe('PlacementGate', () => {
  it('« stable » seulement après OK_HOLD_MS sans problème', () => {
    const g = new PlacementGate();
    expect(g.push({ ok: true, issues: [] }, 0).stable).toBe(false);
    expect(g.push({ ok: true, issues: [] }, TH.OK_HOLD_MS).stable).toBe(true);
  });
  it('un problème n’est affiché qu’après ISSUE_HOLD_MS', () => {
    const g = new PlacementGate();
    const bad = { ok: false, issues: [{ key: 'moveBack' }] };
    expect(g.push(bad, 0).issue).toBeNull();
    expect(g.push(bad, TH.ISSUE_HOLD_MS).issue?.key).toBe('moveBack');
  });
});
