import { describe, expect, it } from 'vitest';
import { EXERCISES } from './exercises.ts';
import { EXTRA_QUESTIONS, LAY_NEW, PATHOLOGIES, RED_FLAGS, REGIONS } from './pathologies.ts';

const regionIds = new Set<string>(REGIONS.map((r) => r.id));
const pathoIds = new Set<string>(PATHOLOGIES.map((p) => p.id));

describe('pathologies', () => {
  it('chaque pathologie a une région connue, des textes bilingues et une douleur acceptable', () => {
    for (const p of PATHOLOGIES) {
      expect(regionIds.has(p.region), p.id).toBe(true);
      expect(p.name.fr, p.id).not.toBe('');
      expect(p.painMax, p.id).toBeGreaterThan(0);
      expect(p.edu.fr, p.id).toHaveLength(p.edu.en.length);
      expect(p.avoid.fr, p.id).toHaveLength(p.avoid.en.length);
    }
  });
  it('les identifiants sont uniques', () => {
    expect(pathoIds.size).toBe(PATHOLOGIES.length);
  });
  it('les phases ne citent que des exercices existants', () => {
    for (const p of PATHOLOGIES) {
      for (const phase of [1, 2, 3] as const) {
        expect(p.phases[phase].length, `${p.id} phase ${phase}`).toBeGreaterThan(0);
        for (const ex of p.phases[phase]) expect(EXERCISES, `${p.id} → ${ex}`).toHaveProperty(ex);
      }
    }
  });
  it('LAY_NEW reprend exactement les pathologies qui ont un nom simple', () => {
    const withLay = PATHOLOGIES.filter((p) => 'lay' in p).map((p) => p.id);
    expect(Object.keys(LAY_NEW).sort()).toEqual([...withLay].sort());
  });
  it('les questions supplémentaires visent des pathologies et des régions existantes', () => {
    for (const [region, questions] of Object.entries(EXTRA_QUESTIONS)) {
      expect(regionIds.has(region), region).toBe(true);
      for (const q of questions) {
        for (const o of q.opts) for (const id of Object.keys(o.s)) expect(pathoIds.has(id), id).toBe(true);
      }
    }
  });
  it('liste des drapeaux rouges non vide et bilingue', () => {
    expect(RED_FLAGS.length).toBeGreaterThan(0);
    for (const f of RED_FLAGS) expect(f.fr !== '' && f.en !== '').toBe(true);
  });
});
