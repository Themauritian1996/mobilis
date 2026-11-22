// Métriques biomécaniques (angles, distances, mesures de la main) calculées sur les points de pose, et compteur de
// répétitions / maintien (Tracker). Fonctions pures et machine à états : aucune dépendance au navigateur.
import type { BodyKey, BodyPx, PxPoint } from './pose.ts';

const isNil = (x: unknown): x is null | undefined => x === null || x === undefined;

/** Côté gauche / droit (côté du patient, pas de l'image). */
export type Side = 'L' | 'R';
type SideArg = Side | null;

/** Point de la main (2D en pixels, ou 3D « monde » en mètres quand `z` est fourni). */
export interface HandPt {
  x: number;
  y: number;
  z?: number;
}

interface HandData {
  /** 21 points 2D en pixels de l'image. */
  hand?: readonly HandPt[] | null;
  /** 21 points 3D « monde » en mètres (worldLandmarks), si disponibles. */
  hand3?: readonly HandPt[] | null;
}

/** Image analysée : points du corps en pixels, plus la main pour les exercices de la main. */
export type Frame = BodyPx & HandData;
/** Pour les exercices de la main, seuls les points de la main sont fournis. */
export type HandOnlyFrame = HandData & { hand: readonly HandPt[] };
export type PoseInput = Frame | HandOnlyFrame;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Ctx {
  sh: PxPoint;
  hip: PxPoint;
  ear: PxPoint;
  torso: number;
  facing: number;
  legLen: number;
  shW: number;
}

/** Options de calcul d'une métrique. */
export interface MetricOpts {
  both?: boolean | undefined;
  legLen0?: number | undefined;
}

type PartName = 'sh' | 'el' | 'wr' | 'hip' | 'kn' | 'an' | 'ft' | 'heel';
type MetricFn = (p: Frame, s: SideArg, c: Ctx, o?: MetricOpts) => number;

/** Contrôle de qualité d'un exercice (erreur détectée → consigne `cue`). */
export interface CheckSpec {
  readonly m: string;
  readonly rel?: boolean;
  readonly abs?: boolean;
  readonly max?: number;
  readonly min?: number;
  readonly cue: string;
}

/** Condition de départ à respecter (« guard »). */
export interface GuardSpec {
  readonly m: string;
  readonly min?: number;
  readonly max?: number;
}

/** Suivi caméra d'un exercice dans un plan (voir domains/rehab/data : TrackPlane). */
export interface TrackSpec {
  readonly metric: string;
  readonly rel?: boolean;
  readonly delta?: number;
  readonly holdTop?: number;
  readonly checks?: readonly CheckSpec[];
  readonly abs?: boolean;
  readonly from?: number;
  readonly to?: number;
  readonly both?: boolean;
  readonly side?: string;
  readonly angular?: boolean;
  readonly absRel?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly minRepSec?: number;
  readonly guard?: GuardSpec;
  readonly again?: number;
  readonly smooth?: number;
  readonly calibTol?: number;
  readonly partialMin?: number;
}

/** Exercice suivi par caméra. */
export interface TrackedExercise {
  readonly track: {
    readonly mode: 'reps' | 'hold';
    readonly planes: Readonly<Record<string, TrackSpec>>;
  };
}

const deg = (r: number): number => (r * 180) / Math.PI;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: PxPoint, b: PxPoint): PxPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
function angle(a: PxPoint, b: PxPoint, c: PxPoint): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y },
    v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / d))));
}

function ctx(p: Frame): Ctx {
  const sh = mid(p.shL, p.shR),
    hip = mid(p.hipL, p.hipR),
    ear = mid(p.earL, p.earR);
  const torso = dist(sh, hip) || 1;
  const facing = Math.sign(p.nose.x - ear.x) || 1; // +1 = tourné vers la droite de l'image
  const legLen = (dist(p.hipL, p.anL) + dist(p.hipR, p.anR)) / 2 || 1;
  const shW = dist(p.shL, p.shR) || 1;
  return { sh, hip, ear, torso, facing, legLen, shW };
}
const S = (p: Frame, side: SideArg, name: PartName): PxPoint => p[`${name}${side}` as BodyKey];
const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');

// ---------- Mesures de la main ----------
const hp = (h: readonly HandPt[], k: number): HandPt => h[k] as HandPt;
// points de la main utilisés pour les distances : 3D (mètres) si disponibles, sinon 2D (pixels ; le z relatif du modèle 2D est ignoré)
const H3 = (p: Frame): readonly HandPt[] => (p.hand3 || p.hand) as readonly HandPt[];
const sub3 = (a: HandPt, b: HandPt, z = 1): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: z ? (a.z || 0) - (b.z || 0) : 0,
});
const d3 = (a: HandPt, b: HandPt): number => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const D3 = (p: Frame): ((a: HandPt, b: HandPt) => number) => (p.hand3 ? d3 : dist);
const unit3 = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
function angle3(a: Vec3, b: Vec3): number {
  const d = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z) || 1;
  return deg(Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / d))));
}
const handOf = (p: Frame): readonly HandPt[] => p.hand as readonly HandPt[];

// Mesures des doigts et du pouce : contacts ou fermetures enchaînés, souvent sans rouvrir complètement la main (voir Tracker)
const FINGER_METRICS = new Set(['hPinch', 'hClose', 'hThumbAbd']);

// ---------- Métriques ----------
const M = {
  knee: (p: Frame, s: SideArg): number => angle(S(p, s, 'hip'), S(p, s, 'kn'), S(p, s, 'an')),
  hip: (p: Frame, s: SideArg): number => angle(S(p, s, 'sh'), S(p, s, 'hip'), S(p, s, 'kn')),
  hipMax: (p: Frame): number => Math.max(M.hip(p, 'L'), M.hip(p, 'R')),
  elbow: (p: Frame, s: SideArg): number => angle(S(p, s, 'sh'), S(p, s, 'el'), S(p, s, 'wr')),
  ankle: (p: Frame, s: SideArg): number => angle(S(p, s, 'kn'), S(p, s, 'an'), S(p, s, 'ft')),
  bodyLine: (p: Frame, s: SideArg): number => angle(S(p, s, 'sh'), S(p, s, 'hip'), S(p, s, 'an')),
  armElev: (p: Frame, s: SideArg): number => angle(S(p, s, 'hip'), S(p, s, 'sh'), S(p, s, 'el')),
  shFlex: (p: Frame, s: SideArg, c: Ctx): number => {
    const sh = S(p, s, 'sh'),
      hip = S(p, s, 'hip'),
      el = S(p, s, 'el');
    const v1 = { x: hip.x - sh.x, y: hip.y - sh.y },
      v2 = { x: el.x - sh.x, y: el.y - sh.y };
    return -c.facing * deg(Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y));
  },
  trunkLean: (_p: Frame, _s: SideArg, c: Ctx): number =>
    c.facing * deg(Math.atan2(c.sh.x - c.hip.x, -(c.sh.y - c.hip.y))),
  trunkTilt: (_p: Frame, _s: SideArg, c: Ctx): number =>
    deg(Math.atan2(-(c.sh.y - c.hip.y), Math.abs(c.sh.x - c.hip.x))),
  shinLean: (p: Frame, s: SideArg, c: Ctx): number =>
    c.facing * deg(Math.atan2(S(p, s, 'kn').x - S(p, s, 'an').x, -(S(p, s, 'kn').y - S(p, s, 'an').y))),
  // oreilles et épaules des deux côtés (moyenne) : moins de tremblement que le seul côté visible
  neckFwd: (_p: Frame, _s: SideArg, c: Ctx): number => (c.facing * (c.ear.x - c.sh.x)) / c.torso,
  wristUp: (p: Frame, s: SideArg, c: Ctx): number => (S(p, s, 'sh').y - S(p, s, 'wr').y) / c.torso,
  heelRise: (p: Frame, s: SideArg, c: Ctx): number => -S(p, s, 'heel').y / c.legLen,
  hipY: (p: Frame, _s: SideArg, c: Ctx): number => (mid(p.anL, p.anR).y - c.hip.y) / (dist(p.hipL, p.hipR) || 1),
  armSym: (p: Frame): number => Math.abs(M.armElev(p, 'L') - M.armElev(p, 'R')),
  kneeSym: (p: Frame): number => Math.abs(M.knee(p, 'L') - M.knee(p, 'R')),
  trunkSide: (_p: Frame, _s: SideArg, c: Ctx): number => deg(Math.atan2(c.sh.x - c.hip.x, -(c.sh.y - c.hip.y))),
  pelvisDrop: (p: Frame): number => deg(Math.atan2(p.hipL.y - p.hipR.y, Math.abs(p.hipL.x - p.hipR.x) || 1)),
  shrug: (p: Frame, _s: SideArg, c: Ctx): number => (p.earL.y - p.shL.y + (p.earR.y - p.shR.y)) / 2 / c.shW,
  headTilt: (p: Frame): number => deg(Math.atan2(p.earL.y - p.earR.y, Math.abs(p.earL.x - p.earR.x) || 1)),
  headRot: (p: Frame): number => (p.nose.x - mid(p.earL, p.earR).x) / (dist(p.earL, p.earR) || 1),
  kneeValgus: (p: Frame, s: SideArg, c: Ctx): number => {
    const one = (sd: Side): number => {
      const hip = S(p, sd, 'hip'),
        kn = S(p, sd, 'kn'),
        an = S(p, sd, 'an');
      const t = (kn.y - hip.y) / (an.y - hip.y || 1);
      const lineX = hip.x + (an.x - hip.x) * t;
      const medial = Math.sign(S(p, other(sd), 'hip').x - hip.x) || 1;
      return ((kn.x - lineX) * medial) / c.legLen;
    };
    return s ? one(s) : Math.max(one('L'), one('R'));
  },
  erFront: (p: Frame, s: SideArg): number => {
    const lat = Math.sign(S(p, s, 'sh').x - S(p, other(s as Side), 'sh').x) || 1;
    return ((S(p, s, 'wr').x - S(p, s, 'el').x) * lat) / (dist(S(p, s, 'sh'), S(p, s, 'el')) || 1);
  },
  elbowAway: (p: Frame, s: SideArg): number =>
    Math.abs(S(p, s, 'el').x - S(p, s, 'sh').x) / (dist(S(p, s, 'sh'), S(p, s, 'el')) || 1),
  hipAbd: (p: Frame, s: SideArg): number => {
    const h = S(p, s, 'hip'),
      k = S(p, s, 'kn');
    return deg(Math.atan2(Math.abs(k.x - h.x), k.y - h.y));
  },
  kneeGap: (p: Frame, _s: SideArg, c: Ctx): number => angle(p.knL, c.hip, p.knR),
  footLift: (p: Frame, _s: SideArg, c: Ctx): number => Math.abs(p.anL.y - p.anR.y) / c.legLen,
  hipLow: (_p: Frame, _s: SideArg, c: Ctx): number => c.hip.y / c.shW,
  // descente du bassin (vue de face) en fraction de la longueur de jambe mesurée au départ : plus stable que la largeur d'épaules
  hipDrop: (_p: Frame, _s: SideArg, c: Ctx, o: MetricOpts = {}): number => c.hip.y / (o.legLen0 || c.legLen),
  legLen: (_p: Frame, _s: SideArg, c: Ctx): number => c.legLen,
  // ---- Main (21 points MediaPipe Hands) ----
  // p.hand  : points 2D en pixels de l'image ;
  // p.hand3 : points 3D « monde » en mètres (worldLandmarks), si disponibles.
  // Poignet et rotation de l'avant-bras : direction dans l'image par rapport au départ (l'avant-bras ne bouge pas) ;
  // le Tracker corrige l'effet d'une main filmée de biais grâce aux points 3D (voir tilt3).
  // direction de la main (poignet → tête du 3e métacarpien) dans l'image ; avant-bras immobile → variation = mouvement du poignet
  hAxis: (p: Frame): number => {
    const h = handOf(p);
    return deg(Math.atan2(hp(h, 9).x - hp(h, 0).x, -(hp(h, 9).y - hp(h, 0).y)));
  },
  // rotation de l'avant-bras vu dans son axe : orientation de la ligne des jointures (index → auriculaire)
  hRoll: (p: Frame): number => {
    const h = handOf(p);
    return deg(Math.atan2(hp(h, 17).x - hp(h, 5).x, -(hp(h, 17).y - hp(h, 5).y)));
  },
  // Doigts et pouce : distances et angles mesurés en 3D quand c'est possible → identiques quelle que soit
  // l'orientation de la main face à la caméra (en 2D, une main tournée de 30° « raccourcit » les doigts).
  // pouce → pulpe du doigt le plus proche (fraction de la longueur de la paume, négatif : plus proche de 0 = contact)
  hPinch: (p: Frame): number => {
    const h = H3(p),
      d = D3(p),
      palm = d(hp(h, 0), hp(h, 9)) || 1;
    return -Math.min(...[8, 12, 16, 20].map((k) => d(hp(h, 4), hp(h, k)))) / palm;
  },
  // fermeture de la main : distance moyenne bout des doigts → poignet (fraction de la paume ; ≈ 1,8 main ouverte, ≈ 1 poing)
  hClose: (p: Frame): number => {
    const h = H3(p),
      d = D3(p),
      palm = d(hp(h, 0), hp(h, 9)) || 1;
    return [8, 12, 16, 20].reduce((a, k) => a + d(hp(h, k), hp(h, 0)), 0) / 4 / palm;
  },
  // ouverture du pouce (abduction / « C ») : angle entre le pouce (2 → 4) et le 2e métacarpien (0 → 5)
  hThumbAbd: (p: Frame): number => {
    const h = H3(p),
      z = p.hand3 ? 1 : 0;
    return angle3(sub3(hp(h, 4), hp(h, 2), z), sub3(hp(h, 5), hp(h, 0), z));
  },
} satisfies Record<string, MetricFn>;

// Segment 3D dont la direction décrit le mouvement des mesures angulaires de la main
const HAND_DIR3: Readonly<Record<string, readonly [number, number]>> = { hAxis: [0, 9], hRoll: [5, 17] };
/** Direction 3D (vecteur unitaire) du segment d'une mesure angulaire de la main, ou null (pas de points 3D). */
export function handDir3(name: string, p: PoseInput): Vec3 | null {
  const seg = HAND_DIR3[name],
    h = p.hand3;
  if (!seg || !h) return null;
  return unit3(sub3(hp(h, seg[1]), hp(h, seg[0])));
}
/** Main filmée de biais : l'angle vu dans l'image (d2, degrés) sous-estime l'angle réel. On le corrige avec l'angle 3D
 *  entre la direction de départ et la direction actuelle (a3), sans jamais réduire d2 et au plus de +35 % (le z du modèle
 *  est moins précis que x, y) ; rien sous 4° (au repos, le bruit 3D ne doit pas créer de mouvement). */
export function tiltCorrect(d2: number, a3?: number | null): number {
  const a = Math.abs(d2);
  if (isNil(a3) || !(a3 > 0) || a < 4) return d2;
  return d2 * Math.max(1, Math.min(1.35, a3 / a));
}
export const HAND_METRICS: ReadonlySet<string> = new Set(['hAxis', 'hRoll', 'hPinch', 'hClose', 'hThumbAbd']);
// Sens anatomique de chaque mesure (envoyé à l'IA pour qu'elle interprète des chiffres valides)
export const METRIC_INFO = {
  knee: 'knee joint angle in degrees (180 = fully straight, smaller = more bent)',
  hip: 'hip angle between trunk and thigh in degrees (180 = straight, smaller = more flexed)',
  hipMax: 'largest hip angle of both sides (degrees)',
  elbow: 'elbow angle in degrees (180 = straight)',
  ankle: 'ankle angle between shin and foot in degrees (smaller = more dorsiflexion)',
  bodyLine: 'shoulder-hip-ankle alignment in degrees (180 = straight body line)',
  armElev: 'arm elevation from the side of the trunk in degrees (0 = arm down)',
  shFlex:
    'shoulder flexion in degrees (0 = arm along the body, 90 = forward horizontal, negative = arm behind the body)',
  trunkLean: 'trunk forward lean from vertical in degrees (positive = leaning forward)',
  trunkTilt: 'trunk elevation from horizontal in degrees (prone press-up)',
  shinLean: 'shin forward lean from vertical in degrees (knee travelling over toes)',
  neckFwd: 'forward head position (ear ahead of shoulder, fraction of torso length)',
  wristUp: 'wrist height above shoulder (fraction of torso length)',
  heelRise: 'heel height relative to standing (fraction of leg length)',
  hipY: 'hip height above ankles (bridge height, relative to pelvis width)',
  armSym: 'left/right arm elevation difference in degrees',
  kneeSym: 'left/right knee angle difference in degrees',
  trunkSide: 'trunk side lean in degrees (front view)',
  pelvisDrop: 'pelvic tilt left/right in degrees (front view, 0 = level)',
  shrug: 'shoulder elevation toward the ears (smaller = more shrugged)',
  headTilt: 'head side tilt in degrees',
  headRot: 'head rotation (nose offset between ears)',
  kneeValgus: 'medial knee shift relative to the hip-ankle line, fraction of leg length (> 0.1 = knee caving inward)',
  erFront: 'forearm outward rotation (wrist lateral to elbow, fraction of upper arm)',
  elbowAway: 'elbow distance from the trunk (fraction of upper arm length)',
  hipAbd: 'hip abduction angle in degrees (leg out to the side)',
  kneeGap: 'angle between the knees from the pelvis (clamshell opening)',
  footLift: 'foot lifted off the floor (fraction of leg length)',
  hipLow: 'hip height drop relative to shoulder width (squat depth in front view)',
  hipDrop: 'pelvis drop from the start position, as a fraction of leg length (front view)',
  hAxis: 'wrist movement: change of the hand direction from the start position in degrees (forearm resting still)',
  hRoll: 'forearm rotation (pronation/supination) from the start position, in degrees',
  hPinch: 'thumb tip to nearest fingertip distance (negative fraction of palm length; close to 0 = tips touching)',
  hClose:
    'mean fingertip-to-wrist distance (fraction of palm length, measured in 3D; about 1.8 open hand, about 1.0 closed fist)',
  hThumbAbd: 'thumb opening angle from the index metacarpal, in degrees',
} as const satisfies Readonly<Record<string, string>>;
const SIDED: ReadonlySet<string> = new Set([
  'knee',
  'hip',
  'elbow',
  'ankle',
  'bodyLine',
  'armElev',
  'shFlex',
  'shinLean',
  'neckFwd',
  'wristUp',
  'heelRise',
  'erFront',
  'elbowAway',
  'hipAbd',
  'kneeValgus',
]);

function visibleSide(p: Frame): Side {
  const names: PartName[] = ['sh', 'el', 'wr', 'hip', 'kn', 'an'];
  const sc = (s: Side): number => names.reduce((a, n) => a + S(p, s, n).v, 0);
  return sc('L') >= sc('R') ? 'L' : 'R';
}

export function metric(name: string, input: PoseInput, side?: SideArg, opts: MetricOpts = {}): number {
  const p = input as Frame;
  const fn = (M as Readonly<Record<string, MetricFn>>)[name] as MetricFn;
  if (HAND_METRICS.has(name)) return p.hand ? fn(p, null, ctxNone) : NaN;
  const c = ctx(p);
  if (opts.both && SIDED.has(name)) return (fn(p, 'L', c) + fn(p, 'R', c)) / 2;
  return fn(p, SIDED.has(name) ? (side ?? null) : null, c, opts);
}
/** Les mesures de la main n'utilisent pas le contexte du corps (absent des images « main seule »). */
const ctxNone = null as unknown as Ctx;

// Orientation : la personne est-elle de face ou de côté par rapport à la caméra ?
export function detectPlane(input: PoseInput): 'front' | 'side' | 'between' | null {
  const p = input as Frame;
  const c = ctx(p);
  const r = c.shW / c.torso;
  if (Math.abs(M.trunkLean(p, null, c)) > 50) return null; // couché / quadrupédie : on ne devine pas
  if (r > 0.42) return 'front';
  if (r < 0.24) return 'side';
  return 'between';
}

export function bodyVisible(p: PoseInput): boolean {
  const f = p as Frame;
  const need: BodyKey[] = ['shL', 'shR', 'hipL', 'hipR'];
  return need.every((k) => f[k].v > 0.5);
}

// ---------- Compteur de répétitions / maintien ----------
// Haut du mouvement : 85 % de la cible (la cible tient déjà compte du niveau du patient)
const TOP = 0.85;
// Répétition partielle : compte dès 35 % de la cible (marquée « partielle »). countPartial = false → ancien seuil de 60 %.
export const PARTIAL_MIN = 0.35,
  FULL_MIN = 0.6;
/** fn(ex) → false : exiger l'amplitude quasi complète pour cet exercice ; true / undefined : compter les partielles. */
export type PartialPolicy = (ex: TrackedExercise) => boolean | undefined;
let partialPolicy: PartialPolicy | null = null;
export const setPartialPolicy = (fn: PartialPolicy | null | undefined): void => {
  partialPolicy = typeof fn === 'function' ? fn : null;
};
export function partialMinFor(ex: TrackedExercise, spec: TrackSpec | undefined, opt?: number | boolean | null): number {
  if (typeof opt === 'number') return Math.max(0.25, Math.min(FULL_MIN, opt));
  if (opt === false) return FULL_MIN;
  let on = true;
  try {
    if (partialPolicy && partialPolicy(ex) === false) on = false;
  } catch {
    /* règle défaillante : on compte les partielles */
  }
  return on ? Math.max(0.25, Math.min(FULL_MIN, spec?.partialMin ?? PARTIAL_MIN)) : FULL_MIN;
}
const AGAIN_DROP = 0.55,
  AGAIN_RISE = 0.22;

/** Lecture d'un contrôle de qualité. */
export interface CheckReading {
  cue: string;
  metric: string;
  value: number;
  limit: number | undefined;
  kind: 'max' | 'min';
  relative: boolean;
  bad?: boolean;
}

/** Une répétition comptée. */
export interface RepRecord {
  n: number;
  full: boolean;
  dur: number;
  faults: string[];
  quality: number;
  peak: number;
  meas: {
    metric: string;
    peakValue: number;
    targetValue: number;
    romPct: number;
    minRepSec: number;
    checks: CheckReading[];
  };
}

/** État renvoyé à chaque image. */
export interface TrackStatus {
  phase: string;
  progress: number;
  reps?: number;
  holdSec?: number;
  guard?: boolean;
  value?: number;
  target?: number;
  side?: Side;
  faults?: string[];
  checks?: CheckReading[];
  range?: readonly [number | undefined, number | undefined];
}

export interface TrackSummary {
  mode: 'reps' | 'hold';
  reps: number;
  full: number;
  partial: number;
  holdSec: number;
  quality: number | null;
  faults: Record<string, number>;
  reps_detail: RepRecord[];
}

export interface TrackerOptions {
  romFactor?: number;
  holdTarget?: number;
  onRep?: (rep: RepRecord) => void;
  onCue?: (cue: string) => void;
  side?: Side | null;
  partialMin?: number | boolean | undefined;
}

interface Snap {
  t: number;
  L: number;
  R: number;
  checks: Record<string, number>;
  leg?: number;
  v3?: Vec3 | null;
}

interface Base {
  L: number;
  R: number;
  checks: Record<string, number>;
}

interface Prog {
  pr: number;
  from: number;
  to: number;
  d?: number;
}

const noop = (): void => undefined;

export class Tracker {
  forceSide: Side | null;
  ex: TrackedExercise;
  mode: 'reps' | 'hold';
  spec: TrackSpec;
  rom: number;
  holdTarget: number;
  pMin: number;
  partialRun: number;
  onRep: (rep: RepRecord) => void;
  onCue: (cue: string) => void;
  calib: Snap[];
  base: Base | null;
  side: Side | null;
  reps: number;
  full: number;
  partial: number;
  repLog: RepRecord[];
  state: string;
  peak: number;
  p: number;
  topSince: number;
  repStart: number;
  repFaults: Set<string>;
  violation: Record<string, number>;
  holdSec: number;
  lastT: number;
  worstFrame: unknown;
  faultCount: Record<string, number>;
  lastChecks: CheckReading[];
  repWorst: Record<string, CheckReading>;
  peakVal: number | null;
  ckHist: Record<string, number[]>;
  // état interne, initialisé au fil du mouvement
  calibBest: { sd: number; win: Snap[] } | null = null;
  calibT0 = 0;
  guardMs = 0;
  guardT: number | null = null;
  legLen0: number | undefined = undefined;
  noiseP = 0;
  base3: Vec3 | null = null;
  tilt3: number | null = null;
  u = 0;
  lowT = 0;
  q: number | null = null;
  lowAcc = 0;
  lowQ: number | null = null;
  p0: number | null = null;
  restT = 0;
  floor: number | null = null;
  peakU = 0;
  moveStart = 0;
  highMs = 0;
  topOk = false;
  lowStart = 0;
  lowPts: [number, number][] = [];
  lowMid = 0;
  voided = 0;

  constructor(
    ex: TrackedExercise,
    planeKey: string,
    { romFactor = 1, holdTarget = 0, onRep = noop, onCue = noop, side = null, partialMin }: TrackerOptions = {},
  ) {
    this.forceSide = side; // 'L' | 'R' : côté travaillé choisi par le patient
    this.ex = ex;
    this.mode = ex.track.mode;
    this.spec = ex.track.planes[planeKey] as TrackSpec;
    this.rom = romFactor;
    this.holdTarget = holdTarget;
    this.pMin = partialMinFor(ex, this.spec, partialMin);
    this.partialRun = 0;
    this.onRep = onRep;
    this.onCue = onCue;
    this.calib = [];
    this.base = null;
    this.side = null;
    this.reps = 0;
    this.full = 0;
    this.partial = 0;
    this.repLog = [];
    this.state = 'rest';
    this.peak = 0;
    this.p = 0;
    this.topSince = 0;
    this.repStart = 0;
    this.repFaults = new Set();
    this.violation = {};
    this.holdSec = 0;
    this.lastT = 0;
    this.worstFrame = null;
    this.faultCount = {};
    this.lastChecks = [];
    this.repWorst = {};
    this.peakVal = null;
    this.ckHist = {};
  }

  get calibrated(): boolean {
    return !!this.base;
  }

  valueFor(p: PoseInput, side: SideArg): number {
    const s = this.spec;
    let v = metric(s.metric, p, side, { both: s.both, legLen0: this.legLen0 });
    if (s.abs) v = Math.abs(v);
    return v;
  }

  update(input: PoseInput, t: number): TrackStatus {
    const p = input as Frame;
    const dt = this.lastT ? Math.min(0.2, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    const s = this.spec;
    if (!this.side) this.side = this.forceSide || (p.hand ? 'R' : visibleSide(p));

    // Calibration : ~0,6 s immobile en position de départ.
    // Fenêtres mesurées en TEMPS (et non en nombre d'images) : même comportement à 30 images/s (ordinateur) qu'à 10–18
    // analyses/s (téléphone) — avant, 18 images à 10/s faisaient attendre 1,8 s et l'arrêt entre deux répétitions n'était plus vu.
    if (!this.base) {
      // position de départ exigée (« guard », ex. main ouverte) : pas de « zéro » pris sur un poing fermé
      if (s.guard) {
        const gv = metric(s.guard.m, p, this.side);
        if ((!isNil(s.guard.min) && gv < s.guard.min) || (!isNil(s.guard.max) && gv > s.guard.max)) {
          this.calib = [];
          this.calibBest = null;
          this.calibT0 = 0;
          this.guardMs = this.guardMs + dt * 1000;
          return { phase: 'calibrating', progress: 0, reps: 0, holdSec: 0, guard: this.guardMs >= 400 };
        }
        this.guardMs = 0;
      }
      const snap: Snap = { t, L: this.valueFor(p, 'L'), R: this.valueFor(p, 'R'), checks: {} };
      if (!this.calibT0) this.calibT0 = t;
      for (const ck of s.checks || []) if (ck.rel) snap.checks[ck.m] = metric(ck.m, p, this.side);
      if (!p.hand) snap.leg = metric('legLen', p, null);
      else snap.v3 = handDir3(s.metric, p); // direction 3D de départ (main filmée de biais)
      this.calib.push(snap);
      // départ immobile : les 18 dernières images doivent être stables (sinon le « zéro » serait pris en plein mouvement) ;
      // après ~4 s sans stabilité, on calibre quand même sur les dernières images
      // fenêtre glissante la plus courte qui couvre ≥ 0,54 s avec ≥ 8 mesures (= 18 images à 30 images/s, comme avant)
      while (this.calib.length > 8 && t - (this.calib[1] as Snap).t >= 540) this.calib.shift();
      const full = this.calib.length >= 8 && t - (this.calib[0] as Snap).t >= 540; // fenêtre pleine : ≥ 0,54 s et ≥ 8 mesures
      const late = t - this.calibT0 > 1450; // ~1,5 s sans stabilité
      const tol =
        s.calibTol ??
        (this.mode === 'hold'
          ? Math.abs((s.max ?? 0) - (s.min ?? 0)) * 0.5 || 10
          : s.rel
            ? Math.abs(s.delta as number) * 0.22
            : Math.abs((s.to ?? 0) - (s.from ?? 0)) * 0.15 || 10);
      // stabilité = écart-type (robuste au tremblement des points, contrairement à l'écart max − min)
      const sd = (k: Side): number => {
        let v = this.calib.map((x) => x[k]).filter(Number.isFinite);
        if (!v.length) return NaN;
        if (s.angular) {
          const r = v[0] as number;
          v = v.map((x) => ((x - r + 540) % 360) - 180);
        }
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
      };
      if (full) {
        const d = sd('L');
        if (!this.calibBest || d < this.calibBest.sd) this.calibBest = { sd: d, win: this.calib.slice() };
      }
      const stable = full && (!Number.isFinite(sd('L')) || sd('L') * 2 <= tol);
      // sans moment parfaitement immobile : fenêtre la plus stable des ~1,5 premières secondes (le patient est en position de départ)
      if (full && !stable && late && this.calibBest) this.calib = this.calibBest.win;
      if (full && (stable || late)) {
        const avg = (f: (x: Snap) => number): number => this.calib.reduce((a, x) => a + f(x), 0) / this.calib.length;
        // angles : moyenne circulaire (179° et −179° → 180°, pas 0°)
        const cavg = (f: (x: Snap) => number): number =>
          deg(
            Math.atan2(
              avg((x) => Math.sin(f(x) / 57.29578)),
              avg((x) => Math.cos(f(x) / 57.29578)),
            ),
          );
        const A = s.angular ? cavg : avg;
        // longueur de jambe au départ (référence d'échelle de « hipDrop ») : la base est recalculée avec cette échelle
        if (s.metric === 'hipDrop') {
          const leg0 = avg((x) => x.leg as number);
          this.legLen0 = leg0;
          this.calib = this.calib.map((x) => ({
            ...x,
            L: (x.L * (x.leg as number)) / leg0,
            R: (x.R * (x.leg as number)) / leg0,
          }));
        }
        const base: Base = { L: A((x) => x.L), R: A((x) => x.R), checks: {} };
        this.base = base;
        // tremblement mesuré au repos (en fraction de l'amplitude visée) : lissage adapté à la caméra et à la lumière
        const span = s.rel ? Math.abs(s.delta as number) * this.rom : Math.abs((s.to ?? 0) - (s.from ?? 0)) * this.rom;
        const sdv = sd(this.side || 'L');
        this.noiseP = span && Number.isFinite(sdv) ? sdv / span : 0;
        for (const ck of s.checks || []) if (ck.rel) base.checks[ck.m] = avg((x) => x.checks[ck.m] as number);
        const v3 = this.calib.map((x) => x.v3).filter((v): v is Vec3 => !!v);
        if (v3.length >= this.calib.length / 2)
          this.base3 = unit3({
            x: v3.reduce((a, v) => a + v.x, 0),
            y: v3.reduce((a, v) => a + v.y, 0),
            z: v3.reduce((a, v) => a + v.z, 0),
          });
      }
      return { phase: 'calibrating', progress: 0, reps: 0, holdSec: 0 };
    }

    const base = this.base;
    // Choix du côté : 'auto' = côté qui bouge le plus, sinon côté le plus visible
    let side = this.side;
    let v: number;
    // main : angle 3D entre la direction de départ et la direction actuelle (corrige une main filmée de biais)
    const cur3 = this.base3 ? handDir3(s.metric, p) : null;
    const a3 = cur3 && this.base3 ? angle3(this.base3, cur3) : null;
    this.tilt3 = a3;
    const prog = (val: number, sd: Side): Prog => {
      if (s.rel && (s.angular || s.absRel)) {
        // écart à la position de départ ; angulaire : ramené entre −180 et 180 ; absRel : dans un sens ou dans l'autre
        let d = val - base[sd];
        if (s.angular) {
          d = ((d + 540) % 360) - 180;
          if (!isNil(a3)) d = tiltCorrect(d, a3);
        }
        if (s.absRel) d = Math.abs(d);
        const span = (s.absRel ? Math.abs(s.delta as number) : (s.delta as number)) * this.rom;
        return { pr: d / (span || 1), from: 0, to: span, d };
      }
      const from = s.rel ? base[sd] : (s.from as number);
      const to = s.rel
        ? base[sd] + (s.delta as number) * this.rom
        : (s.from as number) + ((s.to as number) - (s.from as number)) * this.rom;
      return { pr: (val - from) / (to - from || 1), from, to };
    };
    if (s.side === 'auto' && !this.forceSide) {
      const vL = this.valueFor(p, 'L'),
        vR = this.valueFor(p, 'R');
      const a = prog(vL, 'L').pr,
        b = prog(vR, 'R').pr;
      side = a >= b ? 'L' : 'R';
      v = side === 'L' ? vL : vR;
    } else v = this.valueFor(p, side);
    const sideNow = side as Side;

    // Contrôles de qualité
    const faults: string[] = [],
      checksNow: CheckReading[] = [];
    for (const ck of s.checks || []) {
      let m = metric(ck.m, p, s.both && ck.m === 'kneeValgus' ? null : sideNow);
      if (ck.rel) m -= base.checks[ck.m] ?? 0;
      if (ck.abs) m = Math.abs(m);
      // médiane glissante (5 images) : un point qui saute une image ne déclenche pas de faute
      const hist = (this.ckHist[ck.cue + ck.m] = (this.ckHist[ck.cue + ck.m] || [])
        .concat(Number.isFinite(m) ? [m] : [])
        .slice(-5));
      if (hist.length) m = hist.slice().sort((x, y) => x - y)[hist.length >> 1] as number;
      const bad = (!isNil(ck.max) && m > ck.max) || (!isNil(ck.min) && m < ck.min);
      const active = this.mode === 'hold' || this.state !== 'rest';
      checksNow.push({
        cue: ck.cue,
        metric: ck.m,
        value: +m.toFixed(!isNil(ck.max) && Math.abs(ck.max) < 2 ? 3 : 1),
        limit: ck.max ?? ck.min,
        kind: !isNil(ck.max) ? 'max' : 'min',
        relative: !!ck.rel,
        bad,
      });
      if (active) {
        const w = this.repWorst[ck.cue];
        const worse = !w || (!isNil(ck.max) ? m > w.value : m < w.value);
        if (worse)
          this.repWorst[ck.cue] = {
            cue: ck.cue,
            metric: ck.m,
            value: +m.toFixed(3),
            limit: ck.max ?? ck.min,
            kind: !isNil(ck.max) ? 'max' : 'min',
            relative: !!ck.rel,
          };
      }
      this.violation[ck.cue] = bad && active ? (this.violation[ck.cue] || 0) + dt : 0;
      if ((this.violation[ck.cue] as number) >= 0.35) faults.push(ck.cue);
    }
    for (const f of faults) {
      this.repFaults.add(f);
      this.onCue(f);
    }
    this.lastChecks = checksNow;

    if (this.mode === 'hold') {
      if (s.rel) v = prog(v, sideNow).d ?? v - base[sideNow]; // maintien relatif : écart à la position de départ
      const ok = v >= (s.min as number) && v <= (s.max as number) && faults.length === 0;
      if (ok) this.holdSec += dt;
      else if (this.holdSec > 0.5 && !faults.length) this.onCue('holdIt');
      for (const f of faults) this.faultCount[f] = (this.faultCount[f] || 0) + dt;
      return {
        phase: ok ? 'holding' : 'adjust',
        value: v,
        side: sideNow,
        progress: ok ? 1 : 0,
        holdSec: this.holdSec,
        faults,
        checks: checksNow,
        range: [s.min, s.max],
      };
    }

    // Mode répétitions
    // Condition à respecter pendant toute la répétition (« guard », ex. opposition du pouce : la main reste ouverte, hClose ≥ 1,15).
    // Un poing fermé amène le bout du pouce à côté des doigts repliés sans contact pulpe à pulpe : la mesure seule le prendrait
    // pour une opposition. Une répétition pendant laquelle (ou juste avant laquelle) la condition n'est pas respectée ne compte pas.
    if (s.guard) {
      const gv = metric(s.guard.m, p, sideNow);
      const off = (!isNil(s.guard.min) && gv < s.guard.min) || (!isNil(s.guard.max) && gv > s.guard.max);
      if (off) {
        this.guardT = t;
        this.guardMs = this.guardMs + dt * 1000;
      } else this.guardMs = 0;
    }
    const { pr, to, d: dv } = prog(v, sideNow);
    if (!isNil(dv)) v = dv; // écart à la position de départ (degrés ou fraction) : c'est ce que voient le patient et l'IA
    // lissage dans le temps (≈ 0,12 s) : le tremblement des points ne crée ni fausse répétition ni fausse amplitude
    let tau = s.smooth ?? ((s.minRepSec || 0) >= 2 || s.holdTop ? 0.16 : 0.12); // mouvements lents : lissage un peu plus fort
    if (this.noiseP > 0.12) tau = Math.min(0.35, (tau * this.noiseP) / 0.12); // points qui tremblent beaucoup : lissage plus fort
    const a = dt ? 1 - Math.exp(-dt / tau) : 0.45;
    this.p = this.p + (Math.max(-0.5, Math.min(1.25, pr)) - this.p) * a; // au-delà de 125 % : aucune information utile (et retour plus rapide)
    this.u = this.u + (Math.max(-0.5, Math.min(1.5, pr)) - this.u) * a; // même lissage, borné à 150 % (sommet réel d'un contact franc)
    const P = this.p,
      holdTop = s.holdTop || 0;
    if (s.rel && this.state === 'rest') {
      if (P < -0.35) {
        this.lowT = this.lowT || t;
        if (t - this.lowT > 1500) {
          base[sideNow] =
            base[sideNow] + pr * (s.absRel ? Math.abs(s.delta as number) : (s.delta as number)) * this.rom;
          if (cur3) this.base3 = cur3;
          this.p = 0;
          this.lowT = 0;
        }
      } else this.lowT = 0;
      // Doigts / pouce : « zéro » pris main à demi fermée (série lancée pendant un contact) → la main ouverte se retrouve bien
      // en dessous du départ à chaque cycle, mais jamais 1,5 s d'affilée quand les contacts s'enchaînent, et rien ne compte.
      // On cumule donc ce temps d'un cycle à l'autre (remis à zéro dès qu'une répétition compte) et on reprend le zéro à la
      // position la plus ouverte atteinte (valeur lissée, non bornée).
      if (FINGER_METRICS.has(s.metric) && !s.absRel) {
        const q: number = this.q === null ? pr : this.q + (pr - this.q) * a;
        this.q = q;
        if (P < -0.35 && q < -0.35) {
          this.lowAcc = this.lowAcc + dt * 1000;
          this.lowQ = Math.min(this.lowQ ?? 0, q);
        }
        if (this.lowAcc > 1500) {
          const lowQ = this.lowQ ?? 0;
          base[sideNow] = base[sideNow] + lowQ * (s.delta as number) * this.rom;
          if (cur3) this.base3 = cur3;
          this.p = Math.max(0, Math.min(1.25, q - lowQ));
          this.q = null;
          this.lowT = 0;
          this.lowAcc = 0;
          this.lowQ = null;
        }
      }
    }
    if (this.p0 === null) {
      // progression de la position de départ réelle (chaque patient part d'un angle différent)
      const b = Math.max(prog(base.L, 'L').pr, prog(base.R, 'R').pr); // 'auto' : le côté au repos fixe le plancher
      this.p0 = s.rel ? 0 : Math.max(0, Math.min(0.45, s.side === 'auto' ? b : prog(base[sideNow], sideNow).pr));
    }
    const p0 = this.p0;
    const span0 = 1 - p0;
    const startT = p0 + 0.28 * span0,
      endT = p0 + 0.14 * span0;
    if (this.state === 'rest' && P <= p0 + 0.08 * span0) this.restT = t; // dernier instant au repos
    // Doigts / pouce : répétition déjà comptée à la redescente, sans retour complet au départ (voir « again » plus bas) →
    // la suivante ne démarre que si le mouvement REPART nettement (≥ 22 % au-dessus du point le plus bas atteint) :
    // une main qui se rouvre lentement, ou qui reste à mi-chemin, ne crée pas de répétition.
    if (this.state === 'rest' && this.floor !== null) {
      if (P < endT) this.floor = null;
      else if (P < this.floor) {
        this.floor = P;
        this.restT = t;
      }
    }
    if (this.state === 'rest' && P > startT && (this.floor === null || P >= this.floor + AGAIN_RISE)) {
      this.floor = null;
      this.q = null;
      this.peakU = this.u;
      this.state = 'moving';
      this.peak = P;
      this.moveStart = t;
      this.highMs = 0;
      this.repStart = Math.max(this.restT || t, t - 4000);
      this.repFaults = new Set();
      this.topSince = 0;
      this.repWorst = {};
      this.peakVal = v;
    }
    if (this.state === 'moving') {
      if (P > this.peak) {
        this.peak = P;
        this.peakVal = v;
      }
      if (this.u > this.peakU) this.peakU = this.u;
      if (P >= this.pMin) this.highMs = this.highMs + dt * 1000;
      // haut du mouvement : 85 % de la cible ; maintien toléré à 80 % (petits tremblements pendant la tenue)
      if (P >= TOP) {
        if (!this.topSince) this.topSince = t;
      } else if (this.topSince && P < TOP - 0.1 && !this.topOk) {
        if (holdTop && (t - this.topSince) / 1000 < holdTop * 0.8) this.onCue('holdIt');
        this.topSince = 0;
      }
      if (this.topSince && holdTop && (t - this.topSince) / 1000 >= holdTop * 0.8) this.topOk = true; // 80 % du temps de maintien
      // retour presque au départ puis immobile ≥ 0,6 s (le patient ne revient jamais exactement à sa position initiale) :
      // la répétition est terminée et le point de départ est ajusté (dérive de posture au fil de la série)
      let settled = false;
      if (this.peak >= this.pMin && P < (this.peak >= FULL_MIN ? 0.5 : 0.65 * this.peak)) {
        if (!this.lowStart) {
          this.lowStart = t;
          this.lowPts = [];
        }
        this.lowPts.push([t, P]);
        while (this.lowPts.length && t - (this.lowPts[0] as [number, number])[0] > 700) this.lowPts.shift();
        if (t - this.lowStart > 600 && this.lowPts.length >= 4) {
          // pente (régression linéaire) : immobile = |pente| < 0,2 / s, même si les points tremblent ; une descente lente n'est pas un arrêt
          const n = this.lowPts.length,
            mt = this.lowPts.reduce((acc, q) => acc + q[0], 0) / n,
            mp = this.lowPts.reduce((acc, q) => acc + q[1], 0) / n;
          const slope =
            (this.lowPts.reduce((acc, q) => acc + (q[0] - mt) * (q[1] - mp), 0) /
              (this.lowPts.reduce((acc, q) => acc + (q[0] - mt) ** 2, 0) || 1)) *
            1000;
          if (Math.abs(slope) < 0.2) {
            settled = true;
            this.lowMid = mp;
          }
        }
        if (settled) {
          if (s.rel && !s.absRel) {
            base[sideNow] += this.lowMid * (s.delta as number) * this.rom;
            if (cur3) this.base3 = cur3;
          }
          if (s.rel && !s.absRel) this.p = 0;
        }
      } else this.lowStart = 0;
      // Doigts / pouce (opposition, poing, ouverture du pouce) : le patient enchaîne les contacts en rouvrant la main plus ou
      // moins — rarement jusqu'à la position de départ exacte, et le lissage retarde encore le retour. Attendre le retour à
      // 14 % fusionnait plusieurs contacts en une seule répétition (vidéo d'un patient : 2 comptées sur 7). La répétition est
      // donc terminée dès que le mouvement est redescendu à 55 % de son sommet (nette réouverture). Sommet mesuré jusqu'à 150 % :
      // un contact franc dépasse largement la cible, et rouvrir à mi-course est déjà un nouveau départ.
      const again = s.again ?? (FINGER_METRICS.has(s.metric) ? AGAIN_DROP : 0);
      const reopened = again > 0 && this.peak >= this.pMin && P <= again * Math.max(this.peak, this.peakU);
      if (P < endT || settled || reopened) {
        this.floor = reopened && !settled && P >= endT ? P : null;
        this.lowStart = 0;
        const dur = (t - this.repStart) / 1000;
        const reachedTop = this.peak >= TOP;
        const heldOk = !holdTop || this.topOk;
        // une vraie répétition : au moins 60 % de la cible et 0,6 s (sinon : tremblement ou faux départ, ignoré)
        const guarded = this.guardT !== null && this.guardT >= this.moveStart - 300;
        if (guarded) this.voided = this.voided + 1;
        if (!guarded && this.peak >= this.pMin && this.highMs >= 150 && dur >= 0.6 && t - this.moveStart >= 450) {
          // ≥ 0,45 s hors de la zone de repos : pas un sursaut des points
          const full = reachedTop && heldOk;
          const fl = [...this.repFaults];
          const minSec = s.minRepSec || 1.0;
          if (dur < minSec * 0.75) {
            fl.push('slow');
            this.onCue('slow');
          }
          // « depth » : à la 1re partielle puis une sur trois (pas de harcèlement) ; l'écart au sommet remet le compteur à zéro
          if (!reachedTop) {
            if (this.partialRun++ % 3 === 0) this.onCue('depth');
          } else {
            this.partialRun = 0;
            if (!heldOk) this.onCue('holdIt');
          }
          const quality = Math.max(0, Math.min(1, 1 - 0.25 * new Set(fl).size - (full ? 0 : 0.3)));
          this.reps++;
          if (full) this.full++;
          else this.partial++;
          this.lowAcc = 0;
          this.lowQ = null;
          for (const f of fl) this.faultCount[f] = (this.faultCount[f] || 0) + 1;
          const rep: RepRecord = {
            n: this.reps,
            full,
            dur: +dur.toFixed(1),
            faults: fl,
            quality: +quality.toFixed(2),
            peak: +this.peak.toFixed(2),
            meas: {
              metric: s.metric,
              peakValue: +Number(this.peakVal).toFixed(1),
              targetValue: +to.toFixed(1),
              romPct: Math.round(this.peak * 100),
              minRepSec: s.minRepSec || 1.0,
              checks: Object.values(this.repWorst),
            },
          };
          this.repLog.push(rep);
          this.onRep(rep);
        }
        this.state = 'rest';
        this.peak = 0;
        this.topSince = 0;
        this.topOk = false;
      }
    }
    return {
      phase: this.state,
      value: v,
      target: to,
      side: sideNow,
      progress: Math.max(0, Math.min(1, P)),
      reps: this.reps,
      faults,
      guard: this.guardMs >= 400,
    };
  }

  // Répétition jugée « mauvais mouvement » par le contrôle de la démonstration : elle ne compte pas comme complète
  flagRep(fault: string): void {
    const r = this.repLog[this.repLog.length - 1];
    if (!r || r.faults.includes(fault)) return;
    r.faults.push(fault);
    this.faultCount[fault] = (this.faultCount[fault] || 0) + 1;
    if (r.full) {
      r.full = false;
      this.full--;
      this.partial++;
    }
    r.quality = Math.max(0, +(r.quality - 0.4).toFixed(2));
  }
  summary(): TrackSummary {
    const q = this.repLog.length ? this.repLog.reduce((a, r) => a + r.quality, 0) / this.repLog.length : null;
    return {
      mode: this.mode,
      reps: this.reps,
      full: this.full,
      partial: this.partial,
      holdSec: Math.round(this.holdSec),
      quality: q === null ? (this.mode === 'hold' && this.holdSec > 0 ? 0.85 : null) : +q.toFixed(2),
      faults: this.faultCount,
      reps_detail: this.repLog,
    };
  }
}
