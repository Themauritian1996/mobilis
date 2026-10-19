// Estimation de pose 2D sur l'appareil (MediaPipe Pose Landmarker) + métriques biomécaniques + compteur de répétitions.
import { CONFIG } from './config.js';

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

export function detect(video, ts) {
  if (!landmarker || video.readyState < 2) return null;
  const res = landmarker.detectForVideo(video, ts);
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
  neckFwd: (p, s, c) => (c.facing * (S(p, s, 'ear').x - S(p, s, 'sh').x)) / c.torso,
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
};
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
};
const SIDED = new Set(['knee', 'hip', 'elbow', 'ankle', 'bodyLine', 'armElev', 'shFlex', 'shinLean', 'neckFwd', 'wristUp', 'heelRise', 'erFront', 'elbowAway', 'hipAbd', 'kneeValgus']);

function visibleSide(p) {
  const sc = (s) => ['sh', 'el', 'wr', 'hip', 'kn', 'an'].reduce((a, n) => a + S(p, s, n).v, 0);
  return sc('L') >= sc('R') ? 'L' : 'R';
}

export function metric(name, p, side, opts = {}) {
  const c = ctx(p);
  if (opts.both && SIDED.has(name)) return (M[name](p, 'L', c) + M[name](p, 'R', c)) / 2;
  return M[name](p, SIDED.has(name) ? side : null, c);
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
export class Tracker {
  constructor(ex, planeKey, { romFactor = 1, holdTarget = 0, onRep = () => {}, onCue = () => {} } = {}) {
    this.ex = ex; this.mode = ex.track.mode;
    this.spec = ex.track.planes[planeKey];
    this.rom = romFactor; this.holdTarget = holdTarget;
    this.onRep = onRep; this.onCue = onCue;
    this.calib = []; this.base = null; this.side = null;
    this.reps = 0; this.full = 0; this.partial = 0; this.repLog = [];
    this.state = 'rest'; this.peak = 0; this.p = 0; this.topSince = 0; this.repStart = 0;
    this.repFaults = new Set(); this.violation = {}; this.holdSec = 0; this.lastT = 0;
    this.worstFrame = null; this.faultCount = {}; this.lastChecks = []; this.repWorst = {}; this.peakVal = null;
  }

  get calibrated() { return !!this.base; }

  valueFor(p, side) {
    const s = this.spec;
    let v = metric(s.metric, p, side, { both: s.both });
    if (s.abs) v = Math.abs(v);
    return v;
  }

  update(p, t) {
    const dt = this.lastT ? Math.min(0.2, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    const s = this.spec;
    if (!this.side) this.side = visibleSide(p);

    // Calibration : ~0,6 s immobile en position de départ
    if (!this.base) {
      const snap = { L: this.valueFor(p, 'L'), R: this.valueFor(p, 'R'), checks: {} };
      for (const ck of s.checks || []) if (ck.rel) snap.checks[ck.m] = metric(ck.m, p, this.side);
      this.calib.push(snap);
      if (this.calib.length >= 18) {
        const avg = (f) => this.calib.reduce((a, x) => a + f(x), 0) / this.calib.length;
        this.base = { L: avg((x) => x.L), R: avg((x) => x.R), checks: {} };
        for (const ck of s.checks || []) if (ck.rel) this.base.checks[ck.m] = avg((x) => x.checks[ck.m]);
      }
      return { phase: 'calibrating', progress: 0, reps: 0, holdSec: 0 };
    }

    // Choix du côté : 'auto' = côté qui bouge le plus, sinon côté le plus visible
    let side = this.side, v;
    const prog = (val, sd) => {
      const from = s.rel ? this.base[sd] : s.from;
      const to = s.rel ? this.base[sd] + s.delta * this.rom : s.from + (s.to - s.from) * this.rom;
      return { pr: (val - from) / ((to - from) || 1), from, to };
    };
    if (s.side === 'auto') {
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
      const bad = (ck.max != null && m > ck.max) || (ck.min != null && m < ck.min);
      const active = this.mode === 'hold' || this.state !== 'rest';
      checksNow.push({ cue: ck.cue, metric: ck.m, value: +m.toFixed(ck.max != null && Math.abs(ck.max) < 2 ? 3 : 1), limit: ck.max ?? ck.min, kind: ck.max != null ? 'max' : 'min', relative: !!ck.rel, bad });
      if (active) {
        const w = this.repWorst[ck.cue];
        const worse = !w || (ck.max != null ? m > w.value : m < w.value);
        if (worse) this.repWorst[ck.cue] = { cue: ck.cue, metric: ck.m, value: +m.toFixed(3), limit: ck.max ?? ck.min, kind: ck.max != null ? 'max' : 'min', relative: !!ck.rel };
      }
      this.violation[ck.cue] = bad && active ? (this.violation[ck.cue] || 0) + 1 : 0;
      if (this.violation[ck.cue] >= 6) faults.push(ck.cue);
    }
    for (const f of faults) { this.repFaults.add(f); this.onCue(f); }
    this.lastChecks = checksNow;

    if (this.mode === 'hold') {
      const ok = v >= s.min && v <= s.max && faults.length === 0;
      if (ok) this.holdSec += dt;
      else if (this.holdSec > 0.5 && !faults.length) this.onCue('holdIt');
      for (const f of faults) this.faultCount[f] = (this.faultCount[f] || 0) + dt;
      return { phase: ok ? 'holding' : 'adjust', value: v, side, progress: ok ? 1 : 0, holdSec: this.holdSec, faults, checks: checksNow, range: [s.min, s.max] };
    }

    // Mode répétitions
    const { pr, to } = prog(v, side);
    this.p = this.p * 0.55 + Math.max(-0.5, Math.min(1.5, pr)) * 0.45;
    const P = this.p, holdTop = s.holdTop || 0;
    if (this.p0 == null) {
      // progression de la position de départ réelle (chaque patient part d'un angle différent)
      const b = Math.max(prog(this.base.L, 'L').pr, prog(this.base.R, 'R').pr); // 'auto' : le côté au repos fixe le plancher
      this.p0 = s.rel ? 0 : Math.max(0, Math.min(0.45, s.side === 'auto' ? b : prog(this.base[side], side).pr));
    }
    const startT = this.p0 + 0.2, endT = this.p0 + 0.1;
    if (this.state === 'rest' && P > startT) {
      this.state = 'moving'; this.peak = P; this.repStart = t; this.repFaults = new Set(); this.topSince = 0; this.repWorst = {}; this.peakVal = v;
    }
    if (this.state === 'moving') {
      if (P > this.peak) { this.peak = P; this.peakVal = v; }
      if (P >= 0.9) { if (!this.topSince) this.topSince = t; }
      else if (this.topSince && holdTop && (t - this.topSince) / 1000 < holdTop && P < 0.8) this.onCue('holdIt');
      if (this.topSince && P >= 0.9 && holdTop && (t - this.topSince) / 1000 >= holdTop) this.topOk = true;
      if (P < endT) {
        const dur = (t - this.repStart) / 1000;
        const reachedTop = this.peak >= 0.9;
        const heldOk = !holdTop || this.topOk;
        if (this.peak >= 0.5) {
          const full = reachedTop && heldOk;
          const fl = [...this.repFaults];
          const minSec = s.minRepSec || 1.0;
          if (dur < minSec) { fl.push('slow'); this.onCue('slow'); }
          if (!reachedTop) this.onCue('depth');
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
export function drawSkeleton(g, lm, w, h, faultJoints = new Set(), mirror = false, keep = false) {
  if (!keep) g.clearRect(0, 0, w, h);
  if (!lm) return;
  const X = (l) => (mirror ? (1 - l.x) * w : l.x * w);
  g.lineCap = 'round';
  const css = getComputedStyle(document.documentElement);
  const ok = css.getPropertyValue('--pose-ok').trim() || '#2dd4bf';
  const bad = css.getPropertyValue('--pose-bad').trim() || '#ff7a59';
  g.lineWidth = Math.max(3, w / 160);
  for (const [a, b] of CONNECTIONS) {
    const A = lm[a], B = lm[b];
    if ((A.visibility ?? 1) < 0.4 || (B.visibility ?? 1) < 0.4) continue;
    g.strokeStyle = faultJoints.has(a) || faultJoints.has(b) ? bad : ok;
    g.beginPath(); g.moveTo(X(A), A.y * h); g.lineTo(X(B), B.y * h); g.stroke();
  }
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const l = lm[i];
    if ((l.visibility ?? 1) < 0.4) continue;
    g.fillStyle = faultJoints.has(i) ? bad : '#ffffff';
    g.beginPath(); g.arc(X(l), l.y * h, Math.max(3, w / 140), 0, Math.PI * 2); g.fill();
  }
}

// Articulations à colorer selon la faute détectée
export const FAULT_JOINTS = {
  valgus: [25, 26], trunk: [11, 12, 23, 24], trunkSway: [11, 12, 23, 24], arch: [23, 24], sideLean: [11, 12],
  shrug: [11, 12], symmetry: [13, 14], pelvis: [23, 24], elbowSide: [13, 14], elbowPin: [13, 14],
  kneeStraight: [25, 26], heelDown: [29, 30], bodyLine: [23, 24], headTilt: [0], hinge: [25, 26],
};
