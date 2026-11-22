import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REST,
  applyOver,
  calendarPhase,
  doseFor,
  exerciseSeconds,
  exerciseSummary,
  inFlare,
  partialShare,
  pathologyById,
  plannedPerWeek,
  protocolActive,
  protocolDaysSince,
  recentNotes,
  startLevel,
  swappedFrom,
  weekNumber,
} from './program.ts';
import { PATHOLOGIES } from './internal/legacy-data.ts';
import type { Dose, Session } from './types.ts';

const DAY = 86400000;

describe('programme : fonctions pures', () => {
  it('semaine du programme (1 = première) et phase calendaire', () => {
    const start = Date.UTC(2026, 0, 1);
    expect(weekNumber({ startDate: start }, start)).toBe(1);
    expect(weekNumber({ startDate: start }, start + 6 * DAY)).toBe(1);
    expect(weekNumber({ startDate: start }, start + 7 * DAY)).toBe(2);
    expect(weekNumber({}, 123)).toBe(1);
    expect([1, 2, 3, 6, 7, 20].map(calendarPhase)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('niveau de départ selon l’irritabilité', () => {
    expect([startLevel('high'), startLevel('med'), startLevel('low'), startLevel(undefined)]).toEqual([1, 2, 3, 3]);
  });

  it('poussée de douleur : active tant que flareUntil est dans le futur', () => {
    expect(inFlare({ flareUntil: 2000 }, 1000)).toBe(true);
    expect(inFlare({ flareUntil: 1000 }, 1000)).toBe(false);
    expect(inFlare({}, 1000)).toBe(false);
  });

  it('protocole : jours écoulés depuis la chirurgie et activation', () => {
    const now = new Date(2026, 5, 15, 10).getTime();
    expect(protocolDaysSince('2026-06-10', now)).toBe(5);
    expect(protocolDaysSince('2026-06-20', now)).toBe(-5);
    expect(protocolDaysSince('pas une date', now)).toBeNaN();
    expect(protocolActive(null)).toBe(false);
    expect(protocolActive({ protocol: { id: 'inconnu', surgeryDate: '2026-06-10' } })).toBe(false);
  });

  it('pathologie par identifiant', () => {
    const first = PATHOLOGIES[0]!;
    expect(pathologyById(first.id)).toBe(first);
    expect(pathologyById('nope')).toBeUndefined();
  });

  it('réglages : substitution, jours prévus par semaine', () => {
    expect(swappedFrom({ swaps: { a: 'b' } }, 'b')).toBe('a');
    expect(swappedFrom({ swaps: { a: 'b' } }, 'c')).toBeNull();
    expect(swappedFrom({}, 'c')).toBeNull();
    expect(plannedPerWeek({ days: [1, 2] })).toBe(2);
    expect(plannedPerWeek({ perWeek: 4 })).toBe(4);
    expect(plannedPerWeek({})).toBe(3);
  });

  it('applyOver : ne touche pas la dose sans réglage, marque « custom » sinon', () => {
    const d: Dose = { type: 'reps', sets: 3, reps: 10 };
    expect(applyOver(d, null)).toBe(d);
    const r = applyOver(d, { sets: 2, hold: 30, rest: 0 });
    expect(r).toEqual({ type: 'reps', sets: 2, reps: 10, rest: 0, custom: true });
    expect(applyOver({ type: 'hold', sets: 1, reps: 1, hold: 10 }, { hold: 20 }).hold).toBe(20);
  });

  it('durée estimée : séries × travail + repos + mise en place', () => {
    // tempo 2-1-2 → 5 s par répétition ; 3 séries de 10 reps ; 2 repos de 30 s ; 40 s de mise en place
    expect(exerciseSeconds({ type: 'reps', sets: 3, reps: 10, tempo: '2-1-2' })).toBe(3 * 50 + 2 * DEFAULT_REST + 40);
    // maintien : reps × (hold + 4)
    expect(exerciseSeconds({ type: 'hold', sets: 2, reps: 5, hold: 10, rest: 20 })).toBe(2 * 5 * 14 + 20 + 40);
  });

  it('part de répétitions partielles', () => {
    expect(partialShare({ sets: [] })).toBe(0);
    expect(
      partialShare({
        sets: [
          { full: 6, partial: 2 },
          { full: 2, partial: 0 },
        ],
      }),
    ).toBe(0.2);
  });

  it('résumé par exercice : niveau, dernière difficulté, tendance', () => {
    const id = Object.keys(doseSample())[0]!;
    const profile = { plan: { phase: 1, ids: [id] }, phase: 1, levels: { [id]: 4 } };
    const t0 = Date.UTC(2026, 0, 1, 12);
    const sessions: Session[] = [
      { id: 1, date: t0, items: [{ id, ts: t0, difficulty: 2, pain: 1, change: 1, sets: [] }] },
      { id: 2, date: t0 + 2 * DAY, items: [{ id, ts: t0 + 2 * DAY, difficulty: 3, pain: 2, change: 1, sets: [] }] },
    ];
    expect(exerciseSummary(profile, sessions)).toEqual({
      [id]: { level: 4, lastDifficulty: 3, lastPain: 2, trend: 'up' },
    });
    expect(exerciseSummary(profile, [])[id]).toEqual({
      level: 4,
      lastDifficulty: null,
      lastPain: null,
      trend: 'steady',
    });
  });

  it('commentaires récents : les plus récents d’abord, texte tronqué à 400', () => {
    const sessions: Session[] = [
      {
        id: 1,
        date: 1000,
        items: [
          { id: 'a', note: 'x'.repeat(500), pain: 3, sets: [] },
          { id: 'b', sets: [] },
        ],
      },
      { id: 2, date: 3000, items: [{ id: 'c', ts: 2000, note: 'bien', sets: [] }] },
    ];
    const n = recentNotes(sessions, 5);
    expect(n.map((x) => x.ex)).toEqual(['c', 'a']);
    expect(n[1]!.text).toHaveLength(400);
    expect(n[1]!.pain).toBe(3);
    expect(recentNotes(sessions, 1)).toHaveLength(1);
  });

  it('dose de base : un niveau plus bas = moins de répétitions', () => {
    const id = Object.keys(doseSample())[0]!;
    expect(doseFor(id, 1).reps).toBeLessThanOrEqual(doseFor(id, 5).reps);
  });
});

function doseSample(): Record<string, unknown> {
  const first = PATHOLOGIES[0]!;
  const ids = first.phases[1] as string[];
  return Object.fromEntries(ids.map((i) => [i, true]));
}
