/**
 * Calibration de l'échelle par la taille du patient (spec v2 §4.2).
 *
 * 1. Station debout (début d'enregistrement) : hauteur sol (talons) → milieu des épaules en unités image, comparée à
 *    la hauteur des épaules prédite par la taille : 0,818 × H.
 * 2. Mise à jour continue par la longueur des segments : la longueur apparente des segments (cuisse + jambe en vue
 *    latérale, tronc en vue frontale/postérieure) est mesurée à chaque trame et rapportée à sa longueur en station
 *    debout, ce qui compense la profondeur (le patient qui s'approche de la caméra paraît plus grand).
 * 3. Objet d'échelle (facultatif) : remplace l'estimation initiale, l'écart entre les méthodes alimente l'incertitude.
 *
 * Proportions anthropométriques (fraction de la taille H) : Winter DA, *Biomechanics and Motor Control of Human
 * Movement*, 4e éd., Wiley, 2009, fig. 4.1 (d'après Drillis & Contini 1966) — réf. `winter2009`. Les valeurs ci-dessous
 * sont reprises de cette figure, largement reproduite ; la page exacte n'a pas été relue (statut `to_verify`).
 */
import { idx, LM } from './landmarks.ts';
import { mid, pt, type Track } from './preprocess.ts';
import { mean, median, sd } from './signal.ts';
import type { GaitView, ScaleEstimate, ScaleObject } from './types.ts';

export const WINTER_PROPORTIONS = Object.freeze({
  ref: 'winter2009',
  status: 'to_verify' as const,
  /** Hauteurs au-dessus du sol (fraction de H). */
  shoulderHeight: 0.818,
  hipHeight: 0.53,
  kneeHeight: 0.285,
  ankleHeight: 0.039,
  /** Longueurs de segments (fraction de H). */
  thigh: 0.245,
  shank: 0.246,
  footLength: 0.152,
  hipWidth: 0.191,
  shoulderWidth: 0.259,
  /** Tronc grand trochanter → acromion : 0,818 − 0,530. */
  trunk: 0.288,
});

/**
 * Variabilité interindividuelle supposée des proportions (relative). Proposition de conception (non publiée) :
 * à remplacer si une valeur sourcée est retenue.
 */
export const PROPORTION_UNCERTAINTY = { value: 0.03, thresholdType: 'proposed_heuristic' as const };

function standingFrames(track: Track, standingS: number): number[] {
  const t0 = track.t[0] ?? 0;
  const out: number[] = [];
  for (let i = 0; i < track.t.length; i++) if (track.t[i]! - t0 <= standingS && track.usable[i]) out.push(i);
  return out;
}

/** Hauteur sol → épaules en unités image (moyenne des deux talons comme sol). */
function bodyHeightUnits(track: Track, i: number): number {
  const ground = Math.max(track.Y[LM.leftHeel]![i]!, track.Y[LM.rightHeel]![i]!);
  const sh = mid(track, LM.leftShoulder, LM.rightShoulder, i);
  return ground - sh.y;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Longueur du segment de référence pour la vue (unités image). */
export function segmentUnits(track: Track, view: GaitView, i: number): number {
  if (view === 'frontal' || view === 'posterior') {
    const h = mid(track, LM.leftHip, LM.rightHip, i);
    const s = mid(track, LM.leftShoulder, LM.rightShoulder, i);
    return dist(h, s);
  }
  const near = view === 'sagittal-left' ? 'L' : 'R';
  const leg = (side: 'L' | 'R'): number =>
    dist(pt(track, idx(side, 'hip'), i), pt(track, idx(side, 'knee'), i)) +
    dist(pt(track, idx(side, 'knee'), i), pt(track, idx(side, 'ankle'), i));
  // Membre le plus proche de la caméra : moins d'occlusion.
  return leg(near);
}

function segmentRatio(view: GaitView): number {
  return view === 'frontal' || view === 'posterior'
    ? WINTER_PROPORTIONS.trunk
    : WINTER_PROPORTIONS.thigh + WINTER_PROPORTIONS.shank;
}

function movingMedian(x: readonly number[], half: number): number[] {
  return x.map((_, i) => median(x.slice(Math.max(0, i - half), i + half + 1)));
}

export function estimateScale(
  track: Track,
  view: GaitView,
  heightCm: number,
  opts: { standingS: number; imageAspect: number; scaleObject?: ScaleObject | undefined },
): ScaleEstimate {
  const H = heightCm / 100;
  const notes: string[] = [];
  const stand = standingFrames(track, opts.standingS);
  const n = track.t.length;

  // 1) Station debout.
  const bodyU = median(stand.map((i) => bodyHeightUnits(track, i)));
  const segStandU = median(stand.map((i) => segmentUnits(track, view, i)));
  const bodyScale = (WINTER_PROPORTIONS.shoulderHeight * H) / bodyU;
  const segScaleStanding = (segmentRatio(view) * H) / segStandU;
  if (!stand.length || !Number.isFinite(bodyScale)) notes.push('Station debout initiale non détectée.');
  // Immobilité en station debout (bassin) : vérifie que la personne est bien immobile.
  if (stand.length > 3) {
    const hx = stand.map((i) => mid(track, LM.leftHip, LM.rightHip, i).x);
    if (sd(hx) > 0.01) notes.push('Mouvement pendant la station debout : calibration moins fiable.');
  }

  // 2) Segments trame par trame.
  const segU = Array.from({ length: n }, (_, i) => (track.usable[i] ? segmentUnits(track, view, i) : NaN));
  const segScaleRaw = segU.map((u) => (segmentRatio(view) * H) / u);
  const half = Math.max(2, Math.round(track.fps * 0.25));
  const segSmooth = movingMedian(segU, half);

  let scale0 = Number.isFinite(bodyScale) ? bodyScale : segScaleStanding;
  let method: ScaleEstimate['method'] = Number.isFinite(bodyScale) ? 'body_height' : 'segment_lengths';

  // 3) Objet d'échelle.
  let objectDiscrepancy = 0;
  if (opts.scaleObject) {
    const o = opts.scaleObject;
    const len = Math.hypot((o.b.x - o.a.x) * opts.imageAspect, o.b.y - o.a.y);
    if (len > 0) {
      const objScale = o.lengthM / len;
      if (Number.isFinite(scale0)) objectDiscrepancy = Math.abs(objScale - scale0) / objScale;
      notes.push(`Objet d'échelle : écart de ${(objectDiscrepancy * 100).toFixed(1)} % avec la taille.`);
      scale0 = objScale;
      method = 'scale_object';
    }
  }

  // Série : rapport longueur de segment en station debout / longueur à la trame (profondeur).
  let series: number[];
  const refSeg = Number.isFinite(segStandU) ? segStandU : median(segU);
  if (view === 'frontal' || view === 'posterior') {
    series = segSmooth.map((u) => (Number.isFinite(u) && u > 0 ? (scale0 * refSeg) / u : NaN));
  } else {
    // Vue latérale : profondeur ≈ constante le long du corridor, mais la ligne de marche peut différer de la position
    // debout. On utilise le rapport médian sur toute la marche.
    const walkU = median(segU);
    const k = Number.isFinite(walkU) && walkU > 0 ? refSeg / walkU : 1;
    series = Array.from({ length: n }, () => scale0 * k);
  }
  // Remplit les NaN par la valeur la plus proche.
  const fallback = median(series);
  series = series.map((v) => (Number.isFinite(v) ? v : fallback));

  // Incertitude : proportions + dispersion des estimations par segments + désaccord entre méthodes.
  const cv = (() => {
    const v = segScaleRaw.filter((x) => Number.isFinite(x));
    if (view === 'frontal' || view === 'posterior' || v.length < 3) return 0;
    return sd(v) / mean(v) / Math.sqrt(Math.max(1, v.length / Math.max(1, track.fps)));
  })();
  const methodGap =
    Number.isFinite(bodyScale) && Number.isFinite(segScaleStanding)
      ? Math.abs(bodyScale - segScaleStanding) / bodyScale
      : 0.05;
  const relativeUncertainty = Math.sqrt(
    PROPORTION_UNCERTAINTY.value ** 2 + cv ** 2 + (methodGap / 2) ** 2 + (objectDiscrepancy / 2) ** 2,
  );
  if (methodGap > 0.08)
    notes.push(
      `Désaccord de ${(methodGap * 100).toFixed(0)} % entre la hauteur du corps et la longueur des segments.`,
    );
  if (view === 'frontal' || view === 'posterior')
    notes.push('Vue frontale/postérieure : échelle variable avec la distance (corrigée par la longueur du tronc).');
  const confidence = Math.max(0, Math.min(1, 1 - relativeUncertainty * 5));
  return { metersPerUnit: scale0, series, relativeUncertainty, method, confidence, notes };
}
