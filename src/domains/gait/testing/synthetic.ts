/**
 * Générateur de squelettes SYNTHÉTIQUES de marche (33 repères MediaPipe) pour les tests du moteur.
 *
 * Modèle 3D simple (mètres) : axes W (sens de marche), Lat (+ = gauche du patient), Up. Les pieds sont pilotés par les
 * contacts au sol (talon fixe en début d'appui, pied à plat, rotation autour de l'orteil après le décollement du talon,
 * trajectoire d'oscillation lisse) ; la hauteur du bassin découle d'une flexion de genou d'appui cible (réponse à la
 * charge) et des contraintes de longueur des membres ; genou et hanche sont obtenus par cinématique inverse à 2 segments.
 * Les proportions des segments sont celles de Winter 2009 (voir calibration.ts), si bien que la taille saisie et
 * l'échelle de l'image sont cohérentes. Projection par une caméra sténopé (vue latérale, frontale ou postérieure).
 *
 * Les trajectoires d'oscillation (polynômes d'Hermite dont la vitesse aux extrémités égale celle du bassin) placent par
 * construction le maximum talon–bassin au contact initial et le minimum orteil–bassin au décollement : les instants
 * « vrais » des événements coïncident avec la définition de Zeni 2008, ce qui permet de tester la détection à ±1 trame.
 *
 * Ce module ne sert qu'aux tests et à la démonstration ; il n'a aucune valeur clinique.
 */
import { WINTER_PROPORTIONS as W } from '../calibration.ts';
import type { GaitPoseFrame, GaitView, Side } from '../types.ts';

export interface SideParams<T> {
  readonly L: T;
  readonly R: T;
}

export interface SyntheticParams {
  readonly heightM: number;
  readonly fps: number;
  /** Cadence (pas/min). */
  readonly cadence: number;
  /** Longueur de pas terminée par le contact de ce côté (m). */
  readonly stepLength: SideParams<number>;
  /** Fraction d'appui du cycle. */
  readonly stance: SideParams<number>;
  /** Phase du contact droit après le contact gauche (fraction du cycle). */
  readonly rightPhase: number;
  readonly cycles: number;
  readonly standingS: number;
  readonly view: GaitView;
  /** Bruit gaussien sur les coordonnées normalisées (écart-type). */
  readonly noise: number;
  readonly seed: number;
  /** Proportion de trames avec trou de visibilité (membre éloigné), 0–1. */
  readonly dropoutRate: number;
  // Cinématique du pied (angle talon → orteil / horizontale, °).
  readonly footPitchIC: SideParams<number>;
  readonly footPitchTO: SideParams<number>;
  readonly footPitchMidSwing: SideParams<number>;
  /** Élévation du talon en oscillation (m) : pilote la flexion du genou en oscillation. */
  readonly swingLift: SideParams<number>;
  /** Flexion de genou cible en réponse à la charge (°). */
  readonly stanceKneeFlexion: SideParams<number>;
  // Plan frontal.
  readonly baseWidth: number;
  /** Chute controlatérale du bassin pendant l'appui de ce côté (°). */
  readonly pelvicDrop: SideParams<number>;
  /** Inclinaison latérale du tronc vers ce côté pendant son appui (°). */
  readonly trunkLean: SideParams<number>;
  /** Arc latéral supplémentaire du pied en oscillation (m) : circumduction. */
  readonly circumduction: SideParams<number>;
  /** Déplacement latéral du bassin (amplitude, m). */
  readonly pelvisSway: number;
  readonly trunkForwardLean: number;
  /**
   * Cheville cible en oscillation (°, convention clinique) : le pied est réorienté par rapport à la jambe pendant
   * l'oscillation (pondération sin²), null = calendrier de l'angle du pied seul.
   */
  readonly swingAnkle: SideParams<number | null>;
}

export const NORMAL_PARAMS: SyntheticParams = {
  heightM: 1.75,
  fps: 30,
  cadence: 110,
  stepLength: { L: 0.7, R: 0.7 },
  stance: { L: 0.62, R: 0.62 },
  rightPhase: 0.5,
  cycles: 6,
  standingS: 1.2,
  view: 'sagittal-left',
  noise: 0.0015,
  seed: 1,
  dropoutRate: 0.02,
  footPitchIC: { L: 18, R: 18 },
  footPitchTO: { L: -55, R: -55 },
  footPitchMidSwing: { L: -33, R: -33 },
  swingLift: { L: 0.04, R: 0.04 },
  stanceKneeFlexion: { L: 18, R: 18 },
  baseWidth: 0.1,
  pelvicDrop: { L: 4, R: 4 },
  trunkLean: { L: 1, R: 1 },
  circumduction: { L: 0, R: 0 },
  pelvisSway: 0.02,
  trunkForwardLean: 4,
  swingAnkle: { L: 0, R: 0 },
};

export type Variant =
  'normal' | 'foot_drop' | 'trendelenburg' | 'stiff_knee' | 'circumduction' | 'prosthetic_asymmetry';

/** Variantes pathologiques (côté atteint : gauche). */
export function variantParams(v: Variant, base: Partial<SyntheticParams> = {}): SyntheticParams {
  const p: SyntheticParams = { ...NORMAL_PARAMS, ...base };
  const L = <T>(s: SideParams<T>, l: T): SideParams<T> => ({ L: l, R: s.R });
  switch (v) {
    case 'normal':
      return p;
    case 'foot_drop':
      // Pointe du pied tombante en oscillation, contact pied à plat, steppage (élévation accrue).
      return {
        ...p,
        footPitchIC: L(p.footPitchIC, 2),
        footPitchMidSwing: L(p.footPitchMidSwing, -55),
        swingAnkle: L(p.swingAnkle, -15),
        swingLift: L(p.swingLift, 0.12),
      };
    case 'trendelenburg':
      return { ...p, pelvicDrop: L(p.pelvicDrop, 11) };
    case 'stiff_knee':
      return {
        ...p,
        swingLift: L(p.swingLift, 0),
        footPitchTO: L(p.footPitchTO, -25),
        footPitchMidSwing: L(p.footPitchMidSwing, -27),
      };
    case 'circumduction':
      return { ...p, circumduction: L(p.circumduction, 0.12) };
    case 'prosthetic_asymmetry':
      // Prothèse transtibiale gauche : appui prothétique plus court, pas asymétriques, contact du pied sain précipité.
      return {
        ...p,
        stance: { L: 0.59, R: 0.65 },
        stepLength: { L: 0.6, R: 0.72 },
        rightPhase: 0.47,
        stanceKneeFlexion: L(p.stanceKneeFlexion, 12),
      };
  }
}

// ------------------------------------------------------------------------------------------------ Outils

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (u: number): number => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};
/** Hermite cubique de 0 à 1 avec pentes s'(0) = r0, s'(1) = r1. */
const hermite = (u: number, r0: number, r1: number): number => {
  const u2 = u * u;
  const u3 = u2 * u;
  return -2 * u3 + 3 * u2 + r0 * (u3 - 2 * u2 + u) + r1 * (u3 - u2);
};
const D2R = Math.PI / 180;

interface V3 {
  w: number;
  lat: number;
  up: number;
}

export interface SyntheticTruth {
  readonly params: SyntheticParams;
  /** Événements vrais (temps en s, trame la plus proche). */
  readonly events: readonly { side: Side; type: 'IC' | 'TO'; t: number; frame: number }[];
  /** Longueurs de pas vraies (m), par contact initial de ce côté. */
  readonly stepLengths: readonly { side: Side; t: number; value: number }[];
  /** Angles vrais par trame (convention clinique, plan sagittal). */
  readonly angles: SideParams<{ hip: number[]; knee: number[]; ankle: number[] }>;
  /** Mètres par unité image (hauteur) au plan du bassin, en début d'enregistrement. */
  readonly metersPerUnit: number;
  readonly imageAspect: number;
  readonly walkStartS: number;
}

interface LimbState {
  heel: V3;
  toe: V3;
  ankle: V3;
  phase: 'stance' | 'swing';
  tau: number;
}

export function generateGait(input: Partial<SyntheticParams> = {}): { frames: GaitPoseFrame[]; truth: SyntheticTruth } {
  const p: SyntheticParams = { ...NORMAL_PARAMS, ...input };
  const H = p.heightM;
  const Lt = W.thigh * H;
  const Ls = W.shank * H;
  const Lf = W.footLength * H;
  const ankleOff = { fwd: 0.2 * Lf, up: W.ankleHeight * H };
  const hipW = W.hipWidth * H * 0.85;
  const shW = W.shoulderWidth * H * 0.8;
  const trunk = W.trunk * H;
  const T = 120 / p.cadence;
  const S = p.stepLength.L + p.stepLength.R;
  const v = S / T;
  const ts = p.standingS;
  const tau0 = ts + 0.25 * T;
  const icStart: SideParams<number> = { L: tau0, R: tau0 + p.rightPhase * T };
  const lead = 0.2 * S;
  const pelvisW = (t: number): number => (t < ts ? -lead + v * (ts - tau0) : v * (t - tau0) - lead);
  const heelOffFrac = (s: Side): number => Math.max(0.15, p.stance[s] * 0.62);
  const ffFrac = 0.08;
  const sigma = (s: Side): number => (s === 'L' ? 1 : -1);
  const landing = (s: Side, k: number): number => (s === 'L' ? 0 : p.stepLength.R) + k * S;

  const footFrom = (heel: V3, phi: number): { toe: V3; ankle: V3 } => {
    const c = Math.cos(phi * D2R);
    const sn = Math.sin(phi * D2R);
    return {
      toe: { w: heel.w + Lf * c, lat: heel.lat, up: heel.up + Lf * sn },
      ankle: {
        w: heel.w + ankleOff.fwd * c - ankleOff.up * sn,
        lat: heel.lat,
        up: heel.up + ankleOff.fwd * sn + ankleOff.up * c,
      },
    };
  };

  const limb = (s: Side, t: number): LimbState => {
    const lat0 = sigma(s) * (p.baseWidth / 2);
    if (t < ts) {
      // Station debout : pieds à plat sous les hanches.
      const heel = { w: pelvisW(t) - ankleOff.fwd, lat: sigma(s) * (hipW / 2), up: 0 };
      return { heel, ...footFrom(heel, 0), phase: 'stance', tau: 0 };
    }
    const ut = (t - icStart[s]) / T;
    const k = Math.floor(ut);
    const tau = ut - k;
    const st = p.stance[s];
    const ho = heelOffFrac(s);
    const phiIC = p.footPitchIC[s];
    const phiTO = p.footPitchTO[s];
    const xh = landing(s, k);
    if (tau < st) {
      if (tau < ffFrac) {
        const heel = { w: xh, lat: lat0, up: 0 };
        return { heel, ...footFrom(heel, phiIC * (1 - smooth(tau / ffFrac))), phase: 'stance', tau };
      }
      if (tau < ho) {
        const heel = { w: xh, lat: lat0, up: 0 };
        return { heel, ...footFrom(heel, 0), phase: 'stance', tau };
      }
      const phi = phiTO * smooth((tau - ho) / (st - ho));
      const toeW = xh + Lf;
      const heel = {
        w: toeW - Lf * Math.cos(phi * D2R),
        lat: lat0,
        up: -Lf * Math.sin(phi * D2R),
      };
      return { heel, ...footFrom(heel, phi), phase: 'stance', tau };
    }
    const u = (tau - st) / (1 - st);
    const xs = xh + Lf - Lf * Math.cos(phiTO * D2R);
    const ys = -Lf * Math.sin(phiTO * D2R);
    const xe = landing(s, k + 1);
    const Dx = xe - xs;
    const r = (v * (1 - st) * T) / Dx;
    const gamma = Math.log(0.5) / Math.log(0.3);
    const heel = {
      w: xs + Dx * hermite(u, r, r),
      lat: lat0 + sigma(s) * p.circumduction[s] * Math.sin(Math.PI * u),
      up: ys * (1 - smooth(u)) + p.swingLift[s] * Math.sin(Math.PI * Math.pow(u, gamma)),
    };
    const phi =
      u < 0.5
        ? phiTO + (p.footPitchMidSwing[s] - phiTO) * smooth(u / 0.5)
        : p.footPitchMidSwing[s] + (phiIC - p.footPitchMidSwing[s]) * smooth((u - 0.5) / 0.5);
    return { heel, ...footFrom(heel, phi), phase: 'swing', tau };
  };

  const dur = ts + 0.25 * T + p.cycles * T + 0.3 * T;
  const n = Math.round(dur * p.fps);
  const times = Array.from({ length: n }, (_, i) => i / p.fps);

  // Bassin : obliquité, déplacement latéral, inclinaison du tronc.
  const tauOf = (s: Side, t: number): number => {
    const ut = (t - icStart[s]) / T;
    return ut - Math.floor(ut);
  };
  const bump = (tau: number, s: Side): number => {
    const a = 0.04;
    const b = p.stance[s] - 0.12;
    if (tau < a || tau > b) return 0;
    return Math.sin((Math.PI * (tau - a)) / (b - a)) ** 2;
  };
  const walking = (t: number): number => (t < ts ? 0 : 1);
  const obliq = (t: number): number =>
    walking(t) * (p.pelvicDrop.L * bump(tauOf('L', t), 'L') - p.pelvicDrop.R * bump(tauOf('R', t), 'R'));
  const sway = (t: number): number => walking(t) * p.pelvisSway * Math.cos(2 * Math.PI * (tauOf('L', t) - 0.3));
  const lean = (t: number): number =>
    walking(t) * (p.trunkLean.L * bump(tauOf('L', t), 'L') - p.trunkLean.R * bump(tauOf('R', t), 'R'));

  const limbs: { L: LimbState; R: LimbState }[] = times.map((t) => ({ L: limb('L', t), R: limb('R', t) }));
  // Hauteur du centre du bassin : flexion de genou d'appui cible, contraintes de longueur, enveloppe inférieure lissée.
  const legLen = (kappa: number): number => Math.sqrt(Lt * Lt + Ls * Ls + 2 * Lt * Ls * Math.cos(kappa * D2R));
  const kneeTarget = (s: Side, tau: number): number => {
    const k = p.stanceKneeFlexion[s];
    if (tau < 0.3) return 4 + (k - 4) * Math.sin((Math.PI * tau) / 0.3) ** 2;
    return 3;
  };
  const raw = times.map((t, i) => {
    let up = W.hipHeight * H;
    const o = obliq(t) * D2R;
    for (const s of ['L', 'R'] as const) {
      const L = limbs[i]![s];
      const hipLat = sway(t) + sigma(s) * (hipW / 2) * Math.cos(o);
      const dW = pelvisW(t) - L.ankle.w;
      const dLat = hipLat - L.ankle.lat;
      const off = sigma(s) * (hipW / 2) * Math.sin(o);
      const reach = (len: number): number =>
        L.ankle.up + Math.sqrt(Math.max(0, len * len - dW * dW - dLat * dLat)) - off;
      up = Math.min(up, reach((Lt + Ls) * 0.999));
      if (t >= ts && L.phase === 'stance' && L.tau < 0.45) up = Math.min(up, reach(legLen(kneeTarget(s, L.tau))));
    }
    return up;
  });
  const w = Math.max(1, Math.round(0.06 * p.fps));
  const eroded = raw.map((_, i) => Math.min(...raw.slice(Math.max(0, i - w), i + w + 1)));
  const hipUp = eroded.map((_, i) => {
    const s = eroded.slice(Math.max(0, i - w), i + w + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });

  // Squelette 3D complet.
  const buildSkel = (): V3[][] =>
    times.map((t, i) => {
      const o = obliq(t) * D2R;
      const pw = pelvisW(t);
      const center: V3 = { w: pw, lat: sway(t), up: hipUp[i]! };
      const hip = (s: Side): V3 => ({
        w: pw,
        lat: center.lat + sigma(s) * (hipW / 2) * Math.cos(o),
        up: center.up + sigma(s) * (hipW / 2) * Math.sin(o),
      });
      const knee = (s: Side): V3 => {
        const h = hip(s);
        const a = limbs[i]![s].ankle;
        const dx = { w: a.w - h.w, lat: a.lat - h.lat, up: a.up - h.up };
        const d = Math.hypot(dx.w, dx.lat, dx.up);
        const u = { w: dx.w / d, lat: dx.lat / d, up: dx.up / d };
        // Direction de flexion : composante de l'avant (+W) perpendiculaire à hanche→cheville.
        const dot = u.w;
        let nn = { w: 1 - dot * u.w, lat: -dot * u.lat, up: -dot * u.up };
        const nl = Math.hypot(nn.w, nn.lat, nn.up) || 1;
        nn = { w: nn.w / nl, lat: nn.lat / nl, up: nn.up / nl };
        const cb = Math.max(-1, Math.min(1, (Lt * Lt + d * d - Ls * Ls) / (2 * Lt * d)));
        const b = Math.acos(cb);
        return {
          w: h.w + Lt * (Math.cos(b) * u.w + Math.sin(b) * nn.w),
          lat: h.lat + Lt * (Math.cos(b) * u.lat + Math.sin(b) * nn.lat),
          up: h.up + Lt * (Math.cos(b) * u.up + Math.sin(b) * nn.up),
        };
      };
      const le = lean(t) * D2R;
      const fl = (walking(t) ? p.trunkForwardLean : 0) * D2R;
      const shC: V3 = {
        w: pw + trunk * Math.sin(fl),
        lat: center.lat + trunk * Math.sin(le),
        up: center.up + trunk * Math.cos(le) * Math.cos(fl),
      };
      const sh = (s: Side): V3 => ({ ...shC, lat: shC.lat + sigma(s) * (shW / 2) });
      const L = limbs[i]!;
      const pts: V3[] = new Array<V3>(33);
      const nose: V3 = { w: shC.w + 0.06, lat: shC.lat, up: shC.up + 0.11 * H };
      for (let k = 0; k <= 10; k++) pts[k] = { ...nose, lat: nose.lat + (k % 2 ? 0.03 : -0.03) * (k ? 1 : 0) };
      pts[11] = sh('L');
      pts[12] = sh('R');
      for (const [s, e, wr] of [
        ['L', 13, 15],
        ['R', 14, 16],
      ] as const) {
        const S0 = sh(s);
        pts[e] = { w: S0.w, lat: S0.lat + sigma(s) * 0.03, up: S0.up - 0.186 * H };
        pts[wr] = { w: S0.w + 0.03, lat: S0.lat + sigma(s) * 0.04, up: S0.up - 0.333 * H };
      }
      for (let k = 17; k <= 22; k++) pts[k] = { ...pts[k % 2 ? 15 : 16]!, up: pts[k % 2 ? 15 : 16]!.up - 0.05 };
      pts[23] = hip('L');
      pts[24] = hip('R');
      pts[25] = knee('L');
      pts[26] = knee('R');
      pts[27] = L.L.ankle;
      pts[28] = L.R.ankle;
      pts[29] = L.L.heel;
      pts[30] = L.R.heel;
      pts[31] = L.L.toe;
      pts[32] = L.R.toe;
      return pts;
    });
  let skel = buildSkel();
  // 2e passe : orientation du pied en oscillation par rapport à la jambe (cheville cible).
  for (let i = 0; i < n; i++)
    for (const [s, k, a] of [
      ['L', 25, 27],
      ['R', 26, 28],
    ] as const) {
      const L0 = limbs[i]![s];
      const target = p.swingAnkle[s];
      if (L0.phase !== 'swing' || target === null) continue;
      const u = (L0.tau - p.stance[s]) / (1 - p.stance[s]);
      const wgt = Math.sin(Math.PI * u) ** 2;
      const kn = skel[i]![k]!;
      const an = skel[i]![a]!;
      const shank = Math.atan2(an.w - kn.w, kn.up - an.up) / D2R;
      const old = Math.atan2(L0.toe.up - L0.heel.up, L0.toe.w - L0.heel.w) / D2R;
      const phi = (1 - wgt) * old + wgt * (shank + target);
      limbs[i]![s] = { ...L0, ...footFrom(L0.heel, phi) };
    }
  skel = buildSkel();

  // Caméra sténopé.
  const sagittal = p.view === 'sagittal-left' || p.view === 'sagittal-right';
  const aspect = sagittal ? 16 / 9 : 9 / 16;
  const f = sagittal ? 0.9 : 1.2;
  const camH = W.hipHeight * H;
  const D = 4;
  const midW = (pelvisW(ts) + pelvisW(dur)) / 2;
  const frontCam = pelvisW(dur) + 2.2;
  const backCam = pelvisW(0) - 2.2;
  const project = (q: V3): { x: number; y: number; depth: number } => {
    let X: number;
    let Z: number;
    if (p.view === 'sagittal-left') {
      Z = D - q.lat;
      X = q.w - midW;
    } else if (p.view === 'sagittal-right') {
      Z = D + q.lat;
      X = -(q.w - midW);
    } else if (p.view === 'frontal') {
      Z = frontCam - q.w;
      X = q.lat;
    } else {
      Z = q.w - backCam;
      X = -q.lat;
    }
    const xu = aspect / 2 + (f * X) / Z;
    const yu = 0.55 - (f * (q.up - camH)) / Z;
    return { x: xu / aspect, y: yu, depth: Z };
  };

  const rnd = mulberry32(p.seed);
  const gauss = (): number => {
    const u1 = Math.max(1e-12, rnd());
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rnd());
  };
  const near: Side | null = p.view === 'sagittal-left' ? 'L' : p.view === 'sagittal-right' ? 'R' : null;
  const farIdx = near === 'L' ? [26, 28, 30, 32] : near === 'R' ? [25, 27, 29, 31] : [];
  let dropUntil = -1;
  let dropIdx = -1;
  const frames: GaitPoseFrame[] = skel.map((pts, i) => {
    if (i > dropUntil && farIdx.length && rnd() < p.dropoutRate) {
      dropUntil = i + 1 + Math.floor(rnd() * 3);
      dropIdx = farIdx[Math.floor(rnd() * farIdx.length)]!;
    }
    return {
      t: times[i]! * 1000,
      landmarks: pts.map((q, k) => {
        const pr = project(q);
        const far = farIdx.includes(k);
        const visibility = i <= dropUntil && k === dropIdx ? 0.2 : far ? 0.8 : 0.95;
        return { x: pr.x + p.noise * gauss(), y: pr.y + p.noise * gauss(), z: 0, visibility };
      }),
    };
  });

  // Vérité terrain.
  const events: { side: Side; type: 'IC' | 'TO'; t: number; frame: number }[] = [];
  const stepLengths: { side: Side; t: number; value: number }[] = [];
  for (const s of ['L', 'R'] as const) {
    for (let k = 0; k < p.cycles + 2; k++) {
      const tic = icStart[s] + k * T;
      if (tic < dur) {
        events.push({ side: s, type: 'IC', t: tic, frame: Math.round(tic * p.fps) });
        const other: Side = s === 'L' ? 'R' : 'L';
        const otherHeel = limb(other, tic).heel.w;
        stepLengths.push({ side: s, t: tic, value: landing(s, k) - otherHeel });
      }
      const tto = icStart[s] + (k + p.stance[s]) * T;
      if (tto < dur) events.push({ side: s, type: 'TO', t: tto, frame: Math.round(tto * p.fps) });
    }
  }
  const angles = {
    L: { hip: [] as number[], knee: [] as number[], ankle: [] as number[] },
    R: { hip: [] as number[], knee: [] as number[], ankle: [] as number[] },
  };
  const fromVert = (a: V3, b: V3): number => Math.atan2(b.w - a.w, a.up - b.up) / D2R;
  for (const pts of skel)
    for (const [s, h, k, a, he, to] of [
      ['L', 23, 25, 27, 29, 31],
      ['R', 24, 26, 28, 30, 32],
    ] as const) {
      const thigh = fromVert(pts[h]!, pts[k]!);
      const shank = fromVert(pts[k]!, pts[a]!);
      const foot = Math.atan2(pts[to]!.up - pts[he]!.up, pts[to]!.w - pts[he]!.w) / D2R;
      angles[s].hip.push(thigh);
      angles[s].knee.push(thigh - shank);
      angles[s].ankle.push(foot - shank);
    }
  return {
    frames,
    truth: {
      params: p,
      events: events.sort((a, b) => a.t - b.t),
      stepLengths,
      angles,
      metersPerUnit: (sagittal ? D : frontCam - pelvisW(0)) / f,
      imageAspect: aspect,
      walkStartS: ts,
    },
  };
}
