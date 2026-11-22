import { describe, expect, it } from 'vitest';
import {
  EQUIP_IDS,
  HOUSE,
  alternatives,
  haveList,
  localVerdict,
  missing,
  parseKg,
  substitutesFor,
} from './equipment.ts';
import { EXERCISES } from './internal/legacy-data.ts';

const withEquip = Object.entries(EXERCISES).find(([, e]) => (e.equip || []).length > 0)!;

describe('matériel : fonctions pures', () => {
  it('poids écrit par le patient : kg, livres, grammes, litres, onces', () => {
    expect(parseKg('2 kg')).toBe(2);
    expect(parseKg('1,5 kilos')).toBe(1.5);
    expect(parseKg('500 g')).toBe(0.5);
    expect(parseKg('2 lb')).toBeCloseTo(0.908, 3);
    expect(parseKg('1 litre')).toBe(1);
    expect(parseKg('750 ml')).toBe(0.75);
    expect(parseKg('25 cl')).toBe(0.25);
    expect(parseKg('5 dl')).toBe(0.5);
    expect(parseKg('10 oz')).toBeCloseTo(0.28, 5);
    expect(parseKg('un gros sac')).toBeNull();
    expect(parseKg(undefined)).toBeNull();
  });

  it('liste du matériel : absente = tout est supposé disponible', () => {
    expect(haveList({ equipment: ['mat'] })).toEqual(['mat']);
    expect(haveList({})).toBeNull();
    expect(haveList(null)).toBeNull();
    expect(missing('inconnu', ['mat'])).toEqual([]);
    expect(missing(withEquip[0], null)).toEqual([]);
    expect(missing(withEquip[0], [])).toEqual(withEquip[1].equip);
    expect(HOUSE).toContain('chair');
    expect(EQUIP_IDS.length).toBeGreaterThan(0);
  });

  it('exercice inconnu : aucun remplacement, aucun avis', () => {
    expect(alternatives('inconnu', [])).toEqual([]);
    expect(substitutesFor('inconnu')).toEqual([]);
    expect(localVerdict('inconnu', 3, 'une bouteille')).toBeNull();
    expect(localVerdict(withEquip[0], 3, '   ')).toBeNull();
  });

  it('objet dangereux : refusé', () => {
    expect(localVerdict(withEquip[0], 3, 'un couteau')?.verdict).toBe('no');
  });
});
