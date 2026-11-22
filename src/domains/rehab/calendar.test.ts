import { describe, expect, it } from 'vitest';
import { appointments, nextReminderAt, planReminders } from './calendar.ts';

const at = (k: string, h = 12): number => new Date(`${k}T${String(h).padStart(2, '0')}:00`).getTime();

describe('calendar (rappels et rendez-vous)', () => {
  it('appointments : trie par date et ajoute la prochaine visite de la prescription', () => {
    const list = appointments({
      appointments: [
        { date: '2026-12-10', time: '10:00', note: 'b' },
        { date: '2026-12-01', time: '09:00', note: 'a' },
      ],
      nextVisit: '2026-12-05',
    });
    expect(list.map((a) => a.date)).toEqual(['2026-12-01', '2026-12-05', '2026-12-10']);
    expect(list[1]?.fromRx).toBe(true);
    expect(list[0]?._i).toBe(1);
  });

  it('appointments : la prochaine visite déjà présente n’est pas dupliquée', () => {
    const list = appointments({ appointments: [{ date: '2026-12-05', time: '', note: '' }], nextVisit: '2026-12-05' });
    expect(list).toHaveLength(1);
  });

  it('nextReminderAt : aujourd’hui si l’heure n’est pas passée, sinon demain', () => {
    const now = new Date(at('2026-11-15', 10));
    expect(nextReminderAt('18:30', now).getTime()).toBe(new Date(2026, 10, 15, 18, 30).getTime());
    expect(nextReminderAt('08:00', now).getTime()).toBe(new Date(2026, 10, 15, 8, 0).getTime() + 86400000);
    expect(nextReminderAt(undefined, now).getHours()).toBe(18);
  });

  it('planReminders : seulement les jours prévus à venir, et la veille des rendez-vous', () => {
    const now = at('2026-11-15', 10); // dimanche
    const prof = {
      days: [1, 3, 5],
      joinedAt: at('2026-10-01'),
      remind: { on: true, time: '18:00' },
      appointments: [{ date: '2026-11-20', time: '14:00', note: 'bilan' }],
    };
    const list = planReminders(prof, now);
    const daily = list.filter((n) => n.id < 500);
    expect(daily.length).toBeGreaterThan(10);
    expect(daily.every((n) => [1, 3, 5].includes(n.schedule.at.getDay()))).toBe(true);
    expect(daily.every((n) => n.schedule.at.getTime() > now)).toBe(true);
    const appt = list.find((n) => n.id === 500);
    expect(appt?.schedule.at.getDate()).toBe(19);
    expect(appt?.schedule.at.getHours()).toBe(18);
    expect(appt?.body).toContain('14:00');
  });
});
