import { it } from 'vitest';
import { analyzeGait } from './analyze.ts';
import { generateGait, variantParams } from './testing/synthetic.ts';
it('dev', () => {
  for (const view of ['sagittal-left', 'frontal'] as const) {
    const { frames, truth } = generateGait(variantParams('normal', { view }));
    const a = analyzeGait({ frames, view, patient: { heightCm: 175 }, options: { imageAspect: truth.imageAspect } });
    console.log(view, 'scale', a.scale.metersPerUnit, truth.metersPerUnit, a.scale.notes, a.walkingDirection);
    console.log('truth', truth.events.map((e) => `${e.side}${e.type}${e.frame}`).join(' '));
    console.log('det  ', a.events.map((e) => `${e.side}${e.type}${e.frame}`).join(' '));
    console.log(
      a.cycles
        .map((c) => `${c.side}${c.startFrame}-${c.endFrame} st${c.stancePct?.toFixed(0)} ${c.rejected ? c.rejectReason : ''}`)
        .join(' | '),
    );
    console.log('steps truth', truth.stepLengths.map((s) => s.value.toFixed(3)).join(' '));
    for (const m of a.metrics)
      console.log(
        m.id,
        m.side ?? '',
        m.value?.toFixed(3),
        m.sd?.toFixed(2),
        m.n,
        m.confidence.toFixed(2),
        m.norm ? `z=${m.norm.z?.toFixed(2)} pct=${m.norm.pctOfMean.toFixed(0)}` : '',
      );
    console.log(a.warnings);
  }
});
