/**
 * Angles articulaires trame par trame (plan de l'image).
 *
 * Conventions cliniques (norms.json > conventions) : flexion positive, extension négative ; cheville : dorsiflexion
 * positive, flexion plantaire négative. Zéro = position neutre debout : l'angle moyen mesuré pendant la station debout
 * initiale est soustrait (« offset »), ce qui absorbe le décalage propre aux repères MediaPipe (talon/pointe du pied
 * non parallèles à la semelle, repère de hanche imprécis).
 *
 * Hanche : angle cuisse–verticale (convention de Perry, plus robuste en 2D que cuisse–bassin, le bassin étant mal estimé
 * par une caméra ; voir norms.json > conventions.hipReference). Tronc : inclinaison du segment hanches → épaules par
 * rapport à la verticale (antérieure positive).
 *
 * Plan frontal (estimations, aucune validation 2D publiée — norms.json > camera2dAccuracy.acc_frontal_plane) :
 * obliquité pelvienne, inclinaison latérale du tronc, angle de projection frontal du genou (FPPA, Willson & Davis 2008),
 * alignement du talon (vue postérieure).
 */
import { idx, LM } from './landmarks.ts';
import { mid, pt, type Track } from './preprocess.ts';
import { angle3, mean, RAD2DEG } from './signal.ts';
import type { Side } from './types.ts';

interface P {
  x: number;
  y: number;
}

/** Angle (°) d'un vecteur a→b par rapport à la verticale descendante, positif vers l'avant (sens de marche d). */
function fromVertical(a: P, b: P, d: number): number {
  return Math.atan2(d * (b.x - a.x), b.y - a.y) * RAD2DEG;
}

export interface SagittalAngles {
  readonly hip: number[];
  readonly knee: number[];
  readonly ankle: number[];
  /** Angle du pied (talon → orteil) par rapport à l'horizontale, positif pointe vers le haut. */
  readonly foot: number[];
  readonly trunk: number[];
}

export interface Offsets {
  readonly hip: number;
  readonly knee: number;
  readonly ankle: number;
  readonly foot: number;
  readonly trunk: number;
}

/** Angles sagittaux bruts (sans offset) d'un côté. */
export function rawSagittal(track: Track, side: Side, d: 1 | -1): SagittalAngles {
  const n = track.t.length;
  const out: SagittalAngles = { hip: [], knee: [], ankle: [], foot: [], trunk: [] };
  for (let i = 0; i < n; i++) {
    const hip = pt(track, idx(side, 'hip'), i);
    const knee = pt(track, idx(side, 'knee'), i);
    const ankle = pt(track, idx(side, 'ankle'), i);
    const heel = pt(track, idx(side, 'heel'), i);
    const toe = pt(track, idx(side, 'toe'), i);
    const thigh = fromVertical(hip, knee, d);
    const shank = fromVertical(knee, ankle, d);
    const foot = Math.atan2(-(toe.y - heel.y), d * (toe.x - heel.x)) * RAD2DEG;
    const ph = mid(track, LM.leftHip, LM.rightHip, i);
    const ps = mid(track, LM.leftShoulder, LM.rightShoulder, i);
    out.hip.push(thigh);
    out.knee.push(thigh - shank);
    out.ankle.push(foot - shank);
    out.foot.push(foot);
    // Tronc (hanches → épaules, vers le haut) : inclinaison antérieure positive.
    out.trunk.push(Math.atan2(d * (ps.x - ph.x), ph.y - ps.y) * RAD2DEG);
  }
  return out;
}

export function offsetsFrom(a: SagittalAngles, frames: readonly number[]): Offsets {
  const at = (s: number[]): number => {
    const m = mean(frames.map((i) => s[i]!));
    return Number.isFinite(m) ? m : 0;
  };
  return { hip: at(a.hip), knee: at(a.knee), ankle: at(a.ankle), foot: at(a.foot), trunk: at(a.trunk) };
}

export function applyOffsets(a: SagittalAngles, o: Offsets): SagittalAngles {
  return {
    hip: a.hip.map((v) => v - o.hip),
    knee: a.knee.map((v) => v - o.knee),
    ankle: a.ankle.map((v) => v - o.ankle),
    foot: a.foot.map((v) => v - o.foot),
    trunk: a.trunk.map((v) => v - o.trunk),
  };
}

/** Signe (dans l'image) de la direction « gauche du patient » : +1 si la hanche gauche a un X plus grand. */
export function leftSign(track: Track, frames: readonly number[]): 1 | -1 {
  const dx = mean(frames.map((i) => track.X[LM.leftHip]![i]! - track.X[LM.rightHip]![i]!));
  return dx >= 0 ? 1 : -1;
}

export interface FrontalAngles {
  /** Obliquité : positif quand la hanche DROITE est plus basse que la gauche (°). */
  readonly obliquityRLow: number[];
  /** Inclinaison latérale du tronc, positive vers la GAUCHE du patient (°). */
  readonly trunkLeanLeft: number[];
  /** FPPA par côté, positif = valgus (genou médial à la ligne hanche–cheville) (°). */
  readonly fppa: { L: number[]; R: number[] };
  /** Alignement du talon (cheville → talon vs verticale), positif = talon latéral (valgus d'arrière-pied) (°). */
  readonly heel: { L: number[]; R: number[] };
  /** Position latérale (unités image, positif vers la gauche du patient) : milieu des hanches et chevilles. */
  readonly pelvisLat: number[];
  readonly ankleLat: { L: number[]; R: number[] };
  readonly heelLat: { L: number[]; R: number[] };
}

export function rawFrontal(track: Track, u: 1 | -1): FrontalAngles {
  const n = track.t.length;
  const res: FrontalAngles = {
    obliquityRLow: [],
    trunkLeanLeft: [],
    fppa: { L: [], R: [] },
    heel: { L: [], R: [] },
    pelvisLat: [],
    ankleLat: { L: [], R: [] },
    heelLat: { L: [], R: [] },
  };
  for (let i = 0; i < n; i++) {
    const hl = pt(track, LM.leftHip, i);
    const hr = pt(track, LM.rightHip, i);
    res.obliquityRLow.push(Math.atan2(hr.y - hl.y, Math.abs(hl.x - hr.x)) * RAD2DEG);
    const ph = mid(track, LM.leftHip, LM.rightHip, i);
    const ps = mid(track, LM.leftShoulder, LM.rightShoulder, i);
    res.trunkLeanLeft.push(Math.atan2(u * (ps.x - ph.x), ph.y - ps.y) * RAD2DEG);
    res.pelvisLat.push(u * ph.x);
    for (const side of ['L', 'R'] as const) {
      const hip = pt(track, idx(side, 'hip'), i);
      const knee = pt(track, idx(side, 'knee'), i);
      const ankle = pt(track, idx(side, 'ankle'), i);
      const heel = pt(track, idx(side, 'heel'), i);
      // Direction médiale dans l'image : vers l'autre membre.
      const medial = side === 'L' ? -u : u;
      const cross = (ankle.x - hip.x) * (knee.y - hip.y) - (ankle.y - hip.y) * (knee.x - hip.x);
      // Déplacement latéral (signé) du genou par rapport à la ligne hanche–cheville, ramené à la direction médiale.
      const lineX = hip.x + ((ankle.x - hip.x) * (knee.y - hip.y)) / (ankle.y - hip.y || 1e-9);
      const medialDisp = medial * (knee.x - lineX);
      const mag = 180 - angle3(hip, knee, ankle);
      res.fppa[side].push(cross === 0 ? 0 : Math.sign(medialDisp) * mag);
      const lateral = -medial;
      res.heel[side].push(Math.atan2(lateral * (heel.x - ankle.x), heel.y - ankle.y) * RAD2DEG);
      res.ankleLat[side].push(u * ankle.x);
      res.heelLat[side].push(u * heel.x);
    }
  }
  return res;
}
