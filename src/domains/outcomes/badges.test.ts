import { describe, expect, it } from 'vitest';
import { BADGES, badgeProgress, evaluateBadges, type BadgeSession } from './badges.ts';

const at = (k: string, h = 10): number => new Date(`${k}T${String(h).padStart(2, '0')}:00`).getTime();
const NOW = at('2026-11-15', 20);
const sess = (k: string, items: BadgeSession['items'] = []): BadgeSession => ({ date: at(k), items });

describe('badges (évaluation pure)', () => {
  it('le catalogue a des identifiants uniques', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it('sans séance : aucun badge ; avec une séance : « first »', () => {
    expect(evaluateBadges({}, [], NOW)).toEqual({ earned: {}, newOnes: [] });
    const r = evaluateBadges({}, [sess('2026-11-02')], NOW);
    expect(r.newOnes).toEqual(['first']);
    expect(r.earned['first']).toBe(at('2026-11-02'));
  });

  it('un badge déjà gagné n’est ni recalculé ni retiré', () => {
    const r = evaluateBadges({ badges: { first: 42 } }, [sess('2026-11-02')], NOW);
    expect(r.earned['first']).toBe(42);
    expect(r.newOnes).toEqual([]);
  });

  it('« levelUp » : une séance avec un changement de niveau positif', () => {
    const r = evaluateBadges({}, [sess('2026-11-02', [{ id: 'x', change: 1, ts: 777 }])], NOW);
    expect(r.earned['levelUp']).toBe(777);
  });

  it('« comeback » : une séance après au moins 7 jours sans séance', () => {
    const r = evaluateBadges({}, [sess('2026-11-02'), sess('2026-11-12')], NOW);
    expect(r.earned['comeback']).toBe(at('2026-11-12'));
  });

  it('« rangeUp » : +10° sur une même mesure, mesures peu fiables ignorées', () => {
    const rom = [
      { test: 'sh_flex', side: 'L', deg: 90, ts: 1000 },
      { test: 'sh_flex', side: 'L', deg: 120, ts: 2000, conf: 0.2 },
      { test: 'sh_flex', side: 'L', deg: 105, ts: 3000 },
    ];
    expect(evaluateBadges({ romLog: rom }, [], 5000).earned['rangeUp']).toBe(3000);
  });

  it('badgeProgress : seulement pour les badges de série et de compte', () => {
    const sessions = [sess('2026-11-02'), sess('2026-11-04')];
    const count = BADGES.find((b) => b.id === 'sessions10')!;
    expect(badgeProgress(count, {}, sessions, NOW)).toEqual({ n: 2, of: 10, unit: 'bdgUnitSess' });
    expect(
      badgeProgress(
        BADGES.find((b) => b.id === 'first')!,
        {},
        sessions,
        NOW,
      ),
    ).toBeNull();
  });
});
