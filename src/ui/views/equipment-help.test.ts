import { beforeAll, describe, expect, it, vi } from 'vitest';

// coach.js (legacy) lit `window` à l'import : on simule le minimum d'un navigateur avant de charger la vue.
import type * as EquipmentHelp from './equipment-help.ts';
let M: typeof EquipmentHelp;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  M = await import('./equipment-help.ts');
});

describe('equipment-help (vue)', () => {
  it('choiceLabel : nom, avec le poids estimé s’il existe', () => {
    expect(M.choiceLabel({ name: 'Bouteille' })).toBe('Bouteille');
    expect(M.choiceLabel({ name: 'Sac', kg: 0 })).toBe('Sac');
    expect(M.choiceLabel({ name: 'Sac', kg: 2 })).toMatch(/^Sac ≈ 2 kg$/);
  });

  it('exercice inconnu : aucun bloc d’aide et aucune pastille', () => {
    expect(M.equipHelpHtml('exercice-inconnu', 2, {})).toBe('');
    expect(M.equipChipHtml('exercice-inconnu', {})).toBe('');
  });

  it('pastille : l’objet déjà choisi est affiché tel quel (HTML échappé)', () => {
    const html = M.equipChipHtml('x', { equipChoice: { x: { name: '<b>Sac</b>', kg: 3 } } });
    expect(html).toContain('eq-chip');
    expect(html).toContain('&lt;b&gt;Sac&lt;/b&gt;');
  });

  it('judgeObject : exercice inconnu → null (sans appel réseau)', async () => {
    expect(await M.judgeObject('exercice-inconnu', 2, 'bouteille', { ai: false })).toBeNull();
  });
});
