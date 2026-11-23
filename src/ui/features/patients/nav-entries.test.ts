import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Nav from './nav-entries.ts';
import type * as Settings from './settings.ts';

// Modules legacy (i18n) : navigateur minimal simulé avant l'import ; localStorage en mémoire pour `mobilis.flags`.
const ls = new Map<string, string>();
let N: typeof Nav;
let S: typeof Settings;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  const R = await import('../registry.ts');
  R._resetRegistry();
  R.registerNav({ id: 'x', labelKey: 'cle', label: () => 'Libellé', href: '#/x', flag: 'gait', place: 'home' });
  R.registerNav({ id: 'y', labelKey: 'cle2', href: '#/y', flag: 'gait', roles: ['clinician'], place: 'home' });
  N = await import('./nav-entries.ts');
  S = await import('./settings.ts');
});

describe('entrées de navigation des volets', () => {
  it('rien quand le drapeau gait est désactivé (défaut)', () => {
    expect(N.gaitOn()).toBe(false);
    expect(N.featureNavHtml('home', 'patient')).toBe('');
  });

  it('le réglage du profil active le drapeau sans perdre les autres', () => {
    ls.set('mobilis.flags', JSON.stringify({ autre: true }));
    S.setGaitFlag(true);
    expect(JSON.parse(ls.get('mobilis.flags')!)).toEqual({ autre: true, gait: true });
    const html = N.featureNavHtml('home', 'patient');
    expect(html).toContain('Libellé');
    expect(html).toContain('data-go="#/x"');
    expect(html).not.toContain('#/y'); // rôle clinicien seulement
    S.setGaitFlag(false);
    expect(N.featureNavHtml('home', 'patient')).toBe('');
  });
});
