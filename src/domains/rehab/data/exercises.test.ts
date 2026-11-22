import { describe, expect, it } from 'vitest';
import { EX_ANATOMY } from './anatomy.ts';
import { EQUIP, EXERCISES, UNILATERAL } from './exercises.ts';

const ids = Object.keys(EXERCISES);

describe('bibliothèque d’exercices', () => {
  it('contient les 61 exercices de la v1.15', () => {
    expect(ids).toHaveLength(61);
  });
  it('chaque exercice a des textes bilingues, des étapes alignées et un schéma', () => {
    for (const id of ids) {
      const e = EXERCISES[id as keyof typeof EXERCISES];
      expect(e.name.fr, id).not.toBe('');
      expect(e.name.en, id).not.toBe('');
      expect(e.steps.fr.length, id).toBeGreaterThan(0);
      expect(e.steps.fr, id).toHaveLength(e.steps.en.length);
      expect(e.fig.frames.length, id).toBeGreaterThanOrEqual(1);
    }
  });
  it('le matériel référencé existe dans EQUIP', () => {
    for (const id of ids) {
      for (const q of EXERCISES[id as keyof typeof EXERCISES].equip) expect(EQUIP, `${id} → ${q}`).toHaveProperty(q);
    }
  });
  it('UNILATERAL et EX_ANATOMY ne citent que des exercices existants', () => {
    for (const id of UNILATERAL) expect(EXERCISES, id).toHaveProperty(id);
    for (const id of Object.keys(EX_ANATOMY)) expect(EXERCISES, id).toHaveProperty(id);
  });
});
