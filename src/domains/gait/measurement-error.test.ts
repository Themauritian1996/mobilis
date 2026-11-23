import { describe, expect, it } from 'vitest';
import { analyzeGait, compareAssessments, measurementError, type GaitMetric } from './index.ts';
import { generateGait, variantParams } from './testing/synthetic.ts';

const m = (id: string, unit: string): GaitMetric => ({
  id,
  unit,
  value: 1,
  view: 'sagittal-left',
  confidence: 1,
  estimate: false,
});

// Audit v2 : les indices de symétrie « symmetry_index_step_time » (en %) recevaient la marge des durées (0,01 s),
// si bien qu'un simple bruit entre deux captures normales était déclaré « changement significatif » en A/B.
describe('measurementError : unités', () => {
  it('durées en secondes : 0,01 s (Stenum 2021)', () => {
    expect(measurementError(m('step_time', 's'))?.value).toBe(0.01);
    expect(measurementError(m('stride_time', 's'))?.value).toBe(0.01);
  });
  it('indice de symétrie d’une durée (en %) : pas la marge des secondes', () => {
    expect(measurementError(m('symmetry_index_step_time', '%'))).toBeNull();
    expect(measurementError(m('symmetry_index_single_support_time', '%'))).toBeNull();
  });
  it('deux captures normales (bruit différent) : aucun indice de symétrie temporel « significatif »', () => {
    const g = (seed: number) =>
      analyzeGait({
        frames: generateGait(variantParams('normal', { fps: 60, seed })).frames,
        view: 'sagittal-left',
        patient: { heightCm: 175 },
      });
    const c = compareAssessments([g(1)], [g(2)]);
    expect(
      c.metrics.filter((x) => x.id.startsWith('symmetry_index_') && x.id.endsWith('_time') && x.significant),
    ).toEqual([]);
  });
});
