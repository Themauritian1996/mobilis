import { afterEach, describe, expect, it } from 'vitest';
import { inTrial, navRole, nextExercise, profile, sessions, state, todaySession } from './app-state.ts';

afterEach(() => {
  state.data = null;
});

describe('app-state', () => {
  it('sans données : pas de profil, de séance ni d’exercice suivant', () => {
    expect(profile()).toBeUndefined();
    expect(sessions()).toEqual([]);
    expect(nextExercise()).toBeNull();
    expect(inTrial()).toBe(false);
  });

  it('todaySession(true) crée une séance vide du jour', () => {
    const s = todaySession(true);
    expect(s?.items).toEqual([]);
    expect(s?.checkin).toBeNull();
    expect(todaySession()).toBeUndefined();
  });

  it('un clinicien avec une pathologie est en « mode test patient »', () => {
    state.data = { profile: { role: 'clinician', pathology: 'frozen' }, sessions: [], journal: [] };
    expect(inTrial()).toBe(true);
    expect(navRole()).toBe('patient');
    state.data = { profile: { role: 'clinician' }, sessions: [], journal: [] };
    expect(navRole()).toBe('clinician');
  });
});
