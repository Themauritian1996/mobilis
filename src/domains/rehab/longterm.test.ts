import { describe, expect, it } from 'vitest';
import {
  PROGRAM_DAYS,
  RANGES,
  inRange,
  localeWeekStart,
  programEnded,
  rangeCutoff,
  rangeWeeks,
  weekOrder,
  weekStartFor,
} from './longterm.ts';

const DAY = 86400000;

describe('long terme : fonctions pures', () => {
  it('début de semaine : réglage explicite, sinon langue', () => {
    expect(weekStartFor(0)).toBe(0);
    expect(weekStartFor('1')).toBe(1);
    expect(weekStartFor('auto', 'fr-FR')).toBe(1);
    expect(localeWeekStart('en-US')).toBe(0);
    expect(localeWeekStart('fr-FR')).toBe(1);
    expect(localeWeekStart('pas une langue !!')).toBe(1);
    expect(weekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('plages de l’historique', () => {
    const now = 1_000_000 * DAY;
    expect(RANGES).toEqual(['4w', '3m', 'all']);
    expect(rangeCutoff('4w', now)).toBe(now - 28 * DAY);
    expect(rangeCutoff('3m', now)).toBe(now - 91 * DAY);
    expect(rangeCutoff('all', now)).toBeNull();
    expect(inRange(now - 10 * DAY, '4w', now)).toBe(true);
    expect(inRange(now - 40 * DAY, '4w', now)).toBe(false);
    expect(inRange(0, 'all', now)).toBe(true);
    expect([rangeWeeks('4w'), rangeWeeks('3m'), rangeWeeks('all')]).toEqual([4, 13, Infinity]);
  });

  it('fin de programme : 12 semaines et phase 3 (programme du clinicien seulement)', () => {
    const now = 200 * DAY;
    const base = { pathology: 'x', rxCode: 'ABC234', rxAt: now - PROGRAM_DAYS * DAY, phase: 3 };
    expect(PROGRAM_DAYS).toBe(84);
    expect(programEnded(base, now)).toBe(true);
    expect(programEnded({ ...base, phase: 2 }, now)).toBe(false);
    expect(programEnded({ ...base, phase: 2, lockPhase: true }, now)).toBe(true);
    expect(programEnded({ ...base, rxAt: now - 10 * DAY }, now)).toBe(false);
    expect(programEnded({ ...base, rxCode: null }, now)).toBe(false);
    expect(programEnded({ ...base, role: 'clinician' }, now)).toBe(false);
    expect(programEnded(null, now)).toBe(false);
  });
});
