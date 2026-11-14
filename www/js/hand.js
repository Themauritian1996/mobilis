// Suivi de la main sur l'appareil (MediaPipe Hand Landmarker, 21 points par main) pour les exercices du poignet,
// de la main et du pouce : mouvement du poignet, rotation de l'avant-bras, fermeture du poing, opposition du pouce.
// La vidéo ne quitte jamais le téléphone.
import { CONFIG } from './config.js';
import { poseColors } from './overlay.js';

let hands = null;

export async function loadHands(onStatus = () => {}) {
  if (hands) return hands;
  onStatus('lib');
  const mp = await import(`${CONFIG.mediapipeBase}/vision_bundle.mjs`);
  const fileset = await mp.FilesetResolver.forVisionTasks(`${CONFIG.mediapipeBase}/wasm`);
  onStatus('model');
  let modelAssetPath = CONFIG.handModelRemote;
  try {
    const r = await fetch(CONFIG.handModelLocal, { method: 'HEAD' });
    if (r.ok) modelAssetPath = CONFIG.handModelLocal;
  } catch (_) { /* pas de modèle local */ }
  for (const delegate of ['GPU', 'CPU']) {
    try {
      hands = await mp.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      break;
    } catch (e) { if (delegate === 'CPU') throw e; }
  }
  onStatus('ready');
  return hands;
}

/** Mains détectées : [{ lm: 21 points normalisés {x,y,z}, world: 21 points 3D en mètres (centrés sur la main) ou null,
 *  label: 'L'|'R' (main réelle du patient), score: confiance de l'étiquette }].
 *  `src` : élément vidéo ou canevas contenant l'image à analyser (jamais retournée en miroir). */
export function detectHands(src, ts) {
  if (!hands || (src.readyState != null && src.readyState < 2)) return [];
  return parseHands(hands.detectForVideo(src, ts));
}
// Étiquette gauche / droite : vérifié avec le vrai modèle (hand_landmarker.task, tasks-vision 1.1.1) sur des photos
// non retournées — une main droite réelle sort « Right », la même photo retournée sort « Left » (tests/overlay.e2e.mjs).
// Nos images ne sont jamais retournées avant l'analyse (le miroir n'est qu'à l'affichage) : on garde donc l'étiquette telle quelle.
// (Avant la v1.11 elle était inversée : avec deux mains dans l'image, l'app suivait la main qui aide au lieu de la main travaillée.)
export function parseHands(res) {
  const out = [];
  (res?.landmarks || []).forEach((lm, i) => {
    const h = res.handedness?.[i]?.[0] || res.handednesses?.[i]?.[0];
    const label = h ? (h.categoryName === 'Left' ? 'L' : 'R') : null;
    const world = res.worldLandmarks?.[i]?.length === 21 ? res.worldLandmarks[i] : null;
    out.push({ lm, world, label, score: h?.score ?? 1 });
  });
  return out;
}

const handSize = (h) => Math.hypot(h.lm[0].x - h.lm[9].x, h.lm[0].y - h.lm[9].y);
const handCenter = (h) => ({ x: (h.lm[0].x + h.lm[9].x) / 2, y: (h.lm[0].y + h.lm[9].y) / 2 });
/** Main suivie.
 *  - `prev` (main suivie à l'image précédente) : on garde la même main tant qu'elle est là (pas de saut d'une main à l'autre
 *    si l'étiquette hésite une image) ;
 *  - sinon celle du côté travaillé si l'étiquette est fiable (score ≥ 0,7) ;
 *  - sinon la plus grande (la plus proche de la caméra). */
export function pickHand(list, side, prev = null) {
  if (!list.length) return null;
  if (prev) {
    const c = handCenter(prev), s = handSize(prev) || 0.1;
    const near = list.map((h) => ({ h, d: Math.hypot(handCenter(h).x - c.x, handCenter(h).y - c.y) })).sort((a, b) => a.d - b.d)[0];
    // même main : centre déplacé de moins d'une longueur de paume, et pas clairement l'autre côté alors que la bonne main est aussi visible
    const better = side && near.h.label !== side && list.some((h) => h !== near.h && h.label === side && h.score >= 0.7);
    if (near.d < s * 1.2 && !better) return near.h;
  }
  if (side) { const m = list.filter((h) => h.label === side && h.score >= 0.7).sort((a, b) => handSize(b) - handSize(a))[0]; if (m) return m; }
  return list.slice().sort((a, b) => handSize(b) - handSize(a))[0];
}

/** Vote sur les dernières images : la main suivie est-elle clairement celle de l'AUTRE côté ?
 *  (≥ 80 % des 12 dernières étiquettes, score ≥ 0,9). Sert à prévenir le patient avant de commencer à compter. */
export class HandSideVote {
  constructor(n = 12) { this.n = n; this.v = []; }
  reset() { this.v = []; }
  push(hand, side) {
    if (!side || !hand || !hand.label) return false;
    this.v.push(hand.label !== side && hand.score >= 0.9 ? 1 : 0);
    if (this.v.length > this.n) this.v.shift();
    return this.wrong;
  }
  get wrong() { return this.v.length >= this.n && this.v.reduce((a, b) => a + b, 0) >= this.n * 0.8; }
}

export const handPx = (lm, w, h) => lm.map((l) => ({ x: l.x * w, y: l.y * h, z: (l.z || 0) * w }));

// Main entièrement visible : poignet + bouts des doigts dans l'image
export function handInFrame(lm) {
  return [0, 4, 8, 12, 16, 20].every((k) => lm[k] && lm[k].x > 0.01 && lm[k].x < 0.99 && lm[k].y > 0.01 && lm[k].y < 0.99);
}

export const HAND_CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

// Squelette de la main (coordonnées normalisées de l'écran)
export function drawHand(g, lm, w, h, mirror = false, { keep = false, bad = false, hi = [] } = {}) {
  if (!keep) g.clearRect(0, 0, w, h);
  if (!lm) return null;
  const X = (l) => (mirror ? (1 - l.x) * w : l.x * w);
  const { ok, bad: red } = poseColors();
  g.save(); g.lineCap = 'round';
  g.lineWidth = Math.max(2.5, w / 220);
  g.strokeStyle = bad ? red : ok;
  for (const [a, b] of HAND_CONN) { g.beginPath(); g.moveTo(X(lm[a]), lm[a].y * h); g.lineTo(X(lm[b]), lm[b].y * h); g.stroke(); }
  for (let i = 0; i < 21; i++) {
    g.fillStyle = hi.includes(i) ? red : '#ffffff';
    g.beginPath(); g.arc(X(lm[i]), lm[i].y * h, Math.max(2.5, w / 200) * (i === 0 ? 1.6 : 1), 0, Math.PI * 2); g.fill();
  }
  g.restore();
  return lm.map((l) => ({ x: X(l), y: l.y * h })); // points réellement dessinés (pixels du canevas)
}
