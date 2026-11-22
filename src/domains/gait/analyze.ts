/**
 * Pipeline d'analyse d'un enregistrement (une vue) : prétraitement → qualité → calibration → événements → cycles →
 * angles (offset de station debout) → métriques et courbes. Fonction pure : aucune interface, caméra ni DOM.
 */
import { estimateScale } from './calibration.ts';
import { normalizeCycle, segmentCycles } from './cycles.ts';
import { detectEvents, isSagittal } from './events.ts';
import { applyOffsets, leftSign, offsetsFrom, rawFrontal, rawSagittal, type FrontalAngles, type SagittalAngles } from './kinematics.ts';
import { LM } from './landmarks.ts';
import { frontalMetrics, meanCurve, sagittalCurves, sagittalMetrics, spatiotemporal, type MetricContext } from './metrics.ts';
import { buildTrack, DEFAULTS, qualityReport, type Track } from './preprocess.ts';
import { angle3, mean, sd } from './signal.ts';
import type { GaitAnalysis, GaitCycle, GaitMetric, GaitRecordingInput, PerryPhaseId, Side } from './types.ts';

export interface PreparedRecording {
  readonly input: GaitRecordingInput;
  readonly track: Track;
  readonly ctx: MetricContext;
  readonly standing: readonly number[];
}

function standingFrames(track: Track, standingS: number): number[] {
  const t0 = track.t[0] ?? 0;
  const out: number[] = [];
  for (let i = 0; i < track.t.length; i++) if (track.t[i]! - t0 <= standingS && track.usable[i]) out.push(i);
  return out;
}

export function prepareRecording(input: GaitRecordingInput): PreparedRecording {
  if (!(input.patient.heightCm > 50 && input.patient.heightCm < 260))
    throw new RangeError('Taille du patient (cm) obligatoire et plausible (50–260 cm).');
  const opts = input.options ?? {};
  const track = buildTrack(input.frames, opts);
  const standingS = opts.standingS ?? DEFAULTS.standingS;
  const standing = standingFrames(track, standingS);
  const scale = estimateScale(track, input.view, input.patient.heightCm, {
    standingS,
    imageAspect: opts.imageAspect ?? DEFAULTS.imageAspect,
    scaleObject: opts.scaleObject,
  });
  const ev = detectEvents(track, input.view);
  const cycles = segmentCycles(track, ev.events);
  let sagittal: { L: SagittalAngles; R: SagittalAngles } | undefined;
  let frontal: FrontalAngles | undefined;
  let frontalOffsets: MetricContext['frontalOffsets'];
  if (isSagittal(input.view)) {
    const d = ev.direction || 1;
    const mk = (s: Side): SagittalAngles => {
      const raw = rawSagittal(track, s, d);
      return applyOffsets(raw, offsetsFrom(raw, standing));
    };
    sagittal = { L: mk('L'), R: mk('R') };
  } else {
    const u = leftSign(track, standing.length ? standing : track.t.map((_, i) => i));
    frontal = rawFrontal(track, u);
    const m = (x: number[]): number => {
      const v = mean(standing.map((i) => x[i]!));
      return Number.isFinite(v) ? v : 0;
    };
    frontalOffsets = {
      obliquity: m(frontal.obliquityRLow),
      trunk: m(frontal.trunkLeanLeft),
      fppa: { L: m(frontal.fppa.L), R: m(frontal.fppa.R) },
      heel: { L: m(frontal.heel.L), R: m(frontal.heel.R) },
    };
  }
  const ctx: MetricContext = {
    track,
    view: input.view,
    patient: input.patient,
    scale,
    direction: ev.direction,
    events: ev.events,
    cycles,
    ...(sagittal ? { sagittal } : {}),
    ...(frontal ? { frontal } : {}),
    ...(frontalOffsets ? { frontalOffsets } : {}),
  };
  return { input, track, ctx, standing };
}

/** Rotation pelvienne transverse à partir des repères « monde » (z MediaPipe) : estimation, faible confiance. */
function pelvicRotation(p: PreparedRecording): GaitMetric {
  const frames = p.input.frames;
  const has = frames.some((f) => f.worldLandmarks && f.worldLandmarks.length > LM.rightHip);
  const base = { id: 'pelvic_rotation', unit: '°', view: p.input.view, estimate: true } as const;
  if (!has)
    return {
      ...base,
      value: null,
      confidence: 0,
      warning: 'Rotation pelvienne transverse non mesurable de façon fiable en 2D (repères « monde » absents).',
    };
  const rot = frames.map((f) => {
    const l = f.worldLandmarks?.[LM.leftHip];
    const r = f.worldLandmarks?.[LM.rightHip];
    return l && r ? (Math.atan2(l.z - r.z, Math.abs(l.x - r.x)) * 180) / Math.PI : NaN;
  });
  const vals = p.ctx.cycles
    .filter((c) => !c.rejected && c.side === 'L')
    .map((c) => {
      const s = rot.slice(c.startFrame, c.endFrame + 1).filter((v) => Number.isFinite(v));
      return s.length ? (Math.max(...s) - Math.min(...s)) / 2 : NaN;
    })
    .filter((v) => Number.isFinite(v));
  return {
    ...base,
    value: vals.length ? mean(vals) : null,
    ...(vals.length > 1 ? { sd: sd(vals) } : {}),
    n: vals.length,
    confidence: 0.15,
    warning: 'Profondeur (z) MediaPipe peu fiable : amplitude de rotation pelvienne ± (demi crête à crête), estimation.',
  };
}

/** Analyse complète d'un enregistrement d'une vue. */
export function analyzeGait(input: GaitRecordingInput): GaitAnalysis {
  const p = prepareRecording(input);
  const { ctx, track } = p;
  const quality = qualityReport(track);
  const metrics: GaitMetric[] = [...spatiotemporal(ctx), ...sagittalMetrics(ctx), ...frontalMetrics(ctx), pelvicRotation(p)];
  const curves = sagittalCurves(ctx);
  const warnings = [...quality.warnings, ...ctx.scale.notes];
  for (const s of ['L', 'R'] as const) {
    const n = ctx.cycles.filter((c) => c.side === s && !c.rejected).length;
    if (n < 3) warnings.push(`Côté ${s} : ${n} cycle(s) valide(s) ; ≥ 3 recommandés (findings.json > thresholdPolicy).`);
  }
  if (!isSagittal(input.view))
    warnings.push('Vue frontale/postérieure : événements et mesures = estimations (aucune validation 2D publiée).');
  return {
    view: input.view,
    patient: input.patient,
    quality,
    scale: ctx.scale,
    walkingDirection: ctx.direction,
    events: ctx.events,
    cycles: ctx.cycles,
    metrics,
    curves,
    warnings,
  };
}

/** Définition d'une mesure personnalisée (module recherche, spec §7) : angle formé par 3 repères à une phase. */
export interface CustomAngleDefinition {
  readonly id: string;
  /** Indices MediaPipe des 3 repères ; l'angle est mesuré au sommet `b`. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly side: Side;
  /** Phase de Perry (moyenne sur la phase) ou pourcentage exact du cycle (0–100). */
  readonly at: PerryPhaseId | number;
  /** `raw` = angle géométrique ; `fromStanding` = écart par rapport à la station debout. */
  readonly reference?: 'raw' | 'fromStanding';
}

export interface CustomAngleResult {
  readonly id: string;
  readonly side: Side;
  readonly value: number | null;
  readonly sd: number | null;
  readonly n: number;
  readonly perCycle: readonly number[];
  readonly curve: readonly number[];
  readonly confidence: number;
  readonly estimate: true;
}

export function measureCustomAngle(p: PreparedRecording, def: CustomAngleDefinition): CustomAngleResult {
  const { track } = p;
  const series = track.t.map((_, i) =>
    angle3(
      { x: track.X[def.a]![i]!, y: track.Y[def.a]![i]! },
      { x: track.X[def.b]![i]!, y: track.Y[def.b]![i]! },
      { x: track.X[def.c]![i]!, y: track.Y[def.c]![i]! },
    ),
  );
  const off = def.reference === 'fromStanding' ? mean(p.standing.map((i) => series[i]!)) : 0;
  const s = series.map((v) => v - (Number.isFinite(off) ? off : 0));
  const cyc: GaitCycle[] = p.ctx.cycles.filter((c) => !c.rejected && c.side === def.side);
  const curves = cyc.map((c) => normalizeCycle(track, s, c));
  const perCycle = curves.map((cv, k) => {
    if (typeof def.at === 'number') return cv[Math.round(Math.max(0, Math.min(100, def.at)))]!;
    const w = cyc[k]!.phases.find((ph) => ph.id === def.at)!;
    return mean(cv.slice(Math.round(w.startPct), Math.round(w.endPct) + 1));
  });
  const vis = [def.a, def.b, def.c].reduce((acc, k) => acc + mean([...track.vis[k]!]), 0) / 3;
  return {
    id: def.id,
    side: def.side,
    value: perCycle.length ? mean(perCycle) : null,
    sd: perCycle.length > 1 ? sd(perCycle) : null,
    n: perCycle.length,
    perCycle,
    curve: curves.length ? meanCurve(def.id, def.side, '°', curves).mean : [],
    confidence: Math.max(0, Math.min(1, vis * Math.min(1, perCycle.length / 3) * 0.8)),
    estimate: true,
  };
}
