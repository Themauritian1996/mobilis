import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRINGS } from './strings.ts';

const SRC = ['plan-view.ts', 'devices-view.ts', 'routes.ts'].map((f) =>
  readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'),
);

describe('textes du volet traitement', () => {
  it('fr et en présents pour chaque clé', () => {
    for (const [k, v] of Object.entries(STRINGS)) {
      expect(v.fr, k).toBeTruthy();
      expect(v.en, k).toBeTruthy();
    }
  });

  it('toute clé utilisée existe', () => {
    const used = new Set<string>();
    for (const src of SRC) for (const m of src.matchAll(/\bt\('([A-Za-z_0-9]+)'/g)) used.add(m[1]!);
    for (const k of used) expect(STRINGS[k], k).toBeDefined();
  });

  it('familles dynamiques complètes', () => {
    const fam: Record<string, string[]> = {
      kind_: ['exercise', 'gait_training', 'assistive_device', 'orthosis', 'prosthetic_adjustment', 'referral', 'injection_evaluation', 'other'],
      prio_: ['high', 'medium', 'low'],
      goal_: ['achieved', 'in_progress', 'not_achieved', 'no_data'],
      status_: ['draft', 'active', 'closed'],
      lm_: ['wrist_crease', 'greater_trochanter', 'axilla', 'olecranon', 'foot'],
      el_: ['ok', 'borderline', 'too_flexed', 'too_extended'],
      aff_: ['left', 'right', 'bilateral', 'none', 'unknown'],
    };
    for (const [p, ks] of Object.entries(fam)) for (const k of ks) expect(STRINGS[p + k], p + k).toBeDefined();
  });
});
