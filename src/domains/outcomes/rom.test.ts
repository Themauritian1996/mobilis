import { describe, expect, it } from 'vitest';
import { itemKey, planEvery, planItems, seriesOf, summaryPart, trend, type RomLogRow } from './rom.ts';

const DAY = 86400000;
const log: RomLogRow[] = [
  { test: 'sh_flex', side: 'L', deg: 100, ts: 1 * DAY },
  { test: 'sh_flex', side: 'L', deg: 130, ts: 3 * DAY, method: 'manual' },
  { test: 'sh_flex', side: 'R', deg: 150, ts: 2 * DAY },
  { test: 'inconnu', deg: 5, ts: 4 * DAY },
];

describe('rom (logique pure)', () => {
  it('itemKey et planEvery', () => {
    expect(itemKey('sh_flex', 'L')).toBe('sh_flex_L');
    expect(itemKey('lumb_flex', null)).toBe('lumb_flex_-');
    expect(planEvery({ every: 4 })).toBe(4);
    expect(planEvery({ every: -3 })).toBe(0);
    expect(planEvery(null)).toBe(0);
  });

  it('planItems normalise les formes acceptées et ignore les tests inconnus', () => {
    expect(planItems(['sh_flex_L'])).toEqual([{ test: 'sh_flex', side: 'L' }]);
    expect(planItems(['sh_flex'])).toEqual([
      { test: 'sh_flex', side: 'L' },
      { test: 'sh_flex', side: 'R' },
    ]);
    expect(planItems({ tests: [{ test: 'sh_flex', side: 'R' }, 'nope', { test: 'sh_flex', side: 'R' }] })).toEqual([
      { test: 'sh_flex', side: 'R' },
    ]);
    expect(planItems(undefined)).toEqual([]);
  });

  it('seriesOf filtre par côté et trie par date', () => {
    expect(seriesOf(log, 'sh_flex', 'L').map((r) => r.deg)).toEqual([100, 130]);
    expect(seriesOf(log, 'sh_flex', 'R').map((r) => r.deg)).toEqual([150]);
    expect(seriesOf(undefined, 'sh_flex', 'L')).toEqual([]);
  });

  it('trend calcule gain, dernière valeur et écart entre côtés', () => {
    const tr = trend(log, 'sh_flex', 'L');
    expect(tr.n).toBe(2);
    expect(tr.baseline).toBe(100);
    expect(tr.last).toBe(130);
    expect(tr.gain).toBe(30);
    expect(tr.sideDiff).toBe(-20);
    expect(trend([], 'sh_flex', 'L').n).toBe(0);
  });

  it('summaryPart : vide sans journal, sinon une ligne par test et côté', () => {
    expect(summaryPart({})).toEqual({});
    const part = summaryPart({ romLog: log });
    expect(part.rom).toHaveLength(2);
    const left = part.rom?.find((r) => r.s === 'L');
    expect(left).toMatchObject({ t: 'sh_flex', b: 100, l: 130, g: 30, n: 2, m: 'manual' });
    expect(left?.p).toEqual([
      [1 * DAY, 100],
      [3 * DAY, 130],
    ]);
  });
});
