import { describe, expect, it } from 'vitest';
import { analyzeGait, measureCustomAngle, prepareRecording } from './analyze.ts';
import { LM } from './landmarks.ts';
import { lowPass, mean, resample } from './signal.ts';
import { generateGait, variantParams, type SyntheticTruth } from './testing/synthetic.ts';
import type { GaitAnalysis, GaitView, Side } from './types.ts';

function run(view: GaitView, extra: Parameters<typeof variantParams>[1] = {}, scaleObject = false, cutoffHz = 6) {
  const { frames, truth } = generateGait(variantParams('normal', { view, ...extra }));
  const options = {
    imageAspect: truth.imageAspect,
    cutoffHz,
    ...(scaleObject
      ? {
          // Ruban de 1 m posé au sol dans le plan de marche : longueur image = f / D (unités de hauteur).
          scaleObject: { lengthM: 1, a: { x: 0.4, y: 0.9 }, b: { x: 0.4 + 1 / truth.metersPerUnit / truth.imageAspect, y: 0.9 } },
        }
      : {}),
  };
  const analysis = analyzeGait({ frames, view, patient: { heightCm: truth.params.heightM * 100 }, options });
  return { analysis, truth, frames };
}

/** Événements vrais en régime établi (hors démarrage et fin). */
function steadyTruth(truth: SyntheticTruth) {
  const T = 120 / truth.params.cadence;
  const end = truth.events.reduce((m, e) => Math.max(m, e.t), 0);
  return truth.events.filter((e) => e.t > truth.walkStartS + 0.5 * T && e.t < end - 0.2 * T);
}

function eventErrors(a: GaitAnalysis, truth: SyntheticTruth): number[] {
  return steadyTruth(truth).map((e) => {
    const cands = a.events.filter((d) => d.side === e.side && d.type === e.type).map((d) => Math.abs(d.frame - e.frame));
    return cands.length ? Math.min(...cands) : Infinity;
  });
}

const metric = (a: GaitAnalysis, id: string, side?: Side) => a.metrics.find((m) => m.id === id && m.side === side);

describe('pipeline sagittal — squelette synthétique', () => {
  for (const fps of [30, 60]) {
    it(`événements (Zeni) : ±1 trame à 30 i/s, ≥ 90 % à ±1 et tous à ±2 trames à 60 i/s (${fps} i/s)`, () => {
      const { analysis, truth } = run('sagittal-left', { fps });
      const errs = eventErrors(analysis, truth);
      expect(errs.length).toBeGreaterThanOrEqual(16);
      if (fps === 30) expect(Math.max(...errs)).toBeLessThanOrEqual(1);
      else {
        // 60 i/s : une trame = 17 ms ; le bruit de pose décale parfois l'extremum de 2 trames (33 ms).
        expect(errs.filter((e) => e <= 1).length / errs.length).toBeGreaterThanOrEqual(0.9);
        expect(Math.max(...errs)).toBeLessThanOrEqual(2);
      }
    });
  }

  it('vue latérale droite (marche dans l’autre sens de l’image) : événements à ±1 trame', () => {
    const { analysis, truth } = run('sagittal-right');
    expect(analysis.walkingDirection).toBe(-1);
    expect(Math.max(...eventErrors(analysis, truth))).toBeLessThanOrEqual(1);
  });

  it('longueur de pas à ±5 % (échelle par la taille)', () => {
    const { analysis, truth } = run('sagittal-left');
    const ref = mean(truth.stepLengths.map((s) => s.value));
    for (const side of ['L', 'R'] as const) {
      const m = metric(analysis, 'step_length', side)!;
      expect(Math.abs(m.value! - ref) / ref).toBeLessThan(0.05);
    }
    const st = metric(analysis, 'stride_length', 'L')!;
    const S = truth.params.stepLength.L + truth.params.stepLength.R;
    expect(Math.abs(st.value! - S) / S).toBeLessThan(0.05);
  });

  it('longueur de pas à ±5 % (objet d’échelle connu) et cadence/vitesse', () => {
    const { analysis, truth } = run('sagittal-left', {}, true);
    expect(analysis.scale.method).toBe('scale_object');
    const ref = mean(truth.stepLengths.map((s) => s.value));
    expect(Math.abs(metric(analysis, 'step_length', 'L')!.value! - ref) / ref).toBeLessThan(0.05);
    expect(metric(analysis, 'cadence')!.value!).toBeCloseTo(truth.params.cadence, -0.5);
    const v = (truth.params.stepLength.L + truth.params.stepLength.R) / (120 / truth.params.cadence);
    expect(Math.abs(metric(analysis, 'gait_speed')!.value! - v) / v).toBeLessThan(0.05);
  });

  const CUT = 10;
  // Référence : angles vrais filtrés par le même passe-bas (10 Hz à 60 i/s), qui fait partie de la définition de la mesure ; le
  // squelette synthétique contient des transitoires brusques (contact, décollement) qu'aucune caméra ne résout.
  it('angles hanche/genou/cheville à ±2° (courbes moyennes sur le cycle normalisé)', () => {
    // Membres dans un plan parasagittal (largeur de base = écart des hanches) : on isole le pipeline de l'erreur de
    // perspective due aux écarts de profondeur entre repères (limite 2D documentée dans le README).
    const { analysis, truth } = run('sagittal-left', { baseWidth: 0.191 * 1.75 * 0.85, fps: 60 }, false, CUT);
    const fps = truth.params.fps;
    const times = truth.angles.L.hip.map((_, i) => i / fps);
    const steady = steadyTruth(truth).filter((e) => e.type === 'IC' && e.side === 'L');
    for (const joint of ['hip', 'knee', 'ankle'] as const) {
      // Convention clinique : 0 = station debout (moyenne vraie de la 1re seconde).
      const raw = truth.angles.L[joint];
      const off = mean(raw.slice(0, fps));
      const ref = lowPass(
        raw.map((v) => v - off),
        CUT,
        fps,
      );
      const curves: number[][] = [];
      for (let k = 0; k + 1 < steady.length; k++)
        curves.push(resample(times, ref, steady[k]!.t, steady[k + 1]!.t));
      const truthMean = Array.from({ length: 101 }, (_, i) => mean(curves.map((c) => c[i]!)));
      const est = analysis.curves.find((c) => c.id === `${joint}_angle` && c.side === 'L')!;
      const err = est.mean.map((v, i) => Math.abs(v - truthMean[i]!));
      // Erreur moyenne sur le cycle < 2°, et valeurs cliniques clés (contact initial, pics de flexion et
      // d'extension) à ±2°.
      expect(mean(err)).toBeLessThan(2);
      expect(err[0]!).toBeLessThan(2);
      expect(Math.abs(Math.max(...est.mean) - Math.max(...truthMean))).toBeLessThan(2);
      expect(Math.abs(Math.min(...est.mean) - Math.min(...truthMean))).toBeLessThan(2);
    }
  });

  it('contrôle de qualité et incertitude d’échelle', () => {
    const { analysis } = run('sagittal-left');
    expect(analysis.quality.ok).toBe(true);
    expect(analysis.quality.usableFraction).toBeGreaterThan(0.9);
    expect(analysis.scale.relativeUncertainty).toBeGreaterThan(0);
    expect(analysis.scale.relativeUncertainty).toBeLessThan(0.1);
    expect(analysis.cycles.filter((c) => !c.rejected && c.side === 'L').length).toBeGreaterThanOrEqual(3);
  });

  it('taille obligatoire', () => {
    const { frames } = generateGait();
    expect(() => analyzeGait({ frames, view: 'sagittal-left', patient: { heightCm: 0 } })).toThrow(RangeError);
  });

  it('trous de visibilité interpolés, phases de Perry ordonnées', () => {
    const { analysis } = run('sagittal-left', { dropoutRate: 0.1 });
    const c = analysis.cycles.find((x) => !x.rejected)!;
    expect(c.phases.map((p) => p.id)).toEqual(['IC', 'LR', 'MSt', 'TSt', 'PSw', 'ISw', 'MSw', 'TSw']);
    for (let k = 1; k < c.phases.length; k++) expect(c.phases[k]!.startPct).toBeCloseTo(c.phases[k - 1]!.endPct, 6);
    expect(c.stancePct!).toBeGreaterThan(55);
    expect(c.stancePct!).toBeLessThan(70);
  });

  it('mesure personnalisée : angle de 3 repères à une phase (genou en oscillation moyenne)', () => {
    const { frames, truth } = generateGait();
    const p = prepareRecording({
      frames,
      view: 'sagittal-left',
      patient: { heightCm: 175 },
      options: { imageAspect: truth.imageAspect },
    });
    const r = measureCustomAngle(p, {
      id: 'knee_inner',
      a: LM.leftHip,
      b: LM.leftKnee,
      c: LM.leftAnkle,
      side: 'L',
      at: 'MSw',
      reference: 'fromStanding',
    });
    expect(r.n).toBeGreaterThanOrEqual(3);
    expect(r.curve).toHaveLength(101);
    // Angle intérieur du genou en flexion : diminue par rapport à la station debout.
    expect(r.value!).toBeLessThan(-10);
    expect(r.estimate).toBe(true);
  });
});

describe('pipeline frontal/postérieur — estimations', () => {
  for (const view of ['frontal', 'posterior'] as const) {
    it(`${view} : ≥ 75 % des événements à ±2 trames, confiance plus basse`, () => {
      const { analysis, truth } = run(view, { noise: 0.0007, standingS: 2 });
      const errs = eventErrors(analysis, truth);
      expect(errs.filter((e) => e <= 2).length / errs.length).toBeGreaterThanOrEqual(0.75);
      const sag = run('sagittal-left').analysis;
      expect(metric(analysis, 'stance_pct', 'L')!.confidence).toBeLessThan(metric(sag, 'stance_pct', 'L')!.confidence);
      const drop = metric(analysis, 'contralateral_pelvic_drop', 'L')!;
      expect(drop.estimate).toBe(true);
      expect(Math.abs(drop.value! - truth.params.pelvicDrop.L)).toBeLessThan(2);
      expect(Math.abs(metric(analysis, 'step_width_mean')!.value! - truth.params.baseWidth)).toBeLessThan(0.03);
    });
  }

  it('rotation pelvienne transverse : non mesurable sans repères « monde »', () => {
    const { analysis } = run('frontal', { noise: 0.0007 });
    const m = metric(analysis, 'pelvic_rotation')!;
    expect(m.value).toBeNull();
    expect(m.estimate).toBe(true);
  });
});
