import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../rehab/data/exercises.ts';
import { DISCLAIMER, PROTOCOLS as DATA } from './data/protocols.ts';
import type { Protocol } from './data/types.ts';
import {
  defaultVariant,
  exerciseEntry,
  phaseExerciseIds,
  protocolById,
  protocolPhases,
  resolvePhase,
  variantOf,
} from './protocols.ts';

const PROTOCOLS: readonly Protocol[] = DATA;

describe('catalogue de protocoles', () => {
  it('a un avertissement bilingue et des identifiants uniques', () => {
    expect(DISCLAIMER.fr).not.toBe('');
    expect(DISCLAIMER.en).not.toBe('');
    expect(new Set(PROTOCOLS.map((p) => p.id)).size).toBe(PROTOCOLS.length);
  });
  it('les phases se suivent sans trou ni chevauchement et ne citent que des exercices existants', () => {
    for (const p of PROTOCOLS) {
      for (const v of [null, ...(p.variants ?? []).map((x) => x.id)]) {
        const phases = protocolPhases(p, v);
        expect(phases[0]?.weeks[0], p.id).toBe(0);
        phases.forEach((ph, i) => {
          const next = phases[i + 1];
          if (next) expect(ph.weeks[1], `${p.id}/${v} ${ph.id}`).toBe(next.weeks[0]);
          for (const id of phaseExerciseIds(ph)) expect(EXERCISES, `${p.id} ${ph.id} → ${id}`).toHaveProperty(id);
        });
        expect(phases.at(-1)?.weeks[1]).toBeNull();
      }
    }
  });
});

describe('utilitaires de protocole', () => {
  const acl = protocolById('acl')!;
  it('protocolById', () => {
    expect(acl.id).toBe('acl');
    expect(protocolById('zzz')).toBeNull();
  });
  it('defaultVariant et variantOf : première variante par défaut, repli si inconnue', () => {
    expect(defaultVariant(acl)).toBe('btb');
    expect(defaultVariant(null)).toBeNull();
    expect(variantOf(acl, 'hamstring')).toBe('hamstring');
    expect(variantOf(acl, 'inconnue')).toBe('btb');
    expect(variantOf(acl)).toBe('btb');
    expect(variantOf(null, 'x')).toBeNull();
  });
  it('resolvePhase : applique les remplacements de la variante et retire byVariant', () => {
    const phase = acl.phases[0]!;
    const plain = resolvePhase(phase, null);
    expect(plain).not.toHaveProperty('byVariant');
    expect(plain.precautions).toHaveLength((phase.precautions ?? []).length);
    const btb = resolvePhase(phase, 'btb');
    expect(btb.precautions).toHaveLength((phase.precautions ?? []).length + 1);
    expect(btb).not.toHaveProperty('precautionsAdd');
    const ham = resolvePhase(acl.phases[2]!, 'hamstring');
    expect(ham.exercises).toContain('bridge_long');
    expect(resolvePhase(acl.phases[2]!, 'btb').exercises).not.toContain('bridge_long');
  });
  it('resolvePhase : une variante peut remplacer la durée de la phase', () => {
    const cuff = protocolById('cuff_repair')!;
    expect(resolvePhase(cuff.phases[1]!, 'large').weeks).toEqual([6, 16]);
    expect(resolvePhase(cuff.phases[1]!, 'small_med').weeks).toEqual([6, 12]);
  });
  it('exerciseEntry et phaseExerciseIds', () => {
    expect(exerciseEntry('slr')).toEqual({ id: 'slr' });
    const e = { id: 'knee_ext_sit', maxLevel: 2 };
    const copy = exerciseEntry(e);
    expect(copy).toEqual(e);
    expect(copy).not.toBe(e);
    expect(phaseExerciseIds({ exercises: ['slr', { id: 'slr', maxLevel: 1 }, 'tke'] })).toEqual(['slr', 'tke']);
    expect(phaseExerciseIds({})).toEqual([]);
  });
});
