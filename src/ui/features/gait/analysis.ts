/**
 * Volet « marche » — analyse des enregistrements de pose d'une capture : `analyzeGait` par vue, `assessGait`,
 * `assessProstheticGait` (mode prothèse) et mesures personnalisées actives (`measureCustomAngle`). Fonction pure
 * (testée avec les squelettes synthétiques du moteur) ; la lecture des mesures actives dans la base est faite par l'appelant.
 */
import {
  analyzeGait,
  assessGait,
  measureCustomAngle,
  metricSource,
  prepareRecording,
  DEFAULT_GAIT_CONFIG,
  withConfig,
  type GaitAnalysis,
  type GaitConfig,
  type GaitAssessment,
  type GaitPoseFrame,
  type GaitView,
  type Side,
} from '../../../domains/gait/index.ts';
import { toCustomAngleDefinition } from '../../../domains/research/measures.ts';
import { assessProstheticGait, type ProstheticAssessment } from '../../../domains/prosthetics/index.ts';
import type { MeasureDefinition, Patient } from '../../../core/types/clinical.ts';
import type { MeasuredValue } from '../../../core/types/common.ts';
import { averageFps, rebase } from './live.ts';
import { patientInput, type CaptureSettings, isSagittalView, nearSide } from './model.ts';

export interface ViewRecording {
  readonly view: GaitView;
  /** Trames de pose (t en ms depuis le début de l'enregistrement ; rebasées ici si besoin). */
  readonly frames: readonly GaitPoseFrame[];
  /** Rapport largeur/hauteur de l'image (pixels). */
  readonly aspect: number;
}

export interface AnalysisOutput {
  readonly analyses: readonly GaitAnalysis[];
  readonly assessment: GaitAssessment;
  readonly prosthetic?: ProstheticAssessment;
  readonly customMeasures: Record<string, MeasuredValue>;
  readonly fps: Partial<Record<GaitView, number>>;
  readonly durationsS: Partial<Record<GaitView, number>>;
}

const sidesOf = (s: MeasureDefinition['side']): Side[] => (s === 'left' ? ['L'] : s === 'right' ? ['R'] : ['L', 'R']);

/**
 * Mesures personnalisées des études et suivis actifs : angle de 3 repères à une phase de Perry (`custom_angle`) ou
 * valeur d'une métrique du moteur (`gait_metric_at_phase`). Les autres types (amplitude, questionnaires, courbes) ne
 * sont pas calculés à la capture de marche. Sans côté précisé, les deux côtés sont mesurés (`id:L`, `id:R`).
 */
export function computeCustomMeasures(
  recs: readonly ViewRecording[],
  settings: CaptureSettings,
  patient: Patient | null,
  nowYear: number,
  measures: readonly MeasureDefinition[],
  assessment: GaitAssessment,
): Record<string, MeasuredValue> {
  const out: Record<string, MeasuredValue> = {};
  if (!measures.length) return out;
  const pin = patientInput(settings, patient, nowYear);
  const src = metricSource(assessment.analyses, DEFAULT_GAIT_CONFIG);
  for (const m of measures) {
    const sides = sidesOf(m.side);
    const key = (s: Side): string => (m.side === 'left' || m.side === 'right' ? m.id : `${m.id}:${s}`);
    if (m.kind === 'custom_angle') {
      // Définition normalisée par le module recherche (3 repères, côté, phase ou %) ; incomplète : non calculée.
      const def = toCustomAngleDefinition(m);
      if (!def) continue;
      for (const s of sides) {
        const rec =
          recs.find((r) => isSagittalView(r.view) && nearSide(r.view) === s) ??
          recs.find((r) => isSagittalView(r.view));
        if (!rec) continue;
        try {
          const prep = prepareRecording({
            frames: rebase(rec.frames),
            view: rec.view,
            patient: pin,
            options: { imageAspect: rec.aspect },
          });
          const r = measureCustomAngle(prep, { ...def, side: s });
          if (r.value !== null && Number.isFinite(r.value))
            out[key(s)] = {
              value: Math.round(r.value * 100) / 100,
              unit: '°',
              confidence: Math.round(r.confidence * 100) / 100,
            };
        } catch {
          /* mesure non calculable sur cet enregistrement */
        }
      }
    } else if (m.kind === 'gait_metric_at_phase' && m.metricId) {
      for (const s of sides) {
        const g = src.get(m.metricId, s) ?? src.get(m.metricId);
        if (g && g.value !== null && Number.isFinite(g.value))
          out[key(s)] = {
            value: Math.round(g.value * 10000) / 10000,
            unit: g.unit,
            confidence: Math.round(g.confidence * 100) / 100,
          };
      }
    }
  }
  return out;
}

/** Paramètres du moteur pour une capture : cycles valides exigés par côté = cycles visés (jamais moins que 3). */
export function engineConfig(settings: Pick<CaptureSettings, 'targetCycles'>): GaitConfig {
  return withConfig({
    minCyclesPerSide: Math.max(DEFAULT_GAIT_CONFIG.minCyclesPerSide, Math.round(settings.targetCycles)),
  });
}

/** Analyse complète d'une capture : une analyse par vue, puis la synthèse clinique. */
export function analyzeCapture(
  recs: readonly ViewRecording[],
  settings: CaptureSettings,
  patient: Patient | null,
  nowYear: number,
  measures: readonly MeasureDefinition[] = [],
): AnalysisOutput {
  const pin = patientInput(settings, patient, nowYear);
  const analyses = recs.map((r) =>
    analyzeGait({ frames: rebase(r.frames), view: r.view, patient: pin, options: { imageAspect: r.aspect } }),
  );
  // Spec §10.6 : nombre minimal de cycles valides par côté réglé par le clinicien (≥ 3), appliqué aux règles.
  const config = engineConfig(settings);
  const assessment = assessGait(analyses, config);
  const prosthetic = settings.prosthesis
    ? assessProstheticGait(assessment.analyses, settings.prosthesis, config)
    : undefined;
  const fps: Partial<Record<GaitView, number>> = {};
  const durationsS: Partial<Record<GaitView, number>> = {};
  for (const r of recs) {
    fps[r.view] = Math.round(averageFps(r.frames) * 10) / 10;
    const last = r.frames[r.frames.length - 1];
    const first = r.frames[0];
    durationsS[r.view] = last && first ? Math.round(((last.t - first.t) / 1000) * 10) / 10 : 0;
  }
  return {
    analyses,
    assessment,
    ...(prosthetic ? { prosthetic } : {}),
    customMeasures: computeCustomMeasures(recs, settings, patient, nowYear, measures, assessment),
    fps,
    durationsS,
  };
}
