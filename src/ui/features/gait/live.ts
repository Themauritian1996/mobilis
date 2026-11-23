/**
 * Volet « marche » — vérifications en direct pendant la capture (fonctions pures, testées dans live.test.ts) :
 * placement par la pose (corps entier, pieds, centrage, orientation), station debout immobile, mesure de la fréquence
 * d'images réelle, tampon de trames de pose (AUCUNE vidéo), compteur de cycles en direct et règles de fin automatique.
 */
import { prepareRecording } from '../../../domains/gait/index.ts';
import {
  assessPlacement,
  type PlacementIssue,
  type PlacementResult,
} from '../../../vision/placement.ts';
import type { Landmark } from '../../../vision/index.ts';
import type { GaitCycle, GaitPatientInput, GaitPoseFrame, GaitView, Side } from '../../../domains/gait/index.ts';
import { isSagittalView, nearSide } from './model.ts';

/** Fréquence d'images : 60 i/s recommandés, 30 i/s minimum (Hii 2023 : événements ±20–30 ms à 25 i/s). */
export const FPS_RECOMMENDED = 60;
export const FPS_MIN = 30;

const VIS = 0.5;
const vis = (l: Landmark | undefined): number => (l ? (l.visibility ?? 1) : 0);

export type FpsLevel = 'good' | 'ok' | 'low';
/** ≥ 50 i/s : bon (proche de 60) ; 30–50 : acceptable ; < 30 : insuffisant (refaire avec une autre caméra ou résolution). */
export function fpsLevel(fps: number): FpsLevel {
  return fps >= 50 ? 'good' : fps >= FPS_MIN ? 'ok' : 'low';
}

/** Mesure de la fréquence d'images réelle (trames traitées par seconde) sur une fenêtre glissante. */
export class FpsMeter {
  private readonly times: number[] = [];
  private readonly windowMs: number;
  constructor(windowMs = 2000) {
    this.windowMs = windowMs;
  }
  push(tMs: number): void {
    this.times.push(tMs);
    while (this.times.length > 2 && tMs - (this.times[0] as number) > this.windowMs) this.times.shift();
  }
  get fps(): number {
    const n = this.times.length;
    if (n < 3) return 0;
    const span = (this.times[n - 1] as number) - (this.times[0] as number);
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }
  reset(): void {
    this.times.length = 0;
  }
}

/** Fréquence moyenne d'un enregistrement. */
export function averageFps(frames: readonly { readonly t: number }[]): number {
  if (frames.length < 2) return 0;
  const span = (frames[frames.length - 1] as { t: number }).t - (frames[0] as { t: number }).t;
  return span > 0 ? ((frames.length - 1) * 1000) / span : 0;
}

// ---------------------------------------------------------------------------------------------------- Placement
export type CueKey =
  | 'noBody'
  | 'moveBack'
  | 'moveCloser'
  | 'moveLeft'
  | 'moveRight'
  | 'showBody'
  | 'feet'
  | 'turnSide'
  | 'turnFront'
  | 'phoneLower'
  | 'phoneHigher'
  | 'straightenPhone'
  | 'phoneUpright'
  | 'moreLight'
  | 'backlight'
  | 'ok';

export interface LiveCheck {
  /** Corps entier visible (tête → pieds). */
  readonly fullBody: boolean;
  readonly feetVisible: boolean;
  readonly centered: boolean;
  readonly orientationOk: boolean;
  readonly ok: boolean;
  /** Consigne prioritaire (ou 'ok'). */
  readonly cue: CueKey;
  readonly issues: readonly string[];
  readonly raw: PlacementResult;
}

const FEET = { L: [29, 31], R: [30, 32] } as const;

/** Pieds (talon et orteil) visibles du côté demandé. */
export function feetVisible(lm: readonly Landmark[] | null | undefined, sides: readonly Side[]): boolean {
  if (!lm) return false;
  return sides.every((s) => FEET[s].every((i) => vis(lm[i]) >= VIS));
}

/** Taille minimale du corps dans l'image pour la station de départ des vues frontale/postérieure (patient éloigné). */
const FRONT_START_MIN = 0.3;

export interface LiveCheckInput {
  readonly lm: readonly Landmark[] | null;
  readonly view: GaitView;
  readonly frameW: number;
  readonly frameH: number;
  readonly mirror?: boolean;
  readonly luma?: { mean: number; center: number; edges: number } | null;
  readonly tilt?: { beta?: number | null; gamma?: number | null } | null;
}

/**
 * Vérification de placement par la pose. Réutilise `assessPlacement` (vision/placement.ts) : plan de profil ou de face,
 * corps entier ; ajoute la visibilité des pieds. Pour les vues frontale/postérieure, le patient part du fond du
 * corridor : la taille minimale dans l'image est assouplie (le calcul d'échelle suit l'approche par la longueur du tronc).
 * Le centrage horizontal n'est exigé que pour ces deux vues (axe de marche) ; en vue latérale le patient part d'un bord.
 */
export function liveCheck(i: LiveCheckInput): LiveCheck {
  const sag = isSagittalView(i.view);
  const near = nearSide(i.view);
  const raw = assessPlacement({
    kind: 'body',
    plane: sag ? 'side' : 'front',
    side: near,
    scope: 'full',
    lm: i.lm,
    frameW: i.frameW,
    frameH: i.frameH,
    mirror: i.mirror ?? false,
    luma: i.luma ?? null,
    tilt: i.tilt ?? null,
  });
  const issues: PlacementIssue[] = raw.issues.filter((x) => {
    if (sag && (x.key === 'moveLeft' || x.key === 'moveRight')) return false;
    if (!sag && x.key === 'moveCloser' && (raw.info.size ?? 0) >= FRONT_START_MIN) return false;
    return true;
  });
  const feetOk = feetVisible(i.lm, sag && near ? [near] : ['L', 'R']);
  const keys: string[] = issues.map((x) => x.key);
  if (i.lm && !feetOk && !keys.includes('showBody') && !keys.includes('noBody') && !keys.includes('moveBack'))
    keys.push('feet');
  const PRIORITY: readonly string[] = [
    'noBody',
    'moveBack',
    'moveCloser',
    'showBody',
    'feet',
    'turnSide',
    'turnFront',
    'moveLeft',
    'moveRight',
    'phoneLower',
    'phoneHigher',
    'straightenPhone',
    'phoneUpright',
    'moreLight',
    'backlight',
  ];
  const first = PRIORITY.find((k) => keys.includes(k));
  const has = (...ks: string[]): boolean => ks.some((k) => keys.includes(k));
  return {
    fullBody: !!i.lm && !has('noBody', 'showBody', 'moveBack'),
    feetVisible: feetOk,
    centered: !has('moveLeft', 'moveRight'),
    orientationOk: !has('turnSide', 'turnFront'),
    ok: keys.length === 0,
    cue: (first ?? 'ok') as CueKey,
    issues: keys,
    raw,
  };
}

// ---------------------------------------------------------------------------------------------------- Géométrie du tronc
export interface TorsoSample {
  readonly cx: number;
  readonly cy: number;
  /** Longueur du tronc (milieu des épaules → milieu des hanches), en hauteurs d'image. */
  readonly torso: number;
}

/** Milieu hanches / épaules en hauteurs d'image (x × rapport largeur/hauteur). */
export function torsoSample(lm: readonly Landmark[], aspect: number): TorsoSample | null {
  const p = [11, 12, 23, 24].map((k) => lm[k]);
  if (p.some((q) => !q || vis(q) < 0.3)) return null;
  const [sl, sr, hl, hr] = p as [Landmark, Landmark, Landmark, Landmark];
  const sx = ((sl.x + sr.x) / 2) * aspect;
  const sy = (sl.y + sr.y) / 2;
  const hx = ((hl.x + hr.x) / 2) * aspect;
  const hy = (hl.y + hr.y) / 2;
  return { cx: hx, cy: hy, torso: Math.hypot(sx - hx, sy - hy) };
}

// ---------------------------------------------------------------------------------------------------- Station debout
export interface StillState {
  readonly still: boolean;
  /** 0–1 : durée d'immobilité / durée requise. */
  readonly progress: number;
}

/**
 * Station debout immobile (calibration par la taille) : le bassin et les deux chevilles ne bougent pas de plus de
 * `maxRange` longueurs de tronc pendant `windowMs`. Un seul passage par trame (aucune fenêtre à reparcourir).
 */
export class StillnessDetector {
  private t0: number | null = null;
  private min: number[] = [];
  private max: number[] = [];
  private readonly windowMs: number;
  private readonly maxRange: number;
  constructor(windowMs = 2000, maxRange = 0.08) {
    this.windowMs = windowMs;
    this.maxRange = maxRange;
  }

  reset(): void {
    this.t0 = null;
    this.min = [];
    this.max = [];
  }

  /** Début de la période d'immobilité en cours (ms), ou null. */
  get since(): number | null {
    return this.t0;
  }

  push(tMs: number, lm: readonly Landmark[] | null, aspect: number, bodyOk = true): StillState {
    const ts = lm && bodyOk ? torsoSample(lm, aspect) : null;
    const an = lm ? [27, 28].map((k) => lm[k]) : [];
    if (!lm || !ts || ts.torso < 1e-3 || an.some((a) => !a || vis(a) < VIS)) {
      this.reset();
      return { still: false, progress: 0 };
    }
    const pts = [ts.cx, ts.cy, ...an.flatMap((a) => [(a as Landmark).x * aspect, (a as Landmark).y])];
    if (this.t0 === null) {
      this.t0 = tMs;
      this.min = [...pts];
      this.max = [...pts];
    } else {
      pts.forEach((v, k) => {
        this.min[k] = Math.min(this.min[k] as number, v);
        this.max[k] = Math.max(this.max[k] as number, v);
      });
      const range = Math.max(...pts.map((_, k) => (this.max[k] as number) - (this.min[k] as number)));
      if (range > this.maxRange * ts.torso) {
        this.t0 = tMs;
        this.min = [...pts];
        this.max = [...pts];
      }
    }
    const progress = Math.min(1, (tMs - (this.t0 as number)) / this.windowMs);
    return { still: progress >= 1, progress };
  }
}

// ---------------------------------------------------------------------------------------------------- Sens de marche
export type DirectionIssue = 'toward' | 'away' | 'sideways' | null;

/**
 * Sens de marche attendu au début du déplacement : vue frontale = le patient se rapproche (tronc qui grandit),
 * postérieure = il s'éloigne (tronc qui rapetisse) ; latérale = il se déplace latéralement dans l'image.
 * `first` : échantillon au début de la marche, `now` : échantillon courant (≥ ~1 s plus tard).
 */
export function walkingDirectionIssue(view: GaitView, first: TorsoSample, now: TorsoSample): DirectionIssue {
  if (view === 'frontal' || view === 'posterior') {
    const ratio = now.torso / first.torso;
    if (view === 'frontal' && ratio < 0.97) return 'toward';
    if (view === 'posterior' && ratio > 1.03) return 'away';
    return null;
  }
  const dx = Math.abs(now.cx - first.cx) / first.torso;
  return dx < 0.15 && Math.abs(now.torso / first.torso - 1) > 0.08 ? 'sideways' : null;
}

// ---------------------------------------------------------------------------------------------------- Tampon de trames
export interface RawLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}
export interface RawWorldLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

const r4 = (v: number): number => Math.round(v * 10000) / 10000;

/** Copie compacte d'une trame de pose (jamais d'image). */
export function toPoseFrame(
  tMs: number,
  lm: readonly RawLandmark[],
  world?: readonly RawWorldLandmark[] | null,
): GaitPoseFrame {
  return {
    t: tMs,
    landmarks: lm.map((l) => ({
      x: r4(l.x),
      y: r4(l.y),
      ...(l.z !== undefined ? { z: r4(l.z) } : {}),
      ...(l.visibility !== undefined ? { visibility: r4(l.visibility) } : {}),
    })),
    ...(world && world.length
      ? {
          worldLandmarks: world.map((l) => ({
            x: r4(l.x),
            y: r4(l.y),
            z: r4(l.z),
            ...(l.visibility !== undefined ? { visibility: r4(l.visibility) } : {}),
          })),
        }
      : {}),
  };
}

/** Rebase les temps (ms depuis la première trame) avant l'analyse. */
export function rebase(frames: readonly GaitPoseFrame[]): GaitPoseFrame[] {
  const t0 = frames[0]?.t ?? 0;
  return frames.map((f) => ({ ...f, t: f.t - t0 }));
}

/** Tampon glissant (pré-enregistrement) : garde les trames des `keepMs` dernières millisecondes. */
export class PreRoll {
  private readonly frames: GaitPoseFrame[] = [];
  private readonly keepMs: number;
  constructor(keepMs = 3000) {
    this.keepMs = keepMs;
  }
  push(f: GaitPoseFrame): void {
    this.frames.push(f);
    while (this.frames.length > 1 && f.t - (this.frames[0] as GaitPoseFrame).t > this.keepMs) this.frames.shift();
  }
  /** Trames depuis `fromMs` (début de l'immobilité) : elles ouvrent l'enregistrement (la station debout calibre l'échelle). */
  since(fromMs: number): GaitPoseFrame[] {
    return this.frames.filter((f) => f.t >= fromMs);
  }
  clear(): void {
    this.frames.length = 0;
  }
}

// ---------------------------------------------------------------------------------------------------- Compteur de cycles
export interface CycleCount {
  readonly L: number;
  readonly R: number;
}

/**
 * Cycles valides détectés jusqu'ici (même détection que l'analyse finale ; appelé environ toutes les 1,5 s).
 * Retourne null si l'enregistrement est encore trop court ou insuffisant pour une détection.
 */
export function countCycles(
  frames: readonly GaitPoseFrame[],
  view: GaitView,
  patient: GaitPatientInput,
  imageAspect: number,
): CycleCount | null {
  if (frames.length < 20) return null;
  let cycles: readonly GaitCycle[];
  try {
    cycles = prepareRecording({ frames, view, patient, options: { imageAspect } }).ctx.cycles;
  } catch {
    return null; // trop peu de données ou taille invalide : pas de compteur
  }
  const n = (s: Side): number => cycles.filter((c) => c.side === s && !c.rejected).length;
  return { L: n('L'), R: n('R') };
}

// ---------------------------------------------------------------------------------------------------- Fin automatique
export type StopReason = 'target' | 'left_frame' | 'stopped' | 'timeout';

export interface StopInput {
  readonly elapsedMs: number;
  readonly cycles: CycleCount | null;
  readonly target: number;
  /** Durée pendant laquelle le corps entier n'est plus visible (ms). */
  readonly lostMs: number;
  /** Durée d'immobilité après le début de la marche (ms). */
  readonly stillMs: number;
}

export const MAX_RECORDING_MS = 45_000;
const MIN_WALK_MS = 4000;

/**
 * Fin automatique : cycles visés atteints des deux côtés (+ une foulée de marge côté engin : on attend un cycle de
 * plus que la cible quand c'est possible n'est pas nécessaire car l'analyse rejette déjà les cycles aberrants) ;
 * ou patient sorti du champ ; ou patient arrêté ; ou durée maximale.
 */
export function stopDecision(i: StopInput): StopReason | null {
  if (i.elapsedMs >= MAX_RECORDING_MS) return 'timeout';
  if (i.elapsedMs < MIN_WALK_MS) return null;
  const c = i.cycles;
  if (c && c.L >= i.target && c.R >= i.target) return 'target';
  if (i.lostMs >= 1500 && c && (c.L > 0 || c.R > 0)) return 'left_frame';
  if (i.lostMs >= 2500) return 'left_frame';
  if (i.stillMs >= 1500 && c && (c.L > 0 || c.R > 0)) return 'stopped';
  return null;
}

// ---------------------------------------------------------------------------------------------------- Consignes vocales et stabilité
/** Anti-répétition des consignes parlées : une même clé pas plus d'une fois par `sameKeyMs`, une consigne à la fois. */
export class CueGate {
  private readonly last = new Map<string, number>();
  private lastAny = -Infinity;
  private readonly sameKeyMs: number;
  private readonly anyMs: number;
  constructor(sameKeyMs = 7000, anyMs = 2200) {
    this.sameKeyMs = sameKeyMs;
    this.anyMs = anyMs;
  }
  offer(key: string, nowMs: number): boolean {
    if (nowMs - this.lastAny < this.anyMs) return false;
    if (nowMs - (this.last.get(key) ?? -Infinity) < this.sameKeyMs) return false;
    this.last.set(key, nowMs);
    this.lastAny = nowMs;
    return true;
  }
  reset(): void {
    this.last.clear();
    this.lastAny = -Infinity;
  }
}

/**
 * Stabilité d'une condition : vraie sans interruption pendant `holdMs` (une coupure plus courte que `graceMs` est
 * ignorée). `progress` va de 0 à 1.
 */
export class HoldGate {
  private since: number | null = null;
  private lastTrue = -Infinity;
  private readonly holdMs: number;
  private readonly graceMs: number;
  constructor(holdMs = 1000, graceMs = 300) {
    this.holdMs = holdMs;
    this.graceMs = graceMs;
  }
  push(ok: boolean, nowMs: number): { progress: number; stable: boolean } {
    if (ok) {
      this.lastTrue = nowMs;
      if (this.since === null) this.since = nowMs;
    } else if (nowMs - this.lastTrue > this.graceMs) this.since = null;
    const progress = this.since === null ? 0 : Math.min(1, (nowMs - this.since) / this.holdMs);
    return { progress, stable: progress >= 1 };
  }
  reset(): void {
    this.since = null;
    this.lastTrue = -Infinity;
  }
}
