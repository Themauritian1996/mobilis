// Estimation de pose 2D sur l'appareil (MediaPipe Pose Landmarker) : chargement du modèle, détection, conversion en
// pixels et dessin du squelette. Les métriques et le compteur de répétitions sont dans rep-tracker.ts.
import { CONFIG } from '../../www/js/config.js';
import { delegates, poseColors } from './overlay.ts';

/** Point normalisé renvoyé par MediaPipe (0–1 dans l'image). */
export interface NormLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** Point en pixels, avec sa visibilité (`v`). */
export interface PxPoint {
  x: number;
  y: number;
  v: number;
}

/** Contrôle d'avancement du chargement (bibliothèque, modèle, prêt). */
export type LoadStatus = 'lib' | 'model' | 'ready';

/** Élément vidéo ou canevas contenant l'image à analyser. */
export type FrameSource = CanvasImageSource & { readonly readyState?: number };

interface PoseResult {
  landmarks?: NormLandmark[][];
}

/** Partie de l'API MediaPipe (chargée dynamiquement) utilisée ici. */
interface PoseLandmarkerLike {
  detectForVideo(src: CanvasImageSource, ts: number): PoseResult | null | undefined;
}

interface MediaPipeModule {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  PoseLandmarker: { createFromOptions(fileset: unknown, options: object): Promise<PoseLandmarkerLike> };
}

let landmarker: PoseLandmarkerLike | null = null;
const noop = (): void => undefined;

export async function loadPose(onStatus: (s: LoadStatus) => void = noop): Promise<PoseLandmarkerLike> {
  if (landmarker) return landmarker;
  onStatus('lib');
  const mp = (await import(/* @vite-ignore */ `${CONFIG.mediapipeBase}/vision_bundle.mjs`)) as MediaPipeModule;
  const fileset = await mp.FilesetResolver.forVisionTasks(`${CONFIG.mediapipeBase}/wasm`);
  onStatus('model');
  let modelAssetPath: string = CONFIG.poseModelRemote;
  try {
    // GET (servi par le cache du service worker hors ligne) ; HEAD n'est pas mis en cache
    const c = typeof caches !== 'undefined' ? await caches.match(CONFIG.poseModelLocal).catch(() => null) : null;
    const r = c || (await fetch(CONFIG.poseModelLocal, { cache: 'force-cache' }));
    if (r.ok) modelAssetPath = CONFIG.poseModelLocal;
  } catch {
    /* pas de modèle local */
  }
  for (const delegate of delegates()) {
    try {
      landmarker = await mp.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      break;
    } catch (e) {
      if (delegate === 'CPU') throw e;
    }
  }
  onStatus('ready');
  return landmarker as PoseLandmarkerLike;
}

/** `src` : élément vidéo ou canevas contenant l'image à analyser. */
export function detect(src: FrameSource, ts: number): NormLandmark[] | null {
  if (!landmarker || (src.readyState !== undefined && src.readyState !== null && src.readyState < 2)) return null;
  const res = landmarker.detectForVideo(src, ts);
  return res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
}

// ---------- Points et utilitaires ----------
const IDX = {
  nose: 0,
  earL: 7,
  earR: 8,
  shL: 11,
  shR: 12,
  elL: 13,
  elR: 14,
  wrL: 15,
  wrR: 16,
  idxL: 19,
  idxR: 20,
  hipL: 23,
  hipR: 24,
  knL: 25,
  knR: 26,
  anL: 27,
  anR: 28,
  heelL: 29,
  heelR: 30,
  ftL: 31,
  ftR: 32,
} as const;

/** Nom d'un point du corps (côté gauche : suffixe L, droit : R). */
export type BodyKey = keyof typeof IDX;
/** Points du corps en pixels, indexés par nom. */
export type BodyPx = Record<BodyKey, PxPoint>;

export const CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
  [7, 8],
] as const satisfies readonly (readonly [number, number])[];

// Convertit en pixels (corrige le rapport largeur/hauteur)
export function toPx(lm: readonly NormLandmark[], w: number, h: number): BodyPx {
  const p = {} as BodyPx;
  for (const k of Object.keys(IDX) as BodyKey[]) {
    const l = lm[IDX[k]] as NormLandmark;
    p[k] = { x: l.x * w, y: l.y * h, v: l.visibility ?? 1 };
  }
  return p;
}

// ---------- Dessin du squelette ----------
// Segment ou point peu visible (caché, hors image, deviné par le modèle) : on ne le dessine pas
export const DRAW_VIS = 0.5;
export const SKELETON_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;

/** Articulation dessinée : indice du point et position en pixels du canevas (miroir compris). */
export interface DrawnJoint {
  i: number;
  x: number;
  y: number;
}

/** lm : points en coordonnées normalisées de l'écran. Retourne les articulations réellement dessinées
 *  ({ i, x, y } en pixels du canevas, miroir compris). */
export function drawSkeleton(
  g: CanvasRenderingContext2D,
  lm: readonly NormLandmark[] | null,
  w: number,
  h: number,
  faultJoints: ReadonlySet<number> = new Set(),
  mirror = false,
  keep = false,
): DrawnJoint[] | null {
  if (!keep) g.clearRect(0, 0, w, h);
  if (!lm) return null;
  const X = (l: NormLandmark): number => (mirror ? (1 - l.x) * w : l.x * w);
  const seen = (l: NormLandmark | undefined): l is NormLandmark => !!l && (l.visibility ?? 1) >= DRAW_VIS;
  g.lineCap = 'round';
  const { ok, bad } = poseColors();
  g.lineWidth = Math.max(3, w / 160);
  for (const [a, b] of CONNECTIONS) {
    const A = lm[a],
      B = lm[b];
    if (!seen(A) || !seen(B)) continue;
    g.strokeStyle = faultJoints.has(a) || faultJoints.has(b) ? bad : ok;
    g.beginPath();
    g.moveTo(X(A), A.y * h);
    g.lineTo(X(B), B.y * h);
    g.stroke();
  }
  const drawn: DrawnJoint[] = [];
  for (const i of SKELETON_JOINTS) {
    const l = lm[i];
    if (!seen(l)) continue;
    g.fillStyle = faultJoints.has(i) ? bad : '#ffffff';
    g.beginPath();
    g.arc(X(l), l.y * h, Math.max(3, w / 140), 0, Math.PI * 2);
    g.fill();
    drawn.push({ i, x: X(l), y: l.y * h });
  }
  return drawn;
}

// Articulations à colorer selon la faute détectée
export const FAULT_JOINTS = {
  valgus: [25, 26],
  trunk: [11, 12, 23, 24],
  trunkSway: [11, 12, 23, 24],
  arch: [23, 24],
  sideLean: [11, 12],
  shrug: [11, 12],
  symmetry: [13, 14],
  pelvis: [23, 24],
  elbowSide: [13, 14],
  elbowPin: [13, 14],
  kneeStraight: [25, 26],
  heelDown: [29, 30],
  bodyLine: [23, 24],
  headTilt: [0],
  hinge: [25, 26],
} as const satisfies Readonly<Record<string, readonly number[]>>;
