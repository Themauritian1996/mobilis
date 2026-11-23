import { describe, expect, it } from 'vitest';
import type { GaitView } from '../../../domains/gait/index.ts';
import { generateGait, variantParams } from '../../../domains/gait/testing/synthetic.ts';
import { analyzeCapture, engineConfig, type ViewRecording } from './analysis.ts';
import { defaultsFromPatient, validateForm } from './model.ts';

// Audit v2 (spec §10.6) : « ≥ 3 cycles valides par côté ; nombre de cycles configurable ». Le formulaire acceptait 1 ou
// 2 cycles et le réglage ne servait qu'à la fin automatique : les règles exigeaient toujours 3 cycles.
const views: GaitView[] = ['sagittal-left', 'sagittal-right'];
const recs: ViewRecording[] = views.map((view) => {
  const { frames, truth } = generateGait(variantParams('foot_drop', { view, fps: 60, cycles: 6 }));
  return { view, frames, aspect: truth.imageAspect };
});
const settings = (n: string) => {
  const v = validateForm({ ...defaultsFromPatient(null), heightCm: '175', targetCycles: n });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return v.settings;
};
const footDropL = (n: string) =>
  analyzeCapture(recs, settings(n), null, 2026).assessment.findings.find(
    (f) => f.id === 'foot_drop_steppage' && f.side === 'L',
  )?.status;

describe('cycles valides exigés par côté', () => {
  it('moins de 3 cycles refusé par le formulaire', () => {
    for (const n of ['1', '2'])
      expect(validateForm({ ...defaultsFromPatient(null), heightCm: '175', targetCycles: n })).toMatchObject({
        ok: false,
        errors: { targetCycles: 'range' },
      });
  });
  it('le réglage est transmis aux règles du moteur', () => {
    expect(engineConfig({ targetCycles: 3 }).minCyclesPerSide).toBe(3);
    expect(engineConfig({ targetCycles: 8 }).minCyclesPerSide).toBe(8);
    expect(footDropL('3')).toBe('probable');
    // 6 cycles enregistrés (≈ 5 valides) : en exiger 10 rend le défaut « données insuffisantes »
    expect(footDropL('10')).toBe('insufficient_data');
  });
});
