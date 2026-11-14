// Estimation de pose 2D sur l'appareil (MediaPipe Pose Landmarker) + métriques biomécaniques + compteur de répétitions.
import { CONFIG } from './config.js';
import { poseColors } from './overlay.js';

let landmarker = null;

export async function loadPose(onStatus = () => {}) {
  if (landmarker) return landmarker;
  onStatus('lib');
  const mp = await import(`${CONFIG.mediapipeBase}/vision_bundle.mjs`);
  const fileset = await mp.FilesetResolver.forVisionTasks(`${CONFIG.mediapipeBase}/wasm`);
  onStatus('model');
  let modelAssetPath = CONFIG.poseModelRemote;
  try {
    const r = await fetch(CONFIG.poseModelLocal, { method: 'HEAD' });
    if (r.ok) modelAssetPath = CONFIG.poseModelLocal;
  } catch (_) { /* pas de modèle local */ }
  for (const delegate of ['GPU', 'CPU']) {
    try {
      landmarker = await mp.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      break;
    } catch (e) { if (delegate === 'CPU') throw e; }
  }
  onStatus('ready');
  return landmarker;
}

/** `src` : élément vidéo ou canevas contenant l'image à analyser. */
export function detect(src, ts) {
  if (!landmarker || (src.readyState != null && src.readyState < 2)) return null;
  const res = landmarker.detectForVideo(src, ts);
  return res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
}

// ---------- Points et utilitaires ----------
const IDX = {
  nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, idxL: 19, idxR: 20,
  hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28, heelL: 29, heelR: 30, ftL: 31, ftR: 32,
};
export const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [7, 8],
];

const deg = (r) => (r * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
function angle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / d))));
}

// Convertit en pixels (corrige le rapport largeur/hauteur)
export function toPx(lm, w, h) {
  const p = {};
  for (const k in IDX) { const l = lm[IDX[k]]; p[k] = { x: l.x * w, y: l.y * h, v: l.visibility ?? 1 }; }
  return p;
}

function ctx(p) {
  const sh = mid(p.shL, p.shR), hip = mid(p.hipL, p.hipR), ear = mid(p.earL, p.earR);
  const torso = dist(sh, hip) || 1;
  const facing = Math.sign(p.nose.x - ear.x) || 1; // +1 = tourné vers la droite de l'image
  const legLen = (dist(p.hipL, p.anL) + dist(p.hipR, p.anR)) / 2 || 1;
  const shW = dist(p.shL, p.shR) || 1;
  return { sh, hip, ear, torso, facing, legLen, shW };
}
const S = (p, side, name) => p[name + side];
const other = (s) => (s === 'L' ? 'R' : 'L');

// ---------- Métriques ----------
const M = {
  knee: (p, s) => angle(S(p, s, 'hip'), S(p, s, 'kn'), S(p, s, 'an')),
  hip: (p, s) => angle(S(p, s, 'sh'), S(p, s, 'hip'), S(p, s, 'kn')),
  hipMax: (p) => Math.max(M.hip(p, 'L'), M.hip(p, 'R')),
  elbow: (p, s) => angle(S(p, s, 'sh'), S(p, s, 'el'), S(p, s, 'wr')),
  ankle: (p, s) => angle(S(p, s, 'kn'), S(p, s, 'an'), S(p, s, 'ft')),
  bodyLine: (p, s) => angle(S(p, s, 'sh'), S(p, s, 'hip'), S(p, s, 'an')),
  armElev: (p, s) => angle(S(p, s, 'hip'), S(p, s, 'sh'), S(p, s, 'el')),
  shFlex: (p, s, c) => {
    const sh = S(p, s, 'sh'), hip = S(p, s, 'hip'), el = S(p, s, 'el');
    const v1 = { x: hip.x - sh.x, y: hip.y - sh.y }, v2 = { x: el.x - sh.x, y: el.y - sh.y };
    return -c.facing * deg(Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y));
  },
  trunkLean: (p, s, c) => c.facing * deg(Math.atan2(c.sh.x - c.hip.x, -(c.sh.y - c.hip.y))),
  trunkTilt: (p, s, c) => deg(Math.atan2(-(c.sh.y - c.hip.y), Math.abs(c.sh.x - c.hip.x))),
  shinLean: (p, s, c) => c.facing * deg(Math.atan2(S(p, s, 'kn').x - S(p, s, 'an').x, -(S(p, s, 'kn').y - S(p, s, 'an').y))),
  // oreilles et épaules des deux côtés (moyenne) : moins de tremblement que le seul côté visible
  neckFwd: (p, s, c) => (c.facing * (c.ear.x - c.sh.x)) / c.torso,
  wristUp: (p, s, c) => (S(p, s, 'sh').y - S(p, s, 'wr').y) / c.torso,
  heelRise: (p, s, c) => -S(p, s, 'heel').y / c.legLen,
  hipY: (p, s, c) => (mid(p.anL, p.anR).y - c.hip.y) / (dist(p.hipL, p.hipR) || 1),
  armSym: (p) => Math.abs(M.armElev(p, 'L') - M.armElev(p, 'R')),
  kneeSym: (p) => Math.abs(M.knee(p, 'L') - M.knee(p, 'R')),
  trunkSide: (p, s, c) => deg(Math.atan2(c.sh.x - c.hip.x, -(c.sh.y - c.hip.y))),
  pelvisDrop: (p) => deg(Math.atan2(p.hipL.y - p.hipR.y, Math.abs(p.hipL.x - p.hipR.x) || 1)),
  shrug: (p, s, c) => ((p.earL.y - p.shL.y) + (p.earR.y - p.shR.y)) / 2 / c.shW,
  headTilt: (p) => deg(Math.atan2(p.earL.y - p.earR.y, Math.abs(p.earL.x - p.earR.x) || 1)),
  headRot: (p) => (p.nose.x - mid(p.earL, p.earR).x) / (dist(p.earL, p.earR) || 1),
  kneeValgus: (p, s, c) => {
    const one = (sd) => {
      const hip = S(p, sd, 'hip'), kn = S(p, sd, 'kn'), an = S(p, sd, 'an');
      const t = (kn.y - hip.y) / ((an.y - hip.y) || 1);
      const lineX = hip.x + (an.x - hip.x) * t;
      const medial = Math.sign(S(p, other(sd), 'hip').x - hip.x) || 1;
      return ((kn.x - lineX) * medial) / c.legLen;
    };
    return s ? one(s) : Math.max(one('L'), one('R'));
  },
  erFront: (p, s) => {
    const lat = Math.sign(S(p, s, 'sh').x - S(p, other(s), 'sh').x) || 1;
    return ((S(p, s, 'wr').x - S(p, s, 'el').x) * lat) / (dist(S(p, s, 'sh'), S(p, s, 'el')) || 1);
  },
  elbowAway: (p, s) => Math.abs(S(p, s, 'el').x - S(p, s, 'sh').x) / (dist(S(p, s, 'sh'), S(p, s, 'el')) || 1),
  hipAbd: (p, s) => {
    const h = S(p, s, 'hip'), k = S(p, s, 'kn');
    return deg(Math.atan2(Math.abs(k.x - h.x), k.y - h.y));
  },
  kneeGap: (p, s, c) => angle(p.knL, c.hip, p.knR),
  footLift: (p, s, c) => Math.abs(p.anL.y - p.anR.y) / c.legLen,
  hipLow: (p, s, c) => c.hip.y / c.shW,
  // descente du bassin (vue de face) en fraction de la longueur de jambe mesurée au départ : plus stable que la largeur d'épaules
  hipDrop: (p, s, c, o = {}) => c.hip.y / (o.legLen0 || c.legLen),
  legLen: (p, s, c) => c.legLen,
  // ---- Main (21 points MediaPipe Hands) ----
  // p.hand  : points 2D en pixels de l'image ;
  // p.hand3 : points 3D « monde » en mètres (worldLandmarks), si disponibles.
  // Poignet et rotation de l'avant-bras : direction dans l'image par rapport au départ (l'avant-bras ne bouge pas) ;
  // le Tracker corrige l'effet d'une main filmée de biais grâce aux points 3D (voir tilt3).
  // direction de la main (poignet → tête du 3e métacarpien) dans l'image ; avant-bras immobile → variation = mouvement du poignet
  hAxis: (p) => { const h = p.hand; return deg(Math.atan2(h[9].x - h[0].x, -(h[9].y - h[0].y))); },
  // rotation de l'avant-bras vu dans son axe : orientation de la ligne des jointures (index → auriculaire)
  hRoll: (p) => { const h = p.hand; return deg(Math.atan2(h[17].x - h[5].x, -(h[17].y - h[5].y))); },
  // Doigts et pouce : distances et angles mesurés en 3D quand c'est possible → identiques quelle que soit
  // l'orientation de la main face à la caméra (en 2D, une main tournée de 30° « raccourcit » les doigts).
  // pouce → pulpe du doigt le plus proche (fraction de la longueur de la paume, négatif : plus proche de 0 = contact)
  hPinch: (p) => { const h = H3(p), d = D3(p), palm = d(h[0], h[9]) || 1; return -Math.min(...[8, 12, 16, 20].map((k) => d(h[4], h[k]))) / palm; },
  // fermeture de la main : distance moyenne bout des doigts → poignet (fraction de la paume ; ≈ 1,8 main ouverte, ≈ 1 poing)
  hClose: (p) => { const h = H3(p), d = D3(p), palm = d(h[0], h[9]) || 1; return [8, 12, 16, 20].reduce((a, k) => a + d(h[k], h[0]), 0) / 4 / palm; },
  // ouverture du pouce (abduction / « C ») : angle entre le pouce (2 → 4) et le 2e métacarpien (0 → 5)
  hThumbAbd: (p) => { const h = H3(p), z = p.hand3 ? 1 : 0; return angle3(sub3(h[4], h[2], z), sub3(h[5], h[0], z)); },
};
// points de la main utilisés pour les distances : 3D (mètres) si disponibles, sinon 2D (pixels ; le z relatif du modèle 2D est ignoré)
const H3 = (p) => p.hand3 || p.hand;
const D3 = (p) => (p.hand3 ? d3 : dist);
const sub3 = (a, b, z = 1) => ({ x: a.x - b.x, y: a.y - b.y, z: z ? (a.z || 0) - (b.z || 0) : 0 });
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const unit3 = (v) => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
function angle3(a, b) {
  const d = (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)) || 1;
  return deg(Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / d))));
}
// Segment 3D dont la direction décrit le mouvement des mesures angulaires de la main
const HAND_DIR3 = { hAxis: [0, 9], hRoll: [5, 17] };
/** Direction 3D (vecteur unitaire) du segment d'une mesure angulaire de la main, ou null (pas de points 3D). */
export function handDir3(name, p) {
  const seg = HAND_DIR3[name], h = p.hand3;
  if (!seg || !h) return null;
  return unit3(sub3(h[seg[1]], h[seg[0]]));
}
/** Main filmée de biais : l'angle vu dans l'image (d2, degrés) sous-estime l'angle réel. On le corrige avec l'angle 3D
 *  entre la direction de départ et la direction actuelle (a3), sans jamais réduire d2 et au plus de +35 % (le z du modèle
 *  est moins précis que x, y) ; rien sous 4° (au repos, le bruit 3D ne doit pas créer de mouvement). */
export function tiltCorrect(d2, a3) {
  const a = Math.abs(d2);
  if (!(a3 > 0) || a < 4) return d2;
  return d2 * Math.max(1, Math.min(1.35, a3 / a));
}
export const HAND_METRICS = new Set(['hAxis', 'hRoll', 'hPinch', 'hClose', 'hThumbAbd']);
// Sens anatomique de chaque mesure (envoyé à l'IA pour qu'elle interprète des chiffres valides)
export const METRIC_INFO = {
  knee: 'knee joint angle in degrees (180 = fully straight, smaller = more bent)',
  hip: 'hip angle between trunk and thigh in degrees (180 = straight, smaller = more flexed)',
  hipMax: 'largest hip angle of both sides (degrees)',
  elbow: 'elbow angle in degrees (180 = straight)',
  ankle: 'ankle angle between shin and foot in degrees (smaller = more dorsiflexion)',
  bodyLine: 'shoulder-hip-ankle alignment in degrees (180 = straight body line)',
  armElev: 'arm elevation from the side of the trunk in degrees (0 = arm down)',
  shFlex: 'shoulder flexion in degrees (0 = arm along the body, 90 = forward horizontal, negative = arm behind the body)',
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
  hClose: 'mean fingertip-to-wrist distance (fraction of palm length, measured in 3D; about 1.8 open hand, about 1.0 closed fist)',
  hThumbAbd: 'thumb opening angle from the index metacarpal, in degrees',
};
const SIDED = new Set(['knee', 'hip', 'elbow', 'ankle', 'bodyLine', 'armElev', 'shFlex', 'shinLean', 'neckFwd', 'wristUp', 'heelRise', 'erFront', 'elbowAway', 'hipAbd', 'kneeValgus']);

function visibleSide(p) {
  const sc = (s) => ['sh', 'el', 'wr', 'hip', 'kn', 'an'].reduce((a, n) => a + S(p, s, n).v, 0);
  return sc('L') >= sc('R') ? 'L' : 'R';
}

export function metric(name, p, side, opts = {}) {
  if (HAND_METRICS.has(name)) return p.hand ? M[name](p) : NaN;
  const c = ctx(p);
  if (opts.both && SIDED.has(name)) return (M[name](p, 'L', c) + M[name](p, 'R', c)) / 2;
  return M[name](p, SIDED.has(name) ? side : null, c, opts);
}

// Orientation : la personne est-elle de face ou de côté par rapport à la caméra ?
export function detectPlane(p) {
  const c = ctx(p);
  const r = c.shW / c.torso;
  if (Math.abs(M.trunkLean(p, null, c)) > 50) return null; // couché / quadrupédie : on ne devine pas
  if (r > 0.42) return 'front';
  if (r < 0.24) return 'side';
  return 'between';
}

export function bodyVisible(p) {
  const need = ['shL', 'shR', 'hipL', 'hipR'];
  return need.every((k) => p[k].v > 0.5);
}

// ---------- Compteur de répétitions / maintien ----------
// Haut du mouvement : 85 % de la cible (la cible tient déjà compte du niveau du patient)
const TOP = 0.85;
export class Tracker {
  constructor(ex, planeKey, { romFactor = 1, holdTarget = 0, onRep = () => {}, onCue = () => {}, side = null } = {}) {
    this.forceSide = side; // 'L' | 'R' : côté travaillé choisi par le patient
    this.ex = ex; this.mode = ex.track.mode;
    this.spec = ex.track.planes[planeKey];
    this.rom = romFactor; this.holdTarget = holdTarget;
    this.onRep = onRep; this.onCue = onCue;
    this.calib = []; this.base = null; this.side = null;
    this.reps = 0; this.full = 0; this.partial = 0; this.repLog = [];
    this.state = 'rest'; this.peak = 0; this.p = 0; this.topSince = 0; this.repStart = 0;
    this.repFaults = new Set(); this.violation = {}; this.holdSec = 0; this.lastT = 0;
    this.worstFrame = null; this.faultCount = {}; this.lastChecks = []; this.repWorst = {}; this.peakVal = null; this.ckHist = {};
  }

  get calibrated() { return !!this.base; }

  valueFor(p, side) {
    const s = this.spec;
    let v = metric(s.metric, p, side, { both: s.both, legLen0: this.legLen0 });
    if (s.abs) v = Math.abs(v);
    return v;
  }

  update(p, t) {
    const dt = this.lastT ? Math.min(0.2, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    const s = this.spec;
    if (!this.side) this.side = this.forceSide || (p.hand ? 'R' : visibleSide(p));

    // Calibration : ~0,6 s immobile en position de départ
    if (!this.base) {
      const snap = { L: this.valueFor(p, 'L'), R: this.valueFor(p, 'R'), checks: {} };
      for (const ck of s.checks || []) if (ck.rel) snap.checks[ck.m] = metric(ck.m, p, this.side);
      if (!p.hand) snap.leg = metric('legLen', p, null);
      else snap.v3 = handDir3(s.metric, p); // direction 3D de départ (main filmée de biais)
      this.calib.push(snap);
      // départ immobile : les 18 dernières images doivent être stables (sinon le « zéro » serait pris en plein mouvement) ;
      // après ~4 s sans stabilité, on calibre quand même sur les dernières images
      if (this.calib.length > 18) this.calibAll = (this.calibAll || 0) + 1, this.calib.shift();
      const tol = s.calibTol ?? (this.mode === 'hold' ? Math.abs((s.max ?? 0) - (s.min ?? 0)) * 0.5 || 10 : s.rel ? Math.abs(s.delta) * 0.22 : Math.abs((s.to ?? 0) - (s.from ?? 0)) * 0.15 || 10);
      // stabilité = écart-type (robuste au tremblement des points, contrairement à l'écart max − min)
      const sd = (k) => { let v = this.calib.map((x) => x[k]).filter(Number.isFinite); if (!v.length) return NaN; if (s.angular) { const r = v[0]; v = v.map((x) => ((x - r + 540) % 360) - 180); } const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
      if (this.calib.length >= 18) {
        const d = sd('L');
        if (!this.calibBest || d < this.calibBest.sd) this.calibBest = { sd: d, win: this.calib.slice() };
      }
      const stable = this.calib.length >= 18 && (!Number.isFinite(sd('L')) || sd('L') * 2 <= tol);
      // sans moment parfaitement immobile : fenêtre la plus stable des ~1,5 premières secondes (le patient est en position de départ)
      if (this.calib.length >= 18 && !stable && (this.calibAll || 0) > 27 && this.calibBest) this.calib = this.calibBest.win;
      if (this.calib.length >= 18 && (stable || (this.calibAll || 0) > 27)) {
        const avg = (f) => this.calib.reduce((a, x) => a + f(x), 0) / this.calib.length;
        // angles : moyenne circulaire (179° et −179° → 180°, pas 0°)
        const cavg = (f) => deg(Math.atan2(avg((x) => Math.sin(f(x) / 57.29578)), avg((x) => Math.cos(f(x) / 57.29578))));
        const A = s.angular ? cavg : avg;
        // longueur de jambe au départ (référence d'échelle de « hipDrop ») : la base est recalculée avec cette échelle
        if (s.metric === 'hipDrop') { this.legLen0 = avg((x) => x.leg); this.calib = this.calib.map((x) => ({ ...x, L: x.L * x.leg / this.legLen0, R: x.R * x.leg / this.legLen0 })); }
        this.base = { L: A((x) => x.L), R: A((x) => x.R), checks: {} };
        // tremblement mesuré au repos (en fraction de l'amplitude visée) : lissage adapté à la caméra et à la lumière
        const span = s.rel ? Math.abs(s.delta) * this.rom : Math.abs((s.to ?? 0) - (s.from ?? 0)) * this.rom;
        const sdv = sd(this.side || 'L');
        this.noiseP = span && Number.isFinite(sdv) ? sdv / span : 0;
        for (const ck of s.checks || []) if (ck.rel) this.base.checks[ck.m] = avg((x) => x.checks[ck.m]);
        const v3 = this.calib.map((x) => x.v3).filter(Boolean);
        if (v3.length >= this.calib.length / 2) this.base3 = unit3({ x: v3.reduce((a, v) => a + v.x, 0), y: v3.reduce((a, v) => a + v.y, 0), z: v3.reduce((a, v) => a + v.z, 0) });
      }
      return { phase: 'calibrating', progress: 0, reps: 0, holdSec: 0 };
    }

    // Choix du côté : 'auto' = côté qui bouge le plus, sinon côté le plus visible
    let side = this.side, v;
    // main : angle 3D entre la direction de départ et la direction actuelle (corrige une main filmée de biais)
    const cur3 = this.base3 ? handDir3(s.metric, p) : null;
    const a3 = cur3 ? angle3(this.base3, cur3) : null;
    this.tilt3 = a3;
    const prog = (val, sd) => {
      if (s.rel && (s.angular || s.absRel)) {
        // écart à la position de départ ; angulaire : ramené entre −180 et 180 ; absRel : dans un sens ou dans l'autre
        let d = val - this.base[sd]; if (s.angular) { d = ((d + 540) % 360) - 180; if (a3 != null) d = tiltCorrect(d, a3); } if (s.absRel) d = Math.abs(d);
        const span = (s.absRel ? Math.abs(s.delta) : s.delta) * this.rom;
        return { pr: d / (span || 1), from: 0, to: span, d };
      }
      const from = s.rel ? this.base[sd] : s.from;
      const to = s.rel ? this.base[sd] + s.delta * this.rom : s.from + (s.to - s.from) * this.rom;
      return { pr: (val - from) / ((to - from) || 1), from, to };
    };
    if (s.side === 'auto' && !this.forceSide) {
      const vL = this.valueFor(p, 'L'), vR = this.valueFor(p, 'R');
      const a = prog(vL, 'L').pr, b = prog(vR, 'R').pr;
      side = a >= b ? 'L' : 'R'; v = side === 'L' ? vL : vR;
    } else v = this.valueFor(p, side);

    // Contrôles de qualité
    const faults = [], checksNow = [];
    for (const ck of s.checks || []) {
      let m = metric(ck.m, p, s.both && ck.m === 'kneeValgus' ? null : side);
      if (ck.rel) m -= this.base.checks[ck.m] ?? 0;
      if (ck.abs) m = Math.abs(m);
      // médiane glissante (5 images) : un point qui saute une image ne déclenche pas de faute
      const hist = (this.ckHist[ck.cue + ck.m] = (this.ckHist[ck.cue + ck.m] || []).concat(Number.isFinite(m) ? [m] : []).slice(-5));
      if (hist.length) m = hist.slice().sort((x, y) => x - y)[hist.length >> 1];
      const bad = (ck.max != null && m > ck.max) || (ck.min != null && m < ck.min);
      const active = this.mode === 'hold' || this.state !== 'rest';
      checksNow.push({ cue: ck.cue, metric: ck.m, value: +m.toFixed(ck.max != null && Math.abs(ck.max) < 2 ? 3 : 1), limit: ck.max ?? ck.min, kind: ck.max != null ? 'max' : 'min', relative: !!ck.rel, bad });
      if (active) {
        const w = this.repWorst[ck.cue];
        const worse = !w || (ck.max != null ? m > w.value : m < w.value);
        if (worse) this.repWorst[ck.cue] = { cue: ck.cue, metric: ck.m, value: +m.toFixed(3), limit: ck.max ?? ck.min, kind: ck.max != null ? 'max' : 'min', relative: !!ck.rel };
      }
      this.violation[ck.cue] = bad && active ? (this.violation[ck.cue] || 0) + dt : 0;
      if (this.violation[ck.cue] >= 0.35) faults.push(ck.cue);
    }
    for (const f of faults) { this.repFaults.add(f); this.onCue(f); }
    this.lastChecks = checksNow;

    if (this.mode === 'hold') {
      if (s.rel) v = prog(v, side).d ?? (v - this.base[side]); // maintien relatif : écart à la position de départ
      const ok = v >= s.min && v <= s.max && faults.length === 0;
      if (ok) this.holdSec += dt;
      else if (this.holdSec > 0.5 && !faults.length) this.onCue('holdIt');
      for (const f of faults) this.faultCount[f] = (this.faultCount[f] || 0) + dt;
      return { phase: ok ? 'holding' : 'adjust', value: v, side, progress: ok ? 1 : 0, holdSec: this.holdSec, faults, checks: checksNow, range: [s.min, s.max] };
    }

    // Mode répétitions
    const { pr, to, d: dv } = prog(v, side);
    if (dv != null) v = dv; // écart à la position de départ (degrés ou fraction) : c'est ce que voient le patient et l'IA
    // lissage dans le temps (≈ 0,12 s) : le tremblement des points ne crée ni fausse répétition ni fausse amplitude
    let tau = s.smooth ?? ((s.minRepSec || 0) >= 2 || s.holdTop ? 0.16 : 0.12); // mouvements lents : lissage un peu plus fort
    if (this.noiseP > 0.12) tau = Math.min(0.35, tau * this.noiseP / 0.12); // points qui tremblent beaucoup : lissage plus fort
    const a = dt ? 1 - Math.exp(-dt / tau) : 0.45;
    this.p = this.p + (Math.max(-0.5, Math.min(1.25, pr)) - this.p) * a; // au-delà de 125 % : aucune information utile (et retour plus rapide)
    const P = this.p, holdTop = s.holdTop || 0;
    if (s.rel && this.state === 'rest') {
      if (P < -0.35) { this.lowT = this.lowT || t; if (t - this.lowT > 1500) { this.base[side] = this.base[side] + (pr * (s.absRel ? Math.abs(s.delta) : s.delta) * this.rom); if (cur3) this.base3 = cur3; this.p = 0; this.lowT = 0; } }
      else this.lowT = 0;
    }
    if (this.p0 == null) {
      // progression de la position de départ réelle (chaque patient part d'un angle différent)
      const b = Math.max(prog(this.base.L, 'L').pr, prog(this.base.R, 'R').pr); // 'auto' : le côté au repos fixe le plancher
      this.p0 = s.rel ? 0 : Math.max(0, Math.min(0.45, s.side === 'auto' ? b : prog(this.base[side], side).pr));
    }
    const span0 = 1 - this.p0;
    const startT = this.p0 + 0.28 * span0, endT = this.p0 + 0.14 * span0;
    if (this.state === 'rest' && P <= this.p0 + 0.08 * span0) this.restT = t; // dernier instant au repos
    if (this.state === 'rest' && P > startT) {
      this.state = 'moving'; this.peak = P; this.moveStart = t; this.highMs = 0; this.repStart = Math.max(this.restT || t, t - 4000); this.repFaults = new Set(); this.topSince = 0; this.repWorst = {}; this.peakVal = v;
    }
    if (this.state === 'moving') {
      if (P > this.peak) { this.peak = P; this.peakVal = v; }
      if (P >= 0.6) this.highMs = (this.highMs || 0) + dt * 1000;
      // haut du mouvement : 85 % de la cible ; maintien toléré à 80 % (petits tremblements pendant la tenue)
      if (P >= TOP) { if (!this.topSince) this.topSince = t; }
      else if (this.topSince && P < TOP - 0.1 && !this.topOk) { if (holdTop && (t - this.topSince) / 1000 < holdTop * 0.8) this.onCue('holdIt'); this.topSince = 0; }
      if (this.topSince && holdTop && (t - this.topSince) / 1000 >= holdTop * 0.8) this.topOk = true; // 80 % du temps de maintien
      // retour presque au départ puis immobile ≥ 0,6 s (le patient ne revient jamais exactement à sa position initiale) :
      // la répétition est terminée et le point de départ est ajusté (dérive de posture au fil de la série)
      let settled = false;
      if (this.peak >= 0.6 && P < 0.5) {
        if (!this.lowStart) { this.lowStart = t; this.lowPts = []; }
        this.lowPts.push([t, P]);
        while (this.lowPts.length && t - this.lowPts[0][0] > 700) this.lowPts.shift();
        if (t - this.lowStart > 600 && this.lowPts.length >= 8) {
          // pente (régression linéaire) : immobile = |pente| < 0,2 / s, même si les points tremblent ; une descente lente n'est pas un arrêt
          const n = this.lowPts.length, mt = this.lowPts.reduce((a, q) => a + q[0], 0) / n, mp = this.lowPts.reduce((a, q) => a + q[1], 0) / n;
          const slope = (this.lowPts.reduce((a, q) => a + (q[0] - mt) * (q[1] - mp), 0) / (this.lowPts.reduce((a, q) => a + (q[0] - mt) ** 2, 0) || 1)) * 1000;
          if (Math.abs(slope) < 0.2) { settled = true; this.lowMid = mp; }
        }
        if (settled) {
          if (s.rel && !s.absRel) { this.base[side] += this.lowMid * s.delta * this.rom; if (cur3) this.base3 = cur3; }
          if (s.rel && !s.absRel) this.p = 0;
        }
      } else this.lowStart = 0;
      if (P < endT || settled) {
        this.lowStart = 0;
        const dur = (t - this.repStart) / 1000;
        const reachedTop = this.peak >= TOP;
        const heldOk = !holdTop || this.topOk;
        // une vraie répétition : au moins 60 % de la cible et 0,6 s (sinon : tremblement ou faux départ, ignoré)
        if (this.peak >= 0.6 && (this.highMs || 0) >= 150 && dur >= 0.6 && t - this.moveStart >= 450) { // ≥ 0,45 s hors de la zone de repos : pas un sursaut des points
          const full = reachedTop && heldOk;
          const fl = [...this.repFaults];
          const minSec = s.minRepSec || 1.0;
          if (dur < minSec * 0.75) { fl.push('slow'); this.onCue('slow'); }
          if (!reachedTop) this.onCue('depth'); else if (!heldOk) this.onCue('holdIt');
          const quality = Math.max(0, Math.min(1, 1 - 0.25 * new Set(fl).size - (full ? 0 : 0.3)));
          this.reps++; full ? this.full++ : this.partial++;
          for (const f of fl) this.faultCount[f] = (this.faultCount[f] || 0) + 1;
          const rep = { n: this.reps, full, dur: +dur.toFixed(1), faults: fl, quality: +quality.toFixed(2), peak: +this.peak.toFixed(2),
            meas: { metric: s.metric, peakValue: +(+this.peakVal).toFixed(1), targetValue: +(+to).toFixed(1), romPct: Math.round(this.peak * 100), minRepSec: s.minRepSec || 1.0, checks: Object.values(this.repWorst) } };
          this.repLog.push(rep);
          this.onRep(rep);
        }
        this.state = 'rest'; this.peak = 0; this.topSince = 0; this.topOk = false;
      }
    }
    return { phase: this.state, value: v, target: to, side, progress: Math.max(0, Math.min(1, P)), reps: this.reps, faults };
  }

  // Répétition jugée « mauvais mouvement » par le contrôle de la démonstration : elle ne compte pas comme complète
  flagRep(fault) {
    const r = this.repLog[this.repLog.length - 1]; if (!r || r.faults.includes(fault)) return;
    r.faults.push(fault); this.faultCount[fault] = (this.faultCount[fault] || 0) + 1;
    if (r.full) { r.full = false; this.full--; this.partial++; }
    r.quality = Math.max(0, +(r.quality - 0.4).toFixed(2));
  }
  summary() {
    const q = this.repLog.length ? this.repLog.reduce((a, r) => a + r.quality, 0) / this.repLog.length : null;
    return {
      mode: this.mode, reps: this.reps, full: this.full, partial: this.partial,
      holdSec: Math.round(this.holdSec), quality: q == null ? (this.mode === 'hold' && this.holdSec > 0 ? 0.85 : null) : +q.toFixed(2),
      faults: this.faultCount, reps_detail: this.repLog,
    };
  }
}

// ---------- Dessin du squelette ----------
// Segment ou point peu visible (caché, hors image, deviné par le modèle) : on ne le dessine pas
export const DRAW_VIS = 0.5;
export const SKELETON_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
/** lm : points en coordonnées normalisées de l'écran. Retourne les articulations réellement dessinées
 *  ({ i, x, y } en pixels du canevas, miroir compris). */
export function drawSkeleton(g, lm, w, h, faultJoints = new Set(), mirror = false, keep = false) {
  if (!keep) g.clearRect(0, 0, w, h);
  if (!lm) return null;
  const X = (l) => (mirror ? (1 - l.x) * w : l.x * w);
  const seen = (l) => l && (l.visibility ?? 1) >= DRAW_VIS;
  g.lineCap = 'round';
  const { ok, bad } = poseColors();
  g.lineWidth = Math.max(3, w / 160);
  for (const [a, b] of CONNECTIONS) {
    const A = lm[a], B = lm[b];
    if (!seen(A) || !seen(B)) continue;
    g.strokeStyle = faultJoints.has(a) || faultJoints.has(b) ? bad : ok;
    g.beginPath(); g.moveTo(X(A), A.y * h); g.lineTo(X(B), B.y * h); g.stroke();
  }
  const drawn = [];
  for (const i of SKELETON_JOINTS) {
    const l = lm[i];
    if (!seen(l)) continue;
    g.fillStyle = faultJoints.has(i) ? bad : '#ffffff';
    g.beginPath(); g.arc(X(l), l.y * h, Math.max(3, w / 140), 0, Math.PI * 2); g.fill();
    drawn.push({ i, x: X(l), y: l.y * h });
  }
  return drawn;
}

// Articulations à colorer selon la faute détectée
export const FAULT_JOINTS = {
  valgus: [25, 26], trunk: [11, 12, 23, 24], trunkSway: [11, 12, 23, 24], arch: [23, 24], sideLean: [11, 12],
  shrug: [11, 12], symmetry: [13, 14], pelvis: [23, 24], elbowSide: [13, 14], elbowPin: [13, 14],
  kneeStraight: [25, 26], heelDown: [29, 30], bodyLine: [23, 24], headTilt: [0], hinge: [25, 26],
};
