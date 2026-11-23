import { describe, expect, it } from 'vitest';
import { conditionSummary } from './patients.ts';

// Audit v2 : la chronologie affichait « 175 · none · none · shoes · comfortable · 3 » (codes techniques bruts).
describe('conditionSummary', () => {
  it('ne garde que les textes saisis (modification, consigne, condition d’étude)', () => {
    expect(
      conditionSummary({
        heightCm: '175',
        affectedSide: 'none',
        assistiveDevice: 'none',
        footwear: 'shoes',
        speed: 'comfortable',
        targetCycles: '3',
        'fps:frontal': '60',
        modification: 'canne à droite',
        instruction: 'regarder devant',
        studyCondition: 'Sans orthèse',
      }),
    ).toEqual(['canne à droite', 'regarder devant', 'Sans orthèse']);
    expect(conditionSummary({ footwear: 'shoes' })).toEqual([]);
    expect(conditionSummary(undefined)).toEqual([]);
  });
});
