/**
 * Prétraitement : passage des trames MediaPipe à des séries temporelles par repère, masquage des repères peu visibles,
 * interpolation des trous courts, filtrage passe-bas et contrôle de qualité.
 *
 * Unités : X = x × (largeur/hauteur de l'image), Y = y ; les deux axes sont donc exprimés en « hauteurs d'image »,
 * ce qui rend les distances isotropes. Y est orienté vers le bas (convention image).
 */
import { LANDMARK_COUNT, LM, REQUIRED_LANDMARKS } from './landmarks.ts';
import { interpolateGaps, lowPass, median } from './signal.ts';
import type { GaitAnalysisOptions, GaitPoseFrame, QualityReport } from './types.ts';

export interface Track {
  /** Temps en secondes. */
  readonly t: readonly number[];
  readonly fps: number;
  /** X[landmark][frame], Y[landmark][frame] filtrés (NaN si non reconstructible). */
  readonly X: readonly (readonly number[])[];
  readonly Y: readonly (readonly number[])[];
  /**
   * Positions X filtrées plus légèrement (coupure 12 Hz, bornée à 0,4 × fréquence d'images) pour la détection des
   * événements : un filtre à 6 Hz arrondit l'arrêt brusque du talon au contact et décale l'extremum (≈ 25–30 ms).
   */
  readonly Xe: readonly (readonly number[])[];
  /** Repère reconstruit par interpolation à cette trame. */
  readonly filled: readonly (readonly boolean[])[];
  /** Visibilité brute (0–1). */
  readonly vis: readonly (readonly number[])[];
  /** Trame utilisable : tous les repères requis disponibles (mesurés ou interpolés). */
  readonly usable: readonly boolean[];
}

/** Coupure du filtre des signaux d'événements (choix de conception). */
export const EVENT_CUTOFF_HZ = 12;

export const DEFAULTS = {
  cutoffHz: 6,
  visibilityThreshold: 0.5,
  maxGapS: 0.2,
  standingS: 1,
  imageAspect: 9 / 16,
} as const;

/** Construit les séries filtrées. */
export function buildTrack(frames: readonly GaitPoseFrame[], options: GaitAnalysisOptions = {}): Track {
  const aspect = options.imageAspect ?? DEFAULTS.imageAspect;
  const visTh = options.visibilityThreshold ?? DEFAULTS.visibilityThreshold;
  const t = frames.map((f) => f.t / 1000);
  const dts: number[] = [];
  for (let i = 1; i < t.length; i++) dts.push(t[i]! - t[i - 1]!);
  const dt = median(dts);
  const fps = Number.isFinite(dt) && dt > 0 ? 1 / dt : 30;
  const maxGap = Math.max(1, Math.round((options.maxGapS ?? DEFAULTS.maxGapS) * fps));
  const cutoff = options.cutoffHz ?? DEFAULTS.cutoffHz;

  const X: number[][] = [];
  const Xe: number[][] = [];
  const Y: number[][] = [];
  const filled: boolean[][] = [];
  const vis: number[][] = [];
  for (let k = 0; k < LANDMARK_COUNT; k++) {
    const rawX: number[] = [];
    const rawY: number[] = [];
    const v: number[] = [];
    for (const f of frames) {
      const l = f.landmarks[k];
      const vk = l ? (l.visibility ?? 1) : 0;
      v.push(vk);
      const ok = l && vk >= visTh && Number.isFinite(l.x) && Number.isFinite(l.y);
      rawX.push(ok ? l.x * aspect : NaN);
      rawY.push(ok ? l.y : NaN);
    }
    const ix = interpolateGaps(rawX, maxGap);
    const iy = interpolateGaps(rawY, maxGap);
    X.push(lowPass(ix.values, cutoff, fps));
    Xe.push(lowPass(ix.values, Math.min(EVENT_CUTOFF_HZ, fps * 0.4), fps));
    Y.push(lowPass(iy.values, cutoff, fps));
    filled.push(ix.filled.map((b, i) => b || iy.filled[i]!));
    vis.push(v);
  }
  const usable = frames.map((_, i) => REQUIRED_LANDMARKS.every((k) => Number.isFinite(X[k]![i]!)));
  return { t, fps, X, Y, Xe, filled, vis, usable };
}

/** Contrôle de qualité (visibilité des pieds, % de trames utilisables, fréquence d'images). */
export function qualityReport(track: Track): QualityReport {
  const n = track.t.length;
  const footVis = (ids: number[]): number => {
    let s = 0;
    for (const k of ids) for (const v of track.vis[k]!) s += v;
    return n ? s / (n * ids.length) : 0;
  };
  const L = footVis([LM.leftHeel, LM.leftFootIndex, LM.leftAnkle]);
  const R = footVis([LM.rightHeel, LM.rightFootIndex, LM.rightAnkle]);
  const usableFraction = n ? track.usable.filter(Boolean).length / n : 0;
  let filledCount = 0;
  for (const k of REQUIRED_LANDMARKS) for (const b of track.filled[k]!) if (b) filledCount++;
  const interpolatedFraction = n ? filledCount / (n * REQUIRED_LANDMARKS.length) : 0;
  const warnings: string[] = [];
  if (track.fps < 25)
    warnings.push(
      `Fréquence d'images basse (${track.fps.toFixed(0)} i/s) : ≥ 30 i/s recommandé, idéalement 60 (hii2023).`,
    );
  if (Math.min(L, R) < 0.6) warnings.push('Pieds peu visibles : chaussures contrastées, cadrage des pieds, lumière.');
  if (usableFraction < 0.7) warnings.push(`Seulement ${(usableFraction * 100).toFixed(0)} % de trames utilisables.`);
  if (interpolatedFraction > 0.15) warnings.push('Plus de 15 % des repères reconstruits par interpolation.');
  const durationS = n > 1 ? track.t[n - 1]! - track.t[0]! : 0;
  if (durationS < 3) warnings.push('Enregistrement court (< 3 s) : au moins 3 cycles par côté sont recommandés.');
  return {
    frameCount: n,
    fps: track.fps,
    usableFraction,
    footVisibility: { L, R },
    interpolatedFraction,
    ok: usableFraction >= 0.7 && Math.min(L, R) >= 0.5 && n >= 30,
    warnings,
  };
}

/** Point (X, Y) d'un repère à une trame. */
export function pt(track: Track, k: number, i: number): { x: number; y: number } {
  return { x: track.X[k]![i]!, y: track.Y[k]![i]! };
}

/** Milieu de deux repères. */
export function mid(track: Track, a: number, b: number, i: number): { x: number; y: number } {
  return { x: (track.X[a]![i]! + track.X[b]![i]!) / 2, y: (track.Y[a]![i]! + track.Y[b]![i]!) / 2 };
}
