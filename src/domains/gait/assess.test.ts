import { describe, expect, it } from 'vitest';
import { assessProstheticGait } from '../prosthetics/index.ts';
import { analyzeGait } from './analyze.ts';
import { assessGait, compareAssessments, measurementError } from './assess.ts';
import { withConfig } from './config.ts';
import { DETERMINANTS } from './determinant-ids.ts';
import { generateGait, variantParams, type Variant } from './testing/synthetic.ts';
import type { GaitAnalysis, GaitView } from './types.ts';

const cache = new Map<string, GaitAnalysis[]>();
/** Deux vues (latérale gauche + frontale) d'une même variante, comme en clinique (corrélation multi-vues). */
function views(v: Variant, views: readonly GaitView[] = ['sagittal-left', 'frontal']): GaitAnalysis[] {
  const k = `${v}|${views.join(',')}`;
  if (!cache.has(k))
    cache.set(
      k,
      views.map((view) => {
        const { frames, truth } = generateGait(
          variantParams(v, {
            view,
            ...(view === 'frontal' || view === 'posterior' ? { noise: 0.0007, standingS: 2 } : {}),
          }),
        );
        return analyzeGait({ frames, view, patient: { heightCm: 175 }, options: { imageAspect: truth.imageAspect } });
      }),
    );
  return cache.get(k)!;
}

const MAIN = ['foot_drop_steppage', 'trendelenburg', 'stiff_knee', 'circumduction', 'asymmetric_stance'] as const;

function probable(v: Variant): string[] {
  return assessGait(views(v))
    .findings.filter((f) => f.status === 'probable')
    .map((f) => `${f.id}/${f.side}`);
}

describe('moteur de règles — variantes pathologiques synthétiques (côté atteint : gauche)', () => {
  it('marche normale : aucun défaut principal probable', () => {
    const p = probable('normal');
    for (const id of MAIN) expect(p.filter((x) => x.startsWith(id))).toEqual([]);
  });

  const cases: [Variant, string][] = [
    ['foot_drop', 'foot_drop_steppage/L'],
    ['trendelenburg', 'trendelenburg/L'],
    ['stiff_knee', 'stiff_knee/L'],
    ['circumduction', 'circumduction/L'],
    ['prosthetic_asymmetry', 'asymmetric_stance/L'],
  ];
  for (const [v, expected] of cases)
    it(`${v} → ${expected}, et aucun autre défaut principal probable`, () => {
      const p = probable(v);
      expect(p).toContain(expected);
      for (const id of MAIN) {
        if (expected.startsWith(id)) continue;
        expect(p.filter((x) => x.startsWith(id))).toEqual([]);
      }
    });

  it('chaque résultat : pourquoi, causes, suggestions orientées déterminants, références, validation clinique', () => {
    const f = assessGait(views('foot_drop')).findings.find((x) => x.id === 'foot_drop_steppage' && x.side === 'L')!;
    expect(f.score).toBeGreaterThan(0.5);
    expect(f.why.map((c) => c.id)).toContain('ankle_msw_plantarflexed');
    expect(f.why[0]!.value).not.toBeNull();
    expect(f.causes.length).toBeGreaterThan(0);
    expect(f.references).toContain('stewart2008');
    expect(f.requiresClinicianValidation).toBe(true);
    expect(f.determinants).toEqual(['foot_ankle_rockers', 'knee_ankle_interaction']);
    expect(f.suggestions[0]).toMatch(/^Déterminant 4/);
    expect(f.unvalidatedThresholds).toContainEqual({
      criterion: 'ankle_msw_plantarflexed',
      type: 'proposed_heuristic',
    });
  });

  it('pied tombant : bande « doute » (0 à −5°) et seuils configurables', () => {
    const an = views('foot_drop');
    const strict = assessGait(an, withConfig({ footDrop: { anomalyBelowDeg: -30, confidentBelowDeg: -40 } }));
    expect(strict.findings.find((x) => x.id === 'foot_drop_steppage' && x.side === 'L')!.status).toBe('absent');
    const doubt = assessGait(an, withConfig({ footDrop: { anomalyBelowDeg: 0, confidentBelowDeg: -30 } }));
    const f = doubt.findings.find((x) => x.id === 'foot_drop_steppage' && x.side === 'L')!;
    expect(f.status).toBe('possible');
    expect(f.why.find((c) => c.id === 'ankle_msw_plantarflexed')!.status).toBe('doubt');
  });

  it('nombre minimal de cycles configurable → données insuffisantes', () => {
    const a = assessGait(views('foot_drop'), withConfig({ minCyclesPerSide: 50 }));
    expect(a.findings.find((x) => x.id === 'foot_drop_steppage' && x.side === 'L')!.status).toBe('insufficient_data');
  });

  it('corrélation multi-vues : la circumduction (vue frontale) renforce un défaut de dégagement', () => {
    const sag = assessGait(views('circumduction', ['sagittal-left'])).findings;
    const both = assessGait(views('circumduction')).findings;
    expect(sag.find((f) => f.id === 'circumduction' && f.side === 'L')!.status).toBe('insufficient_data');
    expect(both.find((f) => f.id === 'circumduction' && f.side === 'L')!.status).toBe('probable');
  });
});

describe('déterminants de la marche (Saunders 1953) et articulations × phases', () => {
  it('six déterminants, statuts sans score global, explication', () => {
    const a = assessGait(views('normal'));
    expect(a.determinants.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const d of a.determinants) {
      expect(['affected', 'preserved', 'uncertain']).toContain(d.status);
      expect(d.explanation.length).toBeGreaterThan(10);
      expect(d).not.toHaveProperty('score');
    }
    expect(a.determinants.filter((d) => d.status === 'affected')).toEqual([]);
    // Rotation pelvienne : non mesurable de façon fiable en 2D.
    expect(a.determinants[0]!.indicators[0]!.status).toBe('uncertain');
    expect(DETERMINANTS).toHaveLength(6);
  });

  it('variantes : déterminants altérés attendus', () => {
    const st = (v: Variant, id: string) => assessGait(views(v)).determinants.find((d) => d.id === id)!.status;
    expect(st('trendelenburg', 'pelvic_list')).toBe('affected');
    expect(st('foot_drop', 'foot_ankle_rockers')).toBe('affected');
    expect(st('stiff_knee', 'knee_ankle_interaction')).toBe('affected');
    expect(st('circumduction', 'lateral_pelvic_displacement')).toBe('affected');
    expect(st('normal', 'stance_knee_flexion')).not.toBe('affected');
  });

  it('articulations × phases : statut et explication par côté', () => {
    const a = assessGait(views('stiff_knee'));
    const k = a.jointPhases.find((j) => j.joint === 'knee' && j.phase === 'ISw' && j.side === 'L')!;
    expect(k.indicator.status).toBe('affected');
    const r = a.jointPhases.find((j) => j.joint === 'knee' && j.phase === 'ISw' && j.side === 'R')!;
    expect(r.indicator.status).not.toBe('affected');
  });

  it('estimations frontales : facteur limitant seulement si liées à un défaut/déterminant altéré', () => {
    const a = assessGait(views('trendelenburg'));
    const fr = a.analyses.find((x) => x.view === 'frontal')!;
    const dropL = fr.metrics.find((m) => m.id === 'contralateral_pelvic_drop' && m.side === 'L')!;
    expect(dropL.estimate).toBe(true);
    expect(dropL.limitingFactor).toBe(true);
    const n = assessGait(views('normal')).analyses.find((x) => x.view === 'frontal')!;
    expect(n.metrics.find((m) => m.id === 'contralateral_pelvic_drop' && m.side === 'L')!.limitingFactor).toBe(false);
  });
});

describe('comparaison A/B', () => {
  it('avant/après : deltas au-delà de l’erreur de mesure', () => {
    const c = compareAssessments(views('stiff_knee'), views('normal'));
    const knee = c.metrics.find((m) => m.id === 'peak_knee_flexion_swing' && m.side === 'L')!;
    expect(knee.delta).toBeGreaterThan(15);
    expect(knee.margin).toBeGreaterThanOrEqual(5.6);
    expect(knee.significant).toBe(true);
    expect(knee.towardNorm).toBe(true);
    const kneeR = c.metrics.find((m) => m.id === 'peak_knee_flexion_swing' && m.side === 'R')!;
    expect(kneeR.significant).toBe(false);
    expect(c.findings).toContainEqual({ id: 'stiff_knee', side: 'L', a: 'probable', b: 'absent' });
    expect(c.determinants.find((d) => d.id === 'knee_ankle_interaction')!.changed).toBe(true);
  });

  it('erreurs de mesure sourcées', () => {
    const m = views('normal')[0]!.metrics;
    expect(measurementError(m.find((x) => x.id === 'gait_speed')!)!.value).toBe(0.1);
    expect(measurementError(m.find((x) => x.id === 'ankle_ic')!)!.value).toBe(7.4);
  });
});

describe('prothèses', () => {
  it('asymétrie prothétique transtibiale → asymétrie de pas/appui ; toutes les déviations présentes ; audience clinicien', () => {
    const p = assessProstheticGait(views('prosthetic_asymmetry'), { level: 'transtibial', side: 'L' });
    const by = (id: string) => p.deviations.find((d) => d.id === id)!;
    expect(by('uneven_step_length_timing').status).toBe('probable');
    for (const id of ['lateral_trunk_bending', 'prosthetic_hip_hiking', 'prosthetic_vaulting', 'knee_instability'])
      expect(
        `${id}:${by(id).status}:${by(id)
          .why.map((c) => `${c.id}=${c.value}`)
          .join()}`,
      ).not.toMatch(/probable/);
    expect(by('pistoning').status).toBe('observe');
    expect(by('pistoning').estimate).toBe(true);
    for (const d of p.deviations) {
      expect(d.audience).toBe('clinician');
      expect(d.requiresClinicianValidation).toBe(true);
    }
    expect(p.audience).toBe('clinician');
  });

  it('transfémoral : fouets médial/latéral rendus « à observer » plutôt qu’omis', () => {
    const p = assessProstheticGait(views('normal'), { level: 'transfemoral', side: 'R' });
    expect(p.deviations.find((d) => d.id === 'medial_whip')!.status).toBe('observe');
    expect(p.deviations.find((d) => d.id === 'lateral_whip')!.status).toBe('observe');
    expect(p.deviations.filter((d) => d.status === 'probable')).toEqual([]);
  });

  it('désarticulation du genou : catalogue transfémoral extrapolé (to_verify)', () => {
    const p = assessProstheticGait(views('normal'), { level: 'knee_disarticulation', side: 'L' });
    expect(p.catalogLevel).toBe('transfemoral');
    expect(p.deviations[0]!.suggestions[0]).toMatch(/to_verify/);
  });
});
