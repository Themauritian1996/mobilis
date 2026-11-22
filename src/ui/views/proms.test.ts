import { describe, expect, it } from 'vitest';
import { clinicPanelProm, homeCardProm, importPromLicense, packTexts, rxExtrasProm } from './proms.ts';

describe('proms (vue)', () => {
  it('rxExtrasProm normalise le plan et copie en profondeur les textes et questionnaires', () => {
    const rx = {
      prom: [{ id: 'a', every: '4', first: '7' }, { id: 'b' }],
      promTexts: { a: { items: [] } },
      promCustom: [{ id: 'c_1' }],
    };
    const out = rxExtrasProm(rx as never);
    expect(out.promPlan).toEqual([
      { id: 'a', every: 4, first: 7 },
      { id: 'b', every: 0, first: 0 },
    ]);
    expect(out.promTexts).toEqual(rx.promTexts);
    expect(out.promTexts).not.toBe(rx.promTexts);
    expect(rxExtrasProm(null)).toEqual({ promPlan: [], promTexts: {}, promCustom: [] });
  });

  it('packTexts ne garde que les textes valides des instruments sous licence du plan', () => {
    const embedded = { a: { items: [1] }, z: { items: [2] } }; // instruments inconnus : ignorés
    expect(packTexts([{ id: 'a' }, { id: 'b' }], embedded)).toEqual({});
    expect(packTexts(null, embedded)).toEqual({});
  });

  it('cartes vides : pas de profil → pas de carte ; pas de résultats → pas de panneau', () => {
    expect(homeCardProm(null)).toBe('');
    expect(homeCardProm({})).toBe('');
    expect(clinicPanelProm(null)).toBe('');
    expect(clinicPanelProm({ prom: [] })).toBe('');
  });

  it('clinicPanelProm affiche le nom, le départ et le dernier score', () => {
    const html = clinicPanelProm({
      prom: [{ name: { fr: 'Test', en: 'Test' }, baseline: 10, last: 4, delta: -6, improvement: 1, series: [[1, 10]] }],
    });
    expect(html).toContain('prom-clin');
    expect(html).toContain('>10<');
    expect(html).toContain('>4<');
    expect(html).toContain('prom-delta pos');
  });

  it('importPromLicense refuse un fichier invalide', () => {
    expect(importPromLicense('pas du json').ok).toBe(false);
  });
});
