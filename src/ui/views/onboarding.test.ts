import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Onboarding from './onboarding.ts';

// Les modules legacy lisent `window` / `localStorage` à l'import : navigateur minimal simulé avant le chargement.
let O: typeof Onboarding;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  O = await import('./onboarding.ts');
});

describe('onboarding (vue)', () => {
  it('bodyMap : un point par articulation, la région choisie est marquée', () => {
    const html = O.bodyMap('knee');
    expect(html.match(/class="bm-dot/g)).toHaveLength(17);
    expect(html.match(/bm-dot on/g)).toHaveLength(2);
    expect(O.bodyMap(null)).not.toContain('bm-dot on');
  });

  it('daysPicker : un bouton par jour, les jours choisis sont pressés', () => {
    const html = O.daysPicker([1, 3]);
    expect(html.match(/data-day="/g)).toHaveLength(7);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it('rxExtras : dose rattachée aux exercices du programme seulement, plans vides par défaut', () => {
    const out = O.rxExtras({
      phase: 1,
      ids: ['a'],
      levels: { a: 3 },
      dose: { a: { reps: 8 }, z: { reps: 5 } },
      report: { every: 4 },
    });
    expect(out['rxDose']).toEqual({ a: { reps: 8, lv: 3 } });
    expect(out['reportPlan']).toEqual({ every: 4 });
    expect(out['promPlan']).toEqual([]);
    expect(O.rxExtras({ phase: 1, ids: [] })['reportPlan']).toBeNull();
  });

  it('layName / medName : identifiant inconnu → texte vide', () => {
    expect(O.layName('inconnu')).toBe('');
    expect(O.medName('inconnu')).toBe('');
  });

  describe('programme importé sans pathologie (créé depuis un plan)', () => {
    // Condition du routeur : un patient sans pathologie est renvoyé à l'onboarding.
    const loops = (p: Record<string, unknown>): boolean => p['role'] === 'patient' && !p['pathology'];

    it("n'est pas renvoyé en boucle vers l'onboarding : pathologie générique", () => {
      const p = O.rxToProfile({ phase: 1, ids: ['a', 'b'], region: 'knee' }, undefined, { name: 'X' });
      expect(p['role']).toBe('patient');
      expect(p['pathology']).toBe(O.CUSTOM_PATHOLOGY_ID);
      expect(loops(p)).toBe(false);
      expect(p['plan']).toEqual({ phase: 1, ids: ['a', 'b'] });
      expect(O.layName(O.CUSTOM_PATHOLOGY_ID)).not.toBe('');
    });

    it('programmes avec pathologie ou protocole : comportement v1.15 inchangé', () => {
      const withPath = O.rxToProfile({ phase: 2, ids: ['a'], pathology: 'frozen' }, undefined);
      expect(withPath['pathology']).toBe('frozen');
      expect(O.rxPathologyId({ pathology: 'frozen', ids: [] })).toBe('frozen');
      // protocole sans pathologie : la pathologie vient de la région du protocole (protocolPathology), pas de la générique
      expect(O.rxPathologyId({ ids: ['a'], protocol: { id: 'x' } })).toBeNull();
      // programme vide sans pathologie : toujours onboarding (rien à pratiquer)
      expect(O.rxPathologyId({ ids: [] })).toBeNull();
    });
  });
});
