import { describe, expect, it } from 'vitest';
import { analyzeGait, assessGait, compareAssessments } from '../../../domains/gait/index.ts';
import { generateGait, variantParams } from '../../../domains/gait/testing/synthetic.ts';
import { deltaRows, determinantViews, findingName, findingViews } from './present.ts';

describe('comparaison A/B : marge inconnue', () => {
  it('affiche « — » et jamais « ± 0 » quand aucune erreur de mesure n’est connue', () => {
    const g = (seed: number) =>
      analyzeGait({
        frames: generateGait(variantParams('normal', { fps: 60, seed })).frames,
        view: 'sagittal-left',
        patient: { heightCm: 175 },
      });
    const cmp = compareAssessments([g(1)], [g(2)]);
    const zero = new Set(cmp.metrics.filter((m) => m.margin === 0).map((m) => `${m.id}|${m.side ?? ''}`));
    expect(zero.size).toBeGreaterThan(0);
    for (const r of deltaRows(cmp))
      if (zero.has(`${r.id}|${r.side ?? ''}`)) {
        expect(r.margin).toBe('—');
        expect(r.significant).toBe(false);
      }
  });
});

// Audit v2 : « Seuils non validés : ankle_msw_plantarflexed (proposed_heuristic) » et « Défauts liés :
// foot_drop_steppage (…) » affichaient des identifiants internes à l'écran.
const assessment = assessGait(
  (['sagittal-left', 'sagittal-right'] as const).map((view) =>
    analyzeGait({
      frames: generateGait(variantParams('foot_drop', { view, fps: 60 })).frames,
      view,
      patient: { heightCm: 175 },
    }),
  ),
);
const ID = /^[a-z]+(_[a-z0-9]+)+$/;

describe('libellés lisibles (aucun identifiant interne)', () => {
  it('seuils non validés : texte du critère', () => {
    const views = findingViews(assessment.findings, 'fr');
    const all = views.flatMap((v) => v.unvalidated);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s).not.toMatch(ID);
      expect(s).not.toContain('proposed_heuristic');
    }
  });
  it('défauts liés aux déterminants : nom du défaut', () => {
    const linked = determinantViews(assessment.determinants, 'fr').flatMap((d) => d.linkedFindings);
    expect(linked.length).toBeGreaterThan(0);
    for (const f of linked) expect(f.name).not.toMatch(ID);
    expect(findingName('foot_drop_steppage', 'fr')).toBe('Pied tombant et démarche en steppage');
    expect(findingName('foot_drop_steppage', 'en')).toBe('Foot drop / steppage gait');
  });
});
