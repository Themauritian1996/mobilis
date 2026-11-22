// Suivi de la main sur l'appareil (MediaPipe Hand Landmarker, 21 points par main) pour les exercices du poignet,
// de la main et du pouce : mouvement du poignet, rotation de l'avant-bras, fermeture du poing, opposition du pouce.
// La vidéo ne quitte jamais le téléphone.
import { CONFIG } from '../../www/js/config.js';
import { delegates, poseColors } from './overlay.ts';

/** Point de la main normalisé (0–1 dans l'image) ou 3D « monde » en mètres. */
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

/** Main réelle du patient : gauche ou droite. */
export type HandSide = 'L' | 'R';

/** Une main détectée. */
export interface DetectedHand {
  /** 21 points normalisés. */
  lm: HandLandmark[];
  /** 21 points 3D en mètres (centrés sur la main), ou null. */
  world: HandLandmark[] | null;
  /** Main réelle du patient, ou null si le modèle n'a pas d'étiquette. */
  label: HandSide | null;
  /** Confiance de l'étiquette. */
  score: number;
}

interface Handedness {
  categoryName?: string;
  score?: number;
}

/** Résultat brut de MediaPipe (partie utilisée). */
export interface HandResult {
  landmarks?: HandLandmark[][];
  handedness?: Handedness[][];
  handednesses?: Handedness[][];
  worldLandmarks?: HandLandmark[][];
}

/** Élément vidéo ou canevas contenant l'image à analyser. */
export type HandFrameSource = CanvasImageSource & { readonly readyState?: number };

interface HandLandmarkerLike {
  detectForVideo(src: CanvasImageSource, ts: number): HandResult | null | undefined;
}

interface MediaPipeModule {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  HandLandmarker: { createFromOptions(fileset: unknown, options: object): Promise<HandLandmarkerLike> };
}

let hands: HandLandmarkerLike | null = null;
const noop = (): void => undefined;

export async function loadHands(onStatus: (s: 'lib' | 'model' | 'ready') => void = noop): Promise<HandLandmarkerLike> {
  if (hands) return hands;
  onStatus('lib');
  const mp = (await import(/* @vite-ignore */ `${CONFIG.mediapipeBase}/vision_bundle.mjs`)) as MediaPipeModule;
  const fileset = await mp.FilesetResolver.forVisionTasks(`${CONFIG.mediapipeBase}/wasm`);
  onStatus('model');
  let modelAssetPath: string = CONFIG.handModelRemote;
  try {
    // GET (servi par le cache du service worker hors ligne) ; HEAD n'est pas mis en cache
    const c = typeof caches !== 'undefined' ? await caches.match(CONFIG.handModelLocal).catch(() => null) : null;
    const r = c || (await fetch(CONFIG.handModelLocal, { cache: 'force-cache' }));
    if (r.ok) modelAssetPath = CONFIG.handModelLocal;
  } catch {
    /* pas de modèle local */
  }
  for (const delegate of delegates()) {
    try {
      hands = await mp.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      break;
    } catch (e) {
      if (delegate === 'CPU') throw e;
    }
  }
  onStatus('ready');
  return hands as HandLandmarkerLike;
}

/** Mains détectées : [{ lm: 21 points normalisés {x,y,z}, world: 21 points 3D en mètres (centrés sur la main) ou null,
 *  label: 'L'|'R' (main réelle du patient), score: confiance de l'étiquette }].
 *  `src` : élément vidéo ou canevas contenant l'image à analyser (jamais retournée en miroir). */
export function detectHands(src: HandFrameSource, ts: number): DetectedHand[] {
  if (!hands || (src.readyState !== undefined && src.readyState !== null && src.readyState < 2)) return [];
  return parseHands(hands.detectForVideo(src, ts));
}
// Étiquette gauche / droite : vérifié avec le vrai modèle (hand_landmarker.task, tasks-vision 1.1.1) sur des photos
// non retournées — une main droite réelle sort « Right », la même photo retournée sort « Left » (tests/overlay.e2e.mjs).
// Nos images ne sont jamais retournées avant l'analyse (le miroir n'est qu'à l'affichage) : on garde donc l'étiquette telle quelle.
// (Avant la v1.11 elle était inversée : avec deux mains dans l'image, l'app suivait la main qui aide au lieu de la main travaillée.)
export function parseHands(res: HandResult | null | undefined): DetectedHand[] {
  const out: DetectedHand[] = [];
  (res?.landmarks || []).forEach((lm, i) => {
    const h = res?.handedness?.[i]?.[0] || res?.handednesses?.[i]?.[0];
    const label: HandSide | null = h ? (h.categoryName === 'Left' ? 'L' : 'R') : null;
    const w = res?.worldLandmarks?.[i];
    const world = w?.length === 21 ? w : null;
    out.push({ lm, world, label, score: h?.score ?? 1 });
  });
  return out;
}

const lmAt = (h: DetectedHand, k: number): HandLandmark => h.lm[k] as HandLandmark;
const handSize = (h: DetectedHand): number => Math.hypot(lmAt(h, 0).x - lmAt(h, 9).x, lmAt(h, 0).y - lmAt(h, 9).y);
const handCenter = (h: DetectedHand): { x: number; y: number } => ({
  x: (lmAt(h, 0).x + lmAt(h, 9).x) / 2,
  y: (lmAt(h, 0).y + lmAt(h, 9).y) / 2,
});
/** Main suivie.
 *  - `prev` (main suivie à l'image précédente) : on garde la même main tant qu'elle est là (pas de saut d'une main à l'autre
 *    si l'étiquette hésite une image) ;
 *  - sinon celle du côté travaillé si l'étiquette est fiable (score ≥ 0,7) ;
 *  - sinon la plus grande (la plus proche de la caméra). */
export function pickHand(
  list: readonly DetectedHand[],
  side?: HandSide | null,
  prev: DetectedHand | null = null,
): DetectedHand | null {
  if (!list.length) return null;
  if (prev) {
    const c = handCenter(prev),
      s = handSize(prev) || 0.1;
    const near = list
      .map((h) => ({ h, d: Math.hypot(handCenter(h).x - c.x, handCenter(h).y - c.y) }))
      .sort((a, b) => a.d - b.d)[0] as { h: DetectedHand; d: number };
    // même main : centre déplacé de moins d'une longueur de paume, et pas clairement l'autre côté alors que la bonne main est aussi visible
    const better =
      side && near.h.label !== side && list.some((h) => h !== near.h && h.label === side && h.score >= 0.7);
    if (near.d < s * 1.2 && !better) return near.h;
  }
  if (side) {
    const m = list.filter((h) => h.label === side && h.score >= 0.7).sort((a, b) => handSize(b) - handSize(a))[0];
    if (m) return m;
  }
  return list.slice().sort((a, b) => handSize(b) - handSize(a))[0] as DetectedHand;
}

/** Vote sur les dernières images : la main suivie est-elle clairement celle de l'AUTRE côté ?
 *  (au moins 5 des 6 dernières étiquettes, score ≥ 0,9). Sert à prévenir le patient avant de commencer à compter. */
export class HandSideVote {
  n: number;
  v: number[];
  constructor(n = 6) {
    this.n = n;
    this.v = [];
  }
  reset(): void {
    this.v = [];
  }
  push(hand: DetectedHand | null | undefined, side?: HandSide | null): boolean {
    if (!side || !hand || !hand.label) return false;
    this.v.push(hand.label !== side && hand.score >= 0.9 ? 1 : 0);
    if (this.v.length > this.n) this.v.shift();
    return this.wrong;
  }
  get ready(): boolean {
    return this.v.length >= this.n;
  }
  get wrong(): boolean {
    return this.ready && this.v.reduce((a, b) => a + b, 0) >= this.n - 1;
  }
}

export const handPx = (lm: readonly HandLandmark[], w: number, h: number): { x: number; y: number; z: number }[] =>
  lm.map((l) => ({ x: l.x * w, y: l.y * h, z: (l.z || 0) * w }));

// Main entièrement visible : poignet + bouts des doigts dans l'image
// `out` : débordement toléré (0,04 = le point peut dépasser le bord de 4 % : encore fiable pour compter)
export function handInFrame(lm: readonly (HandLandmark | undefined)[], out = -0.01): boolean {
  return [0, 4, 8, 12, 16, 20].every((k) => {
    const l = lm[k];
    return !!l && l.x > -out && l.x < 1 + out && l.y > -out && l.y < 1 + out;
  });
}

export const HAND_CONN = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
] as const satisfies readonly (readonly [number, number])[];

/** Options de dessin de la main. */
export interface DrawHandOptions {
  keep?: boolean;
  bad?: boolean;
  hi?: readonly number[];
}

// Squelette de la main (coordonnées normalisées de l'écran)
export function drawHand(
  g: CanvasRenderingContext2D,
  lm: readonly HandLandmark[] | null,
  w: number,
  h: number,
  mirror = false,
  { keep = false, bad = false, hi = [] }: DrawHandOptions = {},
): { x: number; y: number }[] | null {
  if (!keep) g.clearRect(0, 0, w, h);
  if (!lm) return null;
  const P = (k: number): HandLandmark => lm[k] as HandLandmark;
  const X = (l: HandLandmark): number => (mirror ? (1 - l.x) * w : l.x * w);
  const { ok, bad: red } = poseColors();
  g.save();
  g.lineCap = 'round';
  g.lineWidth = Math.max(2.5, w / 220);
  g.strokeStyle = bad ? red : ok;
  for (const [a, b] of HAND_CONN) {
    g.beginPath();
    g.moveTo(X(P(a)), P(a).y * h);
    g.lineTo(X(P(b)), P(b).y * h);
    g.stroke();
  }
  for (let i = 0; i < 21; i++) {
    g.fillStyle = hi.includes(i) ? red : '#ffffff';
    g.beginPath();
    g.arc(X(P(i)), P(i).y * h, Math.max(2.5, w / 200) * (i === 0 ? 1.6 : 1), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return lm.map((l) => ({ x: X(l), y: l.y * h })); // points réellement dessinés (pixels du canevas)
}
