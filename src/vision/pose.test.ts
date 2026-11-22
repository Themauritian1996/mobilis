import { describe, expect, it } from 'vitest';
import {
  CONNECTIONS,
  DRAW_VIS,
  FAULT_JOINTS,
  SKELETON_JOINTS,
  detect,
  drawSkeleton,
  toPx,
  type NormLandmark,
} from './pose.ts';

const lms = (v = 1): NormLandmark[] => Array.from({ length: 33 }, (_, i) => ({ x: i / 40, y: 0.5, visibility: v }));

function fakeCtx(): CanvasRenderingContext2D {
  const calls: string[] = [];
  const target: Record<string, unknown> = { calls };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => void calls.push(`${String(k)}(${a.join(',')})`)),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

describe('toPx', () => {
  it('convertit en pixels avec la visibilité (1 par défaut)', () => {
    const lm = lms();
    delete lm[11]!.visibility;
    const p = toPx(lm, 200, 100);
    expect(p.shL).toEqual({ x: (11 / 40) * 200, y: 50, v: 1 });
    expect(p.nose.x).toBe(0);
    expect(p.ftR.x).toBeCloseTo((32 / 40) * 200, 9);
  });
});

describe('detect', () => {
  it('rien tant que le modèle n’est pas chargé', () => {
    expect(detect({ readyState: 4 } as never, 0)).toBeNull();
  });
});

describe('drawSkeleton', () => {
  it('sans points : efface et renvoie null', () => {
    const g = fakeCtx();
    expect(drawSkeleton(g, null, 100, 100)).toBeNull();
    expect((g as unknown as { calls: string[] }).calls).toContain('clearRect(0,0,100,100)');
  });
  it('ne dessine que les articulations visibles, miroir compris', () => {
    const g = fakeCtx();
    const lm = lms();
    lm[0] = { x: 0.25, y: 0.1, visibility: DRAW_VIS - 0.1 };
    const drawn = drawSkeleton(g, lm, 100, 100, new Set([25]), true);
    expect(drawn?.map((d) => d.i)).toEqual(SKELETON_JOINTS.filter((i) => i !== 0));
    expect(drawn?.find((d) => d.i === 11)?.x).toBeCloseTo((1 - 11 / 40) * 100, 9);
  });
  it('keep : ne vide pas le canevas', () => {
    const g = fakeCtx();
    drawSkeleton(g, lms(), 100, 100, new Set(), false, true);
    expect((g as unknown as { calls: string[] }).calls.some((c) => c.startsWith('clearRect'))).toBe(false);
  });
});

describe('constantes', () => {
  it('connexions et fautes désignent des points du squelette', () => {
    const idx = new Set<number>([...SKELETON_JOINTS, 7, 8, 29, 30, 31, 32]);
    for (const [a, b] of CONNECTIONS) expect(idx.has(a) && idx.has(b)).toBe(true);
    for (const js of Object.values(FAULT_JOINTS)) for (const j of js) expect(idx.has(j)).toBe(true);
  });
});
