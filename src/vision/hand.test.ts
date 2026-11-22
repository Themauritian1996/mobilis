import { describe, expect, it } from 'vitest';
import {
  HAND_CONN,
  HandSideVote,
  detectHands,
  drawHand,
  handInFrame,
  handPx,
  parseHands,
  pickHand,
  type DetectedHand,
  type HandLandmark,
} from './hand.ts';

const pts = (cx: number, cy: number, size = 0.2): HandLandmark[] =>
  Array.from({ length: 21 }, (_, i) => ({ x: cx, y: i === 9 ? cy - size : cy, z: 0 }));
const hand = (cx: number, label: 'L' | 'R' | null, score = 0.95, size = 0.2): DetectedHand => ({
  lm: pts(cx, 0.6, size),
  world: null,
  label,
  score,
});

describe('parseHands', () => {
  it('étiquette telle quelle (Left → L), score 1 par défaut, world seulement si 21 points', () => {
    const res = {
      landmarks: [pts(0.3, 0.5), pts(0.7, 0.5)],
      handedness: [[{ categoryName: 'Left', score: 0.8 }]],
      worldLandmarks: [pts(0, 0), pts(0, 0).slice(0, 5)],
    };
    const [a, b] = parseHands(res);
    expect(a?.label).toBe('L');
    expect(a?.score).toBe(0.8);
    expect(a?.world).toHaveLength(21);
    expect(b?.label).toBeNull();
    expect(b?.score).toBe(1);
    expect(b?.world).toBeNull();
    expect(parseHands(null)).toEqual([]);
  });
  it('accepte l’ancien nom « handednesses »', () => {
    const [a] = parseHands({ landmarks: [pts(0.5, 0.5)], handednesses: [[{ categoryName: 'Right', score: 0.9 }]] });
    expect(a?.label).toBe('R');
  });
});

describe('pickHand', () => {
  it('liste vide : null', () => {
    expect(pickHand([], 'R')).toBeNull();
  });
  it('côté travaillé si l’étiquette est fiable, sinon la plus grande', () => {
    const L = hand(0.3, 'L', 0.95, 0.3),
      R = hand(0.7, 'R', 0.95, 0.1);
    expect(pickHand([L, R], 'R')).toBe(R);
    expect(pickHand([L, R], null)).toBe(L);
    expect(pickHand([L, hand(0.7, 'R', 0.5, 0.1)], 'R')).toBe(L);
  });
  it('garde la même main tant qu’elle est là', () => {
    const prev = hand(0.3, 'L', 0.95, 0.2);
    const moved = { ...hand(0.32, 'R', 0.6, 0.2) };
    const other = hand(0.8, 'R', 0.6, 0.3);
    expect(pickHand([other, moved], null, prev)).toBe(moved);
  });
});

describe('HandSideVote', () => {
  it('prévient quand 5 des 6 dernières étiquettes sont de l’autre côté', () => {
    const v = new HandSideVote();
    const wrong = hand(0.5, 'L', 0.95);
    for (let i = 0; i < 5; i++) expect(v.push(wrong, 'R')).toBe(false);
    expect(v.push(wrong, 'R')).toBe(true);
    v.reset();
    expect(v.ready).toBe(false);
    expect(v.push(null, 'R')).toBe(false);
    expect(v.push(hand(0.5, null), 'R')).toBe(false);
  });
});

describe('géométrie', () => {
  it('handPx met x, y et z à l’échelle de l’image', () => {
    expect(handPx([{ x: 0.5, y: 0.25, z: 0.1 }], 200, 100)[0]).toEqual({ x: 100, y: 25, z: 20 });
  });
  it('handInFrame : tolère un débordement réglable', () => {
    const lm = pts(0.5, 0.5);
    expect(handInFrame(lm)).toBe(true);
    lm[8] = { x: 1.03, y: 0.5 };
    expect(handInFrame(lm)).toBe(false);
    expect(handInFrame(lm, 0.04)).toBe(true);
    expect(handInFrame([])).toBe(false);
  });
  it('HAND_CONN relie les 21 points', () => {
    expect(new Set(HAND_CONN.flat()).size).toBe(21);
  });
  it('detectHands : rien tant que le modèle n’est pas chargé', () => {
    expect(detectHands({ readyState: 4 } as never, 0)).toEqual([]);
  });
});

describe('drawHand', () => {
  const ctx = (): CanvasRenderingContext2D => {
    const calls: string[] = [];
    return new Proxy({ calls } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => void calls.push(String(k))),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
  };
  it('sans points : null ; sinon 21 points en pixels (miroir compris)', () => {
    expect(drawHand(ctx(), null, 100, 100)).toBeNull();
    const out = drawHand(ctx(), [...pts(0.25, 0.5)], 100, 100, true);
    expect(out).toHaveLength(21);
    expect(out?.[0]?.x).toBeCloseTo(75, 9);
  });
});
