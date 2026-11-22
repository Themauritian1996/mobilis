import { describe, expect, it } from 'vitest';
import type { Landmark } from './index.ts';
import { CALC, LM, angleBetween, cerv, facing, planeRatio, signedToward, wrist, type RomFrame } from './goniometry.ts';

/** Image 100 × 100 : les coordonnées normalisées valent donc des pixels / 100. */
function frame(points: Readonly<Record<number, readonly [number, number]>>, extra: Partial<RomFrame> = {}): RomFrame {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  for (const [i, [x, y]] of Object.entries(points)) lm[Number(i)] = { x, y, visibility: 1 };
  return { lm, w: 100, h: 100, ...extra };
}

describe('géométrie 2D', () => {
  it('angleBetween : angle non signé entre deux vecteurs', () => {
    expect(angleBetween({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(angleBetween({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 6);
    expect(angleBetween({ x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0, 6);
  });
  it('signedToward : positif du côté de la référence, négatif sinon, non signé si colinéaire', () => {
    const u = { x: 0, y: 1 };
    const v = { x: 1, y: 1 };
    expect(signedToward(u, v, { x: 1, y: 0 })).toBeCloseTo(45, 6);
    expect(signedToward(u, v, { x: -1, y: 0 })).toBeCloseTo(-45, 6);
    expect(signedToward(u, { x: 0, y: 2 }, { x: 1, y: 0 })).toBeCloseTo(0, 6);
  });
  it('LM : indices MediaPipe Pose', () => {
    expect(LM.nose).toBe(0);
    expect(LM.sh).toEqual({ L: 11, R: 12 });
    expect(LM.kn.R).toBe(26);
  });
});

describe('facing', () => {
  it('sens du regard d’après le nez et les oreilles, sinon le pied', () => {
    const right = frame({ 0: [0.6, 0.2], 7: [0.5, 0.2], 8: [0.5, 0.2] });
    expect(facing(right, 'L')).toBe(1);
    const left = frame({ 0: [0.4, 0.2], 7: [0.5, 0.2], 8: [0.5, 0.2] });
    expect(facing(left, 'L')).toBe(-1);
    const foot = frame({ 29: [0.4, 0.9], 31: [0.5, 0.9] });
    expect(facing(foot, 'L')).toBe(1);
    expect(facing(frame({}), 'L')).toBe(0);
  });
});

describe('planeRatio', () => {
  it('largeur des épaules / longueur du tronc', () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
    lm[11] = { x: 0.4, y: 0.2, visibility: 1 };
    lm[12] = { x: 0.6, y: 0.2, visibility: 1 };
    lm[23] = { x: 0.4, y: 0.6, visibility: 1 };
    lm[24] = { x: 0.6, y: 0.6, visibility: 1 };
    expect(planeRatio(lm)).toBeCloseTo(0.5, 6);
    expect(planeRatio(null)).toBeNull();
    expect(planeRatio(lm.map((l) => ({ ...l, visibility: 0.1 })))).toBeNull();
  });
});

describe('calculs d’angle', () => {
  it('coude : flexion = 180° − angle intérieur ; bras tendu = 0°', () => {
    const straight = frame({ 11: [0.5, 0.2], 13: [0.5, 0.4], 15: [0.5, 0.6] });
    const r = CALC.elbowAngle(straight, 'L');
    expect(r?.deg).toBeCloseTo(0, 6);
    expect(r?.vis).toBe(1);
    const bent = frame({ 11: [0.5, 0.2], 13: [0.5, 0.4], 15: [0.7, 0.4] });
    expect(CALC.elbowAngle(bent, 'L')?.deg).toBeCloseTo(90, 6);
  });
  it('genou et hanche : flexion à 90°', () => {
    const knee = frame({ 23: [0.5, 0.3], 25: [0.5, 0.6], 27: [0.3, 0.6] });
    expect(CALC.kneeAngle(knee, 'L')?.deg).toBeCloseTo(90, 6);
    const hip = frame({ 11: [0.5, 0.1], 23: [0.5, 0.5], 25: [0.8, 0.5] });
    expect(CALC.hipFlex(hip, 'L')?.deg).toBeCloseTo(90, 6);
  });
  it('un point manquant donne null', () => {
    expect(CALC.elbowAngle({ lm: [], w: 100, h: 100 }, 'L')).toBeNull();
    expect(CALC.shoulderFlex(frame({}), 'R')).toBeNull();
  });
  it('flexion d’épaule : bras à l’horizontale vers l’avant = 90° (patient tourné vers la droite)', () => {
    const f = frame({ 0: [0.6, 0.2], 7: [0.5, 0.2], 8: [0.5, 0.2], 11: [0.5, 0.3], 13: [0.8, 0.3], 23: [0.5, 0.7] });
    expect(CALC.shoulderFlex(f, 'L')?.deg).toBeCloseTo(90, 6);
  });
  it('abduction d’épaule : bras à l’horizontale = 90°', () => {
    const f = frame({ 11: [0.6, 0.3], 12: [0.4, 0.3], 13: [0.9, 0.3], 23: [0.6, 0.7] });
    expect(CALC.shoulderAbd(f, 'L')?.deg).toBeCloseTo(90, 6);
  });
  it('fente cheville : tibia incliné de 45° vers l’avant', () => {
    const f = frame({ 25: [0.6, 0.5], 27: [0.5, 0.6], 29: [0.4, 0.6], 31: [0.55, 0.6] });
    expect(CALC.ankleLunge(f, 'L')?.deg).toBeCloseTo(45, 6);
  });
  it('flexion lombaire : hauteur des doigts en % de la longueur de jambe, bornée à 0', () => {
    const f = frame({ 23: [0.5, 0.4], 27: [0.5, 0.9], 19: [0.5, 0.6] });
    expect(CALC.lumbarFloor(f, 'L')?.deg).toBeCloseTo(60, 6);
    const floor = frame({ 23: [0.5, 0.4], 27: [0.5, 0.9], 19: [0.5, 0.95] });
    expect(CALC.lumbarFloor(floor, 'L')?.deg).toBe(0);
  });
  it('rotation cervicale : nez décalé par rapport aux oreilles, signe selon le côté', () => {
    const f = frame({ 0: [0.5 + 0.3 * 0.2 * 0.5, 0.2], 7: [0.5, 0.2], 8: [0.5, 0.2], 11: [0.6, 0.4], 12: [0.4, 0.4] });
    const left = cerv(f, 'L');
    const right = cerv(f, 'R');
    expect(left?.deg).toBeCloseTo(30, 4);
    expect(right?.deg).toBeCloseTo(-30, 4);
    expect(left?.q).toBe(1);
  });
  it('flexSigned multiplie la valeur sans modifier le reste', () => {
    expect(CALC.flexSigned({ deg: 10, vis: 1 }, -1)).toEqual({ deg: -10, vis: 1 });
    expect(CALC.flexSigned(null, 2)).toBeNull();
  });
  it('wrist(k) : déviation signée du poignet à partir des points de la main', () => {
    const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    hand[0] = { x: 0.5, y: 0.5 };
    hand[9] = { x: 0.7, y: 0.4 }; // main relevée par rapport à l'avant-bras horizontal
    const f = frame({ 13: [0.3, 0.5], 15: [0.5, 0.5] }, { hand: { lm: hand } });
    const dev = CALC.wristDev(f, 'L');
    expect(Math.abs(dev?.up ?? 0)).toBeGreaterThan(20);
    expect(wrist(1)(f, 'L')?.deg).toBeCloseTo(dev?.up ?? NaN, 6);
    expect(wrist(-1)(f, 'L')?.deg).toBeCloseTo(-(dev?.up ?? NaN), 6);
    expect(wrist(1)(frame({}), 'L')).toBeNull();
  });
});
