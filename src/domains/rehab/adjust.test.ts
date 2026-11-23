import { describe, expect, it } from 'vitest';
import { ADJ_LIM, adjustDose, levelCap } from './adjust.ts';

describe('adjust (réglage de dose)', () => {
  it('adjustDose : pas et bornes de chaque réglage', () => {
    const d = { sets: 3, reps: 10, hold: 20, rest: 30 };
    expect(adjustDose(d, 'reps', 1)).toEqual({ ...d, reps: 11 });
    expect(adjustDose(d, 'hold', -1)).toEqual({ ...d, hold: 15 });
    expect(adjustDose(d, 'rest', 1)).toEqual({ ...d, rest: 45 });
    expect(adjustDose({ ...d, sets: 6 }, 'sets', 1)).toBeNull();
    expect(adjustDose({ ...d, rest: 0 }, 'rest', -1)).toBeNull();
    expect(adjustDose({ sets: 1 }, 'reps', 1)).toMatchObject({ reps: 3 });
    expect(ADJ_LIM.hold).toEqual([5, 120, 5]);
  });

  it('levelCap : 5 sauf phase verrouillée', () => {
    expect(levelCap(false, { a: 2 }, 'a')).toBe(5);
    expect(levelCap(true, { a: 2 }, 'a')).toBe(2);
    expect(levelCap(true, {}, 'a')).toBe(5);
    expect(levelCap(true, { a: 0 }, 'a')).toBe(1);
  });
});
