// Suivi de la main sur l'appareil (MediaPipe Hand Landmarker, 21 points par main) pour les exercices du poignet,
// de la main et du pouce : mouvement du poignet, rotation de l'avant-bras, fermeture du poing, opposition du pouce.
// La vidéo ne quitte jamais le téléphone.
import { CONFIG } from './config.js';

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

/** Mains détectées : [{ lm: 21 points normalisés {x,y,z}, label: 'L'|'R' (main réelle du patient), score }] */
export function detectHands(video, ts) {
  if (!hands || video.readyState < 2) return [];
  const res = hands.detectForVideo(video, ts);
  const out = [];
  (res?.landmarks || []).forEach((lm, i) => {
    const h = res.handedness?.[i]?.[0] || res.handednesses?.[i]?.[0];
    // MediaPipe suppose une image « selfie » retournée ; nos images ne le sont pas → l'étiquette est inversée
    const label = h ? (h.categoryName === 'Left' ? 'R' : 'L') : null;
    out.push({ lm, label, score: h?.score ?? 1 });
  });
  return out;
}

// Main suivie : celle du côté travaillé si on la reconnaît, sinon la plus grande (la plus proche de la caméra)
export function pickHand(list, side) {
  if (!list.length) return null;
  if (side) { const m = list.find((h) => h.label === side); if (m) return m; }
  const size = (h) => Math.hypot(h.lm[0].x - h.lm[9].x, h.lm[0].y - h.lm[9].y);
  return list.slice().sort((a, b) => size(b) - size(a))[0];
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
  if (!lm) return;
  const X = (l) => (mirror ? (1 - l.x) * w : l.x * w);
  const css = getComputedStyle(document.documentElement);
  const ok = css.getPropertyValue('--pose-ok').trim() || '#2dd4bf';
  const red = css.getPropertyValue('--pose-bad').trim() || '#ff7a59';
  g.save(); g.lineCap = 'round';
  g.lineWidth = Math.max(2.5, w / 220);
  g.strokeStyle = bad ? red : ok;
  for (const [a, b] of HAND_CONN) { g.beginPath(); g.moveTo(X(lm[a]), lm[a].y * h); g.lineTo(X(lm[b]), lm[b].y * h); g.stroke(); }
  for (let i = 0; i < 21; i++) {
    g.fillStyle = hi.includes(i) ? red : '#ffffff';
    g.beginPath(); g.arc(X(lm[i]), lm[i].y * h, Math.max(2.5, w / 200) * (i === 0 ? 1.6 : 1), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
