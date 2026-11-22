import { describe, expect, it } from 'vitest';
import { EQUIP, EXERCISES } from './exercises.ts';
import { MOVE, SUBSTITUTES, TARGET_KG, kgText, moveOf, subsOf, targetKg } from './substitutes.ts';

describe('substitutes', () => {
  it('moveOf : type de mouvement d’un exercice chargé, sinon celui du matériel, sinon « any »', () => {
    expect(moveOf('elbow_curl', 'dumbbell')).toBe('curl');
    expect(moveOf('scaption', 'weight')).toBe('raise');
    expect(moveOf('chin_tuck', 'band')).toBe('band');
    expect(moveOf('x', 'inconnu')).toBe('any');
  });
  it('targetKg : charge selon le niveau, bornée entre 1 et 5', () => {
    expect(targetKg('elbow_curl', 1)).toBe(0.5);
    expect(targetKg('elbow_curl')).toBe(1.5);
    expect(targetKg('elbow_curl', 5)).toBe(3);
    expect(targetKg('elbow_curl', 99)).toBe(3);
    expect(targetKg('elbow_curl', -4)).toBe(0.5);
    expect(targetKg('squat', 3)).toBeNull();
  });
  it('kgText : virgule décimale et plages', () => {
    expect(kgText(0.5)).toBe('0,5');
    expect(kgText(2)).toBe('2');
    expect(kgText([1, 2.5])).toBe('1–2,5');
  });
  it('subsOf : objets d’un matériel', () => {
    const d = subsOf('dumbbell');
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((s) => s.equip === 'dumbbell')).toBe(true);
    expect(subsOf('inconnu')).toEqual([]);
  });
  it('les références croisées existent (matériel, exercices)', () => {
    for (const s of SUBSTITUTES) expect(EQUIP, s.id).toHaveProperty(s.equip);
    for (const id of [...Object.keys(MOVE), ...Object.keys(TARGET_KG)]) expect(EXERCISES, id).toHaveProperty(id);
    expect(new Set(SUBSTITUTES.map((s) => s.id)).size).toBe(SUBSTITUTES.length);
  });
});
