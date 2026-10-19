// Vérification du mouvement : le patient fait-il bien l'exercice de la démonstration ?
// On compare, en continu, les angles articulaires 2D du patient (MediaPipe) à ceux du schéma de l'exercice
// (cinématique du bonhomme, image de départ → image d'arrivée) :
//  - articulations qui doivent rester FIXES (ex. coude tendu au pendule) : écart à l'angle attendu, mouvement parasite ;
//  - articulations qui doivent BOUGER : amplitude suffisante et dans la bonne zone.
// Exemple : flexion du biceps au lieu du pendule de Codman → tronc droit (attendu penché ~70°) + coude qui plie (attendu tendu) → « mauvais mouvement ».
import { pose, interpParams } from './figure.js';

const DEG = 180 / Math.PI;
const norm = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };
const dirOf = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1])) * DEG; // 0 = haut, 90 = droite de l'image
const rel = (a1, a2) => Math.abs(norm(a2 - a1));

// Articulations évaluées : [joint, segment A (de, vers), segment B (de, vers)] — angle entre les deux segments
// Vue de côté : membres « proche » (côté caméra) et « loin ». Vue de face : droite / gauche.
const SIDE_FEATS = {
  trunk: { kind: 'incl', seg: ['hip', 'sh'] },
  shoulder: { kind: 'rel', a: ['hip', 'sh'], b: ['sh', 'el'], at: 'sh' },
  elbow: { kind: 'rel', a: ['sh', 'el'], b: ['el', 'wr'], at: 'el' },
  hip: { kind: 'rel', a: ['hip', 'sh'], b: ['hip', 'kn'], at: 'hip' },
  knee: { kind: 'rel', a: ['hip', 'kn'], b: ['kn', 'an'], at: 'kn' },
};
const FRONT_FEATS = {
  trunk: { kind: 'incl', seg: ['hipM', 'shM'] },
  shoulder: { kind: 'rel', a: ['shM', 'hipM'], b: ['sh', 'el'], at: 'sh' },
  elbow: { kind: 'rel', a: ['sh', 'el'], b: ['el', 'wr'], at: 'el' },
  hipAbd: { kind: 'rel', a: ['shM', 'hipM'], b: ['hip', 'kn'], at: 'hip' },
  knee: { kind: 'rel', a: ['hip', 'kn'], b: ['kn', 'an'], at: 'kn' },
};
const LIMB = { shoulder: 'arm', elbow: 'arm', hip: 'leg', hipAbd: 'leg', knee: 'leg', trunk: null };

// Points du schéma → mêmes noms que les points du patient
function figPoints(j, view, limbSet) {
  if (view === 'front') {
    const S = limbSet; // 'R' | 'L'
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return { sh: j['sh' + S], el: j['elbow' + S], wr: j['wrist' + S], hip: j['hip' + S], kn: j['knee' + S], an: j['ankle' + S], shM: mid(j.shR, j.shL), hipM: mid(j.hipR, j.hipL) };
  }
  const f = limbSet === 'far' ? '2' : '';
  return { sh: j.shoulder, el: j['elbow' + f], wr: j['wrist' + f], hip: j.pelvis, kn: j['knee' + f], an: j['ankle' + f] };
}
function featVal(def, P) {
  if (def.kind === 'incl') { const [a, b] = def.seg; if (!P[a] || !P[b]) return null; return Math.abs(norm(dirOf(P[a], P[b]))); }
  const [a1, a2] = def.a, [b1, b2] = def.b;
  if (!P[a1] || !P[a2] || !P[b1] || !P[b2]) return null;
  return rel(dirOf(P[a1], P[a2]), dirOf(P[b1], P[b2]));
}

function lerpParams(a, b, t) {
  const o = { ...a };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (typeof a[k] === 'number' && typeof b[k] === 'number') o[k] = a[k] + (b[k] - a[k]) * t;
    else if (b[k] != null) o[k] = b[k];
  }
  return o;
}

// Plages attendues de chaque articulation, pour chaque « jeu » de membres du schéma
export function reference(ex) {
  const fig = ex.fig, view = fig.view || 'side';
  if (view !== 'side' && view !== 'front') return null; // main / pied : mouvements trop fins pour ce contrôle
  const feats = view === 'front' ? FRONT_FEATS : SIDE_FEATS;
  const sets = view === 'front' ? ['R', 'L'] : ['near', 'far'];
  const frames = fig.frames.length > 1 ? [0, 0.5, 1].map((t) => interpParams(fig.frames[0], fig.frames[1], t)) : fig.frames;
  const ref = { view, feats: {} };
  for (const set of sets) for (const [name, def] of Object.entries(feats)) {
    if (!LIMB[name] && set !== sets[0]) continue;
    const vals = frames.map((fr) => featVal(def, figPoints(pose(fig, fr), view, set))).filter((v) => v != null);
    if (!vals.length) continue;
    const min = Math.min(...vals), max = Math.max(...vals);
    ref.feats[LIMB[name] ? `${name}.${set}` : name] = { name, set, min, max, mid: (min + max) / 2, delta: max - min, def };
  }
  return ref;
}

// Points du patient (pixels) → noms communs ; vue de côté : « proche » = côté le plus visible
function livePoints(p, view, set, near) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
  const P = (o) => (o && o.v > 0.5 ? [o.x, o.y] : null);
  if (view === 'front') {
    const S = set; // le schéma de face montre la droite du patient à gauche de l'écran : on teste les deux attributions
    return { sh: P(p['sh' + S]), el: P(p['el' + S]), wr: P(p['wr' + S]), hip: P(p['hip' + S]), kn: P(p['kn' + S]), an: P(p['an' + S]), shM: P(mid(p.shL, p.shR)), hipM: P(mid(p.hipL, p.hipR)) };
  }
  const S = set === 'near' ? near : near === 'L' ? 'R' : 'L';
  return { sh: P(p['sh' + S]), el: P(p['el' + S]), wr: P(p['wr' + S]), hip: P(p['hip' + S]), kn: P(p['kn' + S]), an: P(p['an' + S]) };
}

const TOL = { trunk: 28, shoulder: 35, elbow: 30, hip: 32, hipAbd: 25, knee: 30 };

export class MoveMatcher {
  constructor(ex) {
    this.ex = ex; this.ref = reference(ex);
    this.buf = []; this.t0 = 0; this.lastEval = 0; this.badStreak = 0; this.state = { status: 'na', issues: [], live: {} };
    this.wrongTime = 0; this.totalTime = 0; this.lastT = 0;
  }
  get usable() { return !!this.ref; }

  // p : points en pixels (toPx) ; t : ms
  update(p, t) {
    if (!this.ref) return this.state;
    if (!this.t0) this.t0 = t;
    const dt = this.lastT ? Math.min(0.2, (t - this.lastT) / 1000) : 0; this.lastT = t;
    const view = this.ref.view;
    const vis = (s) => ['sh', 'el', 'wr', 'hip', 'kn', 'an'].reduce((a, n) => a + (p[n + s]?.v || 0), 0);
    const near = vis('L') >= vis('R') ? 'L' : 'R';
    // deux attributions possibles des membres du schéma aux membres du patient
    const maps = view === 'front' ? [{ R: 'R', L: 'L' }, { R: 'L', L: 'R' }] : [{ near: 'near', far: 'far' }, { near: 'far', far: 'near' }];
    const sample = { t, m: maps.map((mp) => {
      const o = {};
      for (const [k, r] of Object.entries(this.ref.feats)) o[k] = featVal(r.def, livePoints(p, view, mp[r.set], near));
      return o;
    }), P: { near } };
    this.buf.push(sample);
    while (this.buf.length && t - this.buf[0].t > 4000) this.buf.shift();
    this.totalTime += dt; if (this.state.status === 'wrong') this.wrongTime += dt;
    if (t - this.lastEval < 500) return this.state;
    this.lastEval = t;
    const elapsed = (t - this.t0) / 1000;
    let best = null;
    for (let mi = 0; mi < maps.length; mi++) {
      const issues = [], live = {}; let err = 0, n = 0;
      for (const [k, r] of Object.entries(this.ref.feats)) {
        const all = this.buf.map((s) => s.m[mi][k]).filter((v) => v != null);
        if (all.length < 6) continue;
        const recent = this.buf.filter((s) => t - s.t < 1500).map((s) => s.m[mi][k]).filter((v) => v != null);
        if (!recent.length) continue;
        const med = recent.slice().sort((a, b) => a - b)[recent.length >> 1];
        const lo = Math.min(...all), hi = Math.max(...all), range = hi - lo, tol = TOL[r.name] || 30;
        live[k] = { value: Math.round(recent[recent.length - 1]), range: Math.round(range) }; n++;
        if (r.delta < 12) { // doit rester fixe
          const off = med - r.mid;
          if (Math.abs(off) > tol) { issues.push({ k, name: r.name, kind: 'off', live: Math.round(med), expected: Math.round(r.mid), dir: Math.sign(off) }); err += Math.abs(off); }
          else if (range > Math.max(45, r.delta + 35)) { issues.push({ k, name: r.name, kind: 'unexpected', live: Math.round(range), expected: Math.round(r.delta) }); err += range - 35; }
        } else { // doit bouger
          if (lo > r.max + tol || hi < r.min - tol) {
            const off = (lo > r.max + tol ? lo - r.max : hi - r.min);
            issues.push({ k, name: r.name, kind: 'off', live: Math.round(med), expected: Math.round(r.mid), dir: Math.sign(off) }); err += Math.abs(off);
          } else if (elapsed > 5 && range < Math.max(10, 0.35 * r.delta)) { issues.push({ k, name: r.name, kind: 'still', live: Math.round(range), expected: Math.round(r.delta) }); err += 0.35 * r.delta - range; }
        }
      }
      const cand = { issues, live, err, n, map: mi };
      if (!best || issues.length < best.issues.length || (issues.length === best.issues.length && err < best.err)) best = cand;
    }
    if (!best || best.n < 2) { this.state = { status: 'unsure', issues: [], live: best?.live || {} }; this.badStreak = 0; return this.state; }
    this.badStreak = best.issues.length ? this.badStreak + 1 : 0;
    const status = this.badStreak >= 3 ? 'wrong' : best.issues.length ? 'checking' : 'ok';
    // problème principal = plus grand écart
    const W = { trunk: 60, hip: 40 };
    const prio = (i) => (i.kind === 'off' ? 100 : 0) + (W[i.name] || 20) - (i.k.endsWith('.far') ? 30 : 0) + Math.min(90, Math.abs(i.live - i.expected)) / 3;
    best.issues.sort((a, b) => prio(b) - prio(a));
    this.state = { status, issues: best.issues, live: best.live, map: best.map, near };
    return this.state;
  }
  get wrongShare() { return this.totalTime ? this.wrongTime / this.totalTime : 0; }
  resetStats() { this.wrongTime = 0; this.totalTime = 0; }

  // Description en anglais pour l'IA
  describe() {
    const s = this.state;
    if (!this.ref) return 'Movement check vs demonstration: not available (fine hand/foot movement).';
    if (s.status === 'na' || s.status === 'unsure') return 'Movement check vs demonstration: not enough visible joints.';
    const exp = Object.entries(this.ref.feats).map(([k, r]) => `${k} ${r.delta < 12 ? `should stay ~${Math.round(r.mid)}°` : `should move ${Math.round(r.min)}–${Math.round(r.max)}°`}${s.live[k] ? ` (live ${s.live[k].value}°, range ${s.live[k].range}°)` : ''}`).join('; ');
    return `Movement check vs demonstration: ${s.status === 'wrong' ? 'MISMATCH — the patient is NOT doing the prescribed movement' : s.status === 'ok' ? 'matches' : 'uncertain'}. ${s.issues.map((i) => `${i.k}: ${i.kind} (live ${i.live}°, expected ${i.expected}°)`).join('; ')}. Joint angles: ${exp}.`;
  }
}

// Consigne correspondant au problème principal (clé i18n)
export function hintKey(issue, view = 'side') {
  if (!issue) return 'mv_generic';
  const { name, kind, dir } = issue;
  if (kind === 'still') return name === 'shoulder' || name === 'elbow' ? 'mv_armMove' : name === 'trunk' ? 'mv_generic' : 'mv_legMove';
  if (kind === 'unexpected') return { elbow: 'mv_elbowStill', shoulder: 'mv_armStill', knee: 'mv_kneeStill', hip: 'mv_hipStill', hipAbd: 'mv_legStill', trunk: 'mv_trunkStill' }[name] || 'mv_generic';
  if (Math.abs(issue.live - issue.expected) > 75 && (name === 'trunk' || name === 'hip')) return 'mv_posture';
  switch (name) {
    case 'trunk': return dir < 0 ? 'mv_trunkForward' : 'mv_trunkUp';
    case 'elbow': return dir > 0 ? 'mv_elbowStraighter' : 'mv_elbowBend';
    case 'knee': return dir > 0 ? 'mv_kneeStraighter' : 'mv_kneeBend';
    case 'hip': return dir > 0 ? 'mv_hipBend' : 'mv_hipStraighter';
    case 'shoulder': return (view === 'front' ? dir < 0 : dir > 0) ? 'mv_armHigher' : 'mv_armLower';
    case 'hipAbd': return dir < 0 ? 'mv_legOut' : 'mv_legIn';
    default: return 'mv_generic';
  }
}

// ---------- Lignes de guidage sur la vidéo ----------
// Segments des articulations en jeu : bleu = doit bouger, blanc pointillé = doit rester fixe, rouge = à corriger,
// vert pointillé = position cible. Coordonnées normalisées (0–1) de l'écran.
export function drawGuides(g, lmScreen, W, H, matcher, mirror) {
  const ref = matcher.ref, st = matcher.state;
  if (!ref || !lmScreen || st.status === 'na') return;
  const I = { shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28 };
  const X = (l) => (mirror ? (1 - l.x) * W : l.x * W), Y = (l) => l.y * H;
  const pt = (n) => {
    if (n === 'shM' || n === 'hipM') { const a = pt(n === 'shM' ? 'shL' : 'hipL'), b = pt(n === 'shM' ? 'shR' : 'hipR'); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null; }
    const l = lmScreen[I[n]]; return l && (l.visibility ?? 1) > 0.5 ? [X(l), Y(l)] : null;
  };
  const mapSet = (set) => {
    if (ref.view === 'front') { const swap = st.map === 1; return set === 'R' ? (swap ? 'L' : 'R') : (swap ? 'R' : 'L'); }
    const near = st.near || 'L'; const swap = st.map === 1; const isNear = (set === 'near') !== swap;
    return isNear ? near : near === 'L' ? 'R' : 'L';
  };
  // Lisibilité : 2 problèmes au plus en rouge, une seule ligne cible (le problème annoncé), membres « loin » seulement s'ils sont en cause
  const top = st.status === 'wrong' || st.status === 'checking' ? st.issues.slice(0, 2) : [];
  const bad = new Map(top.map((i) => [i.k, i]));
  const targetK = top[0]?.k;
  const labels = [];
  g.save(); g.lineCap = 'round';
  const lw = Math.max(4, W / 90);
  for (const [k, r] of Object.entries(ref.feats)) {
    if (r.def.kind !== 'rel') {
      const issue = bad.get(k); if (!issue || k !== targetK) continue;
      const S = ref.view === 'front' ? null : mapSet('near');
      const H1 = S ? pt('hip' + S) : pt('hipM'), S1 = S ? pt('sh' + S) : pt('shM'); if (!H1 || !S1) continue;
      g.setLineDash([]); g.strokeStyle = '#ff5a4f'; g.lineWidth = lw; g.beginPath(); g.moveTo(...H1); g.lineTo(...S1); g.stroke();
      const len = Math.hypot(S1[0] - H1[0], S1[1] - H1[1]), cur = Math.atan2(S1[0] - H1[0], -(S1[1] - H1[1]));
      const tgt = (Math.sign(cur) || 1) * (r.mid / DEG);
      g.setLineDash([lw, lw]); g.strokeStyle = '#3ccf7b'; g.lineWidth = lw * 0.8;
      g.beginPath(); g.moveTo(...H1); g.lineTo(H1[0] + Math.sin(tgt) * len, H1[1] - Math.cos(tgt) * len); g.stroke();
      continue;
    }
    const S = mapSet(r.set);
    const nm = (x) => (x === 'shM' || x === 'hipM' ? x : x + S);
    const [a1, a2] = r.def.a.map(nm), [b1, b2] = r.def.b.map(nm);
    if (!a1 || !a2 || !b1 || !b2) continue;
    const A1 = pt(a1), A2 = pt(a2), B1 = pt(b1), B2 = pt(b2);
    if (!A1 || !A2 || !B1 || !B2) continue;
    const issue = bad.get(k), moving = r.delta >= 12;
    if (!moving && !issue) continue; // on ne montre que ce qui bouge ou ce qui est à corriger
    if (!issue && (k.endsWith('.far') || k.endsWith('.L'))) continue;
    g.setLineDash(moving ? [] : [lw * 1.2, lw * 1.2]);
    g.strokeStyle = issue ? '#ff5a4f' : moving ? '#38bdf8' : 'rgba(255,255,255,.85)';
    g.lineWidth = lw;
    g.beginPath(); g.moveTo(...B1); g.lineTo(...B2); g.stroke();
    // cible : direction attendue du segment B à partir du segment A
    if (issue && issue.kind === 'off' && k === targetK) {
      const dA = Math.atan2(A2[0] - A1[0], -(A2[1] - A1[1])), dB = Math.atan2(B2[0] - B1[0], -(B2[1] - B1[1]));
      const sgn = Math.sign(((dB - dA + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) || 1;
      const tgt = dA + sgn * (r.mid / DEG), len = Math.hypot(B2[0] - B1[0], B2[1] - B1[1]);
      g.setLineDash([lw, lw]); g.strokeStyle = '#3ccf7b'; g.lineWidth = lw * 0.8;
      g.beginPath(); g.moveTo(...B1); g.lineTo(B1[0] + Math.sin(tgt) * len, B1[1] - Math.cos(tgt) * len); g.stroke();
    }
    // angle mesuré, près de l'articulation
    const live = st.live[k];
    if (live && !labels.some(([lx, ly]) => Math.hypot(lx - B1[0], ly - B1[1]) < W / 12)) {
      labels.push(B1);
      g.setLineDash([]); g.font = `700 ${Math.round(W / 26)}px Manrope, sans-serif`;
      const txt = `${live.value}°`, tw = g.measureText(txt).width, [x, y] = B1;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 10, y - W / 26 - 4, tw + 12, W / 26 + 10);
      g.fillStyle = issue ? '#ff8a80' : '#fff'; g.fillText(txt, x + 16, y);
    }
  }
  g.restore();
}
