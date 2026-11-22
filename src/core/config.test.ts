import { describe, expect, it } from 'vitest';
import { LEGACY_CONFIG_VALUES, isFirebaseEnabled, resolveCoachUrl } from './config.ts';

describe('configuration v1.15', () => {
  it('Firebase actif seulement avec une clé et un projet', () => {
    expect(isFirebaseEnabled(LEGACY_CONFIG_VALUES)).toBe(true);
    expect(isFirebaseEnabled({ firebase: { ...LEGACY_CONFIG_VALUES.firebase, apiKey: '' } })).toBe(false);
    expect(isFirebaseEnabled({ firebase: { ...LEGACY_CONFIG_VALUES.firebase, projectId: '' } })).toBe(false);
  });

  it('URL du coach : relative sur le web, absolue dans l’APK', () => {
    const c = { siteUrl: 'https://site.example', coachEndpoint: '/api/coach' };
    expect(resolveCoachUrl(c, false)).toBe('/api/coach');
    expect(resolveCoachUrl(c, true)).toBe('https://site.example/api/coach');
    expect(resolveCoachUrl({ ...c, coachEndpoint: 'https://r.example/x' }, true)).toBe('https://r.example/x');
    expect(resolveCoachUrl({ ...c, coachEndpoint: '' }, true)).toBe('');
  });

  it('aucune clé secrète dans la configuration (pas de clé Gemini)', () => {
    expect(JSON.stringify(LEGACY_CONFIG_VALUES)).not.toMatch(/gemini[-_ ]?key/i);
  });
});
