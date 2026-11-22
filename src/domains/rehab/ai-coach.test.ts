import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../core/i18n/engine.ts';
import { fineKind, planeText } from '../../vision/exercise-view.ts';
import {
  allowedFor,
  createPreciseCoach,
  validate,
  type CoachExercise,
  type PreciseDeps,
  type PreciseResult,
} from './ai-coach.ts';

beforeAll(async () => {
  vi.stubGlobal('document', { documentElement: {} });
  await setLang('en');
});

const squat: CoachExercise = {
  fig: { view: 'side' },
  track: { planes: { side: { checks: [{ cue: 'trunk' }] }, front: { checks: [{ cue: 'valgus' }] } } },
  keys: [{ fr: 'Genoux alignés', en: 'Knees over toes' }],
};

describe('cadrage', () => {
  it('mouvements fins et texte de plan', () => {
    expect(fineKind({ fig: { view: 'palm' } })).toBe('hand');
    expect(fineKind({ fig: { view: 'footBack' } })).toBe('foot');
    expect(fineKind({})).toBeNull();
    expect(planeText({ plane: 'side' })).toContain('SIDE view');
    expect(planeText({ plane: 'front' })).toContain('FRONT view');
    expect(planeText({ plane: 'guided' })).toContain('mirror view');
    expect(planeText({ ex: { fig: { view: 'hand' } }, plane: 'side' })).toContain('CLOSE-UP of the hand');
  });
});

describe('corrections autorisées', () => {
  it('mesurées + visuelles du plan, profondeur/lenteur en séries, clés du clinicien', () => {
    const a = allowedFor(squat, 'side', 'reps');
    expect(a.measured.has('trunk')).toBe(true);
    expect(a.cues).toEqual(expect.arrayContaining(['trunk', 'depth', 'slow']));
    expect(a.cues).not.toContain('holdIt');
    expect(a.keys).toEqual([{ id: 'key1', en: 'Knees over toes' }]);
    expect(allowedFor(squat, 'side', 'hold').cues).toContain('holdIt');
  });
});

describe('validation de la réponse de l’IA', () => {
  const allowed = allowedFor(squat, 'side', 'reps');
  it('encouragement, clé, correction, refus', () => {
    expect(
      validate({ cue: 'none', confidence: 0.9, say: 'Bien joué mon ami super' }, allowed, null, squat),
    ).toMatchObject({
      kind: 'ok',
      text: 'Bien joué mon ami super',
    });
    expect(validate({ cue: 'none', confidence: 1, say: 'Top' }, allowed, { move: 'MISMATCH' }, squat)).toBeNull();
    expect(validate({ cue: 'key1', confidence: 0.9 }, allowed, null, squat)).toMatchObject({ kind: 'key', keyIdx: 0 });
    expect(validate({ cue: 'key1', confidence: 0.5 }, allowed, null, squat)).toBeNull();
    expect(validate({ cue: 'inventée', confidence: 1 }, allowed, null, squat)).toBeNull();
    expect(validate({ cue: 'depth', confidence: 1 }, allowed, { romPct: 95 }, squat)).toBeNull();
    // la mesure dit « normal » : la correction est refusée
    const ok = { cue: 'trunk', metric: 'trunk', kind: 'max' as const, value: 5, limit: 20 };
    expect(validate({ cue: 'trunk', confidence: 1 }, allowed, { checks: [ok] }, squat)).toBeNull();
    const bad = { ...ok, value: 30 };
    expect(validate({ cue: 'trunk', confidence: 1 }, allowed, { checks: [bad] }, squat)).toMatchObject({
      kind: 'fix',
      cue: 'trunk',
    });
    // correction purement visuelle : confiance minimale
    expect(validate({ cue: 'arch', confidence: 0.6 }, allowedFor(squat, 'guided', 'guided'), null, squat)).toBeNull();
  });
});

describe('coach précis (IA simulée)', () => {
  const make = (reply: unknown, key = 'K') => {
    const askJSON = vi.fn<PreciseDeps['askJSON']>(async () => reply);
    const results: PreciseResult[] = [];
    const states: string[] = [];
    const coach = createPreciseCoach(
      { ex: squat, exercise: 'Squat', condition: 'genou', steps: ['a', 'b'], plane: 'side', mode: 'reps' },
      { onResult: (r) => results.push(r), onState: (s) => states.push(s) },
      { key, askJSON, metricInfo: { knee: 'knee angle' } },
    );
    return { askJSON, results, states, coach };
  };

  it('sans clé : aucun appel', async () => {
    const { askJSON, coach } = make({ cue: 'none', confidence: 1, say: 'ok' }, '');
    await coach.review(null, null);
    expect(askJSON).not.toHaveBeenCalled();
  });

  it('correction validée : prononcée une fois, pas répétée dans les 12 s', async () => {
    const { askJSON, results, coach } = make({ cue: 'trunk', confidence: 1, seen: 'dos penché' });
    const meas = { checks: [{ cue: 'trunk', metric: 'knee', kind: 'max' as const, value: 30, limit: 20 }] };
    await coach.review('IMG', meas);
    await coach.review('IMG', meas);
    expect(askJSON).toHaveBeenCalledTimes(2);
    expect(String(askJSON.mock.calls[0]?.[2][0]?.['text'])).toContain('knee angle');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'fix', cue: 'trunk', seen: 'dos penché' });
  });

  it('la caméra a déjà dit la faute : silence ; deux erreurs : état « error » ; arrêt : « off »', async () => {
    const dup = make({ cue: 'trunk', confidence: 1 });
    await dup.coach.review(null, { faults: ['trunk'] });
    expect(dup.results).toHaveLength(0);
    const fail = make(null);
    fail.askJSON.mockRejectedValue(new Error('x'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await fail.coach.review(null, null);
    await fail.coach.review(null, null);
    expect(fail.states).toEqual(['live', 'error']);
    fail.coach.stop();
    expect(fail.states.at(-1)).toBe('off');
  });
});
