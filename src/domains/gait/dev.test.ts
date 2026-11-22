import { it } from 'vitest';
import { analyzeGait } from './analyze.ts';
import { assessGait } from './assess.ts';
import { assessProstheticGait } from '../prosthetics/index.ts';
import { generateGait, variantParams, type Variant } from './testing/synthetic.ts';
it('variants', () => {
  const vs: Variant[] = ['normal', 'foot_drop', 'trendelenburg', 'stiff_knee', 'circumduction', 'prosthetic_asymmetry'];
  for (const v of vs) {
    const an = (['sagittal-left', 'frontal'] as const).map((view) => {
      const { frames, truth } = generateGait(
        variantParams(v, { view, ...(view === 'frontal' ? { noise: 0.0007, standingS: 2 } : {}) }),
      );
      return analyzeGait({ frames, view, patient: { heightCm: 175 }, options: { imageAspect: truth.imageAspect } });
    });
    const a = assessGait(an);
    console.log(
      'VAR',
      v,
      a.findings
        .filter((f) => f.status !== 'absent')
        .map((f) => `${f.id}/${f.side}:${f.status}:${f.score.toFixed(2)}[${f.why.map((c) => c.id + '=' + c.value?.toFixed(2)).join(',')}]`)
        .join(' | '),
    );
    console.log('DET', v, a.determinants.map((d) => `${d.id}:${d.status}`).join(' '));
    if (v === 'prosthetic_asymmetry' || v === 'normal') {
      const p = assessProstheticGait(an, { level: 'transtibial', side: 'L' });
      console.log(
        'PRO',
        v,
        p.deviations.map((f) => `${f.id}:${f.status}:${f.score.toFixed(2)}`).join(' | '),
      );
    }
  }
});
