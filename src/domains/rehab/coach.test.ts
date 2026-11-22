import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../core/i18n/engine.ts';
import { createCoachComments, cueText, localComment } from './coach.ts';

beforeAll(async () => {
  vi.stubGlobal('document', { documentElement: {} });
  await setLang('en');
});

describe('coach : textes locaux et commentaires', () => {
  it('consigne : texte du catalogue, sinon clé « cue_… »', () => {
    expect(cueText('slow')).toBe('Slow it down');
    expect(cueText('inconnue')).toBe('cue_inconnue');
  });

  it('commentaire local : série vide, correction prioritaire, maintien, semaine', () => {
    expect(localComment({ reps: 0 })).toContain('Set saved');
    const withFault = localComment({ reps: 10, full: 8, faults: { slow: 1, trunk: 4 } });
    expect(withFault).toContain('Lift your chest.');
    expect(localComment({ mode: 'hold', holdSec: 0 })).toContain('Set saved');
    expect(localComment({ kind: 'week', sessions: 3, planned: 3, week: 2, painDelta: -1 })).toContain(
      'Great consistency!',
    );
    expect(localComment({ kind: 'week', sessions: 1, planned: 3, week: 2, painDelta: 1 })).toContain(
      'one more session',
    );
  });

  it('commentaires : IA si elle répond, sinon repli local (avec plafond)', async () => {
    const ask = vi.fn(async (kind: string) => (kind === 'set' ? 'Bien joué' : ''));
    const c = createCoachComments({ ask, capped: () => true });
    expect(await c.coachComment({ reps: 5 })).toEqual({ text: 'Bien joué', source: 'gemini' });
    const week = await c.coachComment({ kind: 'week', sessions: 1, planned: 2, week: 1, painDelta: 0 });
    expect(week).toMatchObject({ source: 'local', capped: true });
    expect(ask).toHaveBeenCalledWith('week', expect.anything(), undefined);
    const failing = createCoachComments({ ask: async () => Promise.reject(new Error('offline')), capped: () => false });
    expect((await failing.coachReply({})).source).toBe('local');
  });
});
