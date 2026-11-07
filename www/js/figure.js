import { STRUCTURES } from './data/anatomy.js';
import { tr } from './i18n.js';

// Schéma cinétique animé : bonhomme 2D par cinématique directe (vue de côté, de face, main, pied).
// Angles absolus en degrés : 0 = haut, 90 = avant (droite de l'écran), 180 = bas, 270 = arrière.

const L = { trunk: 52, head: 17, uarm: 30, farm: 27, thigh: 42, shank: 40, foot: 15 };
const rad = (d) => (d * Math.PI) / 180;
const dir = (a, len) => [Math.sin(rad(a)) * len, -Math.cos(rad(a)) * len];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const SIDE_DEFAULT = { trunk: 0, head: 0, uarm: 180, farm: 175, thigh: 180, shank: 180, foot: 90 };
const FRONT_DEFAULT = {
  trunk: 0, head: 0, headRot: 0, shAbdR: 8, shAbdL: 8, elbowR: 0, elbowL: 0, farmScaleR: 1, farmScaleL: 1,
  hipAbdR: 4, hipAbdL: 4, thighScaleR: 1, thighScaleL: 1, shankR: 0, shankL: 0, liftR: 0, liftL: 0, pelvisTilt: 0,
};
const HAND_DEFAULT = { wrist: 0, mcp: 0, pip: 0, dip: 0, thumb: 20, thumbIp: 0, forearmRot: 0, opp: 0, spread: 0, tilt: 0 };
const FOOT_DEFAULT = { arch: 6, toes: 0, ankle: 0, pf: 0, inv: 0 };

// ---------- Cinématique ----------
function sidePose(p, anchor) {
  const q = { ...SIDE_DEFAULT, ...p };
  const far = {
    thigh: q.thigh2 ?? q.thigh, shank: q.shank2 ?? q.shank, foot: q.foot2 ?? q.foot,
    uarm: q.uarm2 ?? q.uarm, farm: q.farm2 ?? q.farm,
  };
  const j = {};
  j.pelvis = [0, 0];
  j.shoulder = add(j.pelvis, dir(q.trunk, L.trunk));
  j.head = add(j.shoulder, dir(q.trunk + q.head, L.head));
  // nez : sens du regard (suit le tronc ; nod > 0 = menton vers la poitrine) — rend lisibles le cou et l'orientation du corps
  j.nose = add(j.head, dir(q.trunk + 90 + (q.nod || 0), 9));
  j.elbow = add(j.shoulder, dir(q.uarm, L.uarm));
  j.wrist = add(j.elbow, dir(q.farm, L.farm));
  // ts / ss (et ts2 / ss2) : longueur apparente de la cuisse / jambe (raccourci de perspective, ex. coquillage)
  j.knee = add(j.pelvis, dir(q.thigh, L.thigh * (q.ts ?? 1)));
  j.ankle = add(j.knee, dir(q.shank, L.shank * (q.ss ?? 1)));
  j.toe = add(j.ankle, dir(q.foot, L.foot));
  j.elbow2 = add(j.shoulder, dir(far.uarm, L.uarm));
  j.wrist2 = add(j.elbow2, dir(far.farm, L.farm));
  j.knee2 = add(j.pelvis, dir(far.thigh, L.thigh * (q.ts2 ?? q.ts ?? 1)));
  j.ankle2 = add(j.knee2, dir(far.shank, L.shank * (q.ss2 ?? q.ss ?? 1)));
  j.toe2 = add(j.ankle2, dir(far.foot, L.foot));
  j.hip = j.pelvis;
  j.bend = q.bend || 0;
  return place(j, anchor);
}

function frontPose(p, anchor) {
  const q = { ...FRONT_DEFAULT, ...p };
  const j = {};
  j.pelvis = [0, 0];
  const hipW = 11;
  const pt = rad(q.pelvisTilt);
  j.hipR = [-hipW * Math.cos(pt), -hipW * Math.sin(pt)];
  j.hipL = [hipW * Math.cos(pt), hipW * Math.sin(pt)];
  j.neck = add(j.pelvis, dir(q.trunk, L.trunk));
  const sw = 18;
  const tr = rad(q.trunk);
  j.shR = add(j.neck, [-sw * Math.cos(tr), -sw * Math.sin(tr) + 3]);
  j.shL = add(j.neck, [sw * Math.cos(tr), sw * Math.sin(tr) + 3]);
  j.head = add(j.neck, dir(q.trunk + q.head, L.head));
  const aR = 180 + q.shAbdR, aL = 180 - q.shAbdL;
  j.elbowR = add(j.shR, dir(aR, L.uarm));
  j.elbowL = add(j.shL, dir(aL, L.uarm));
  j.wristR = add(j.elbowR, dir(aR + q.elbowR, L.farm * q.farmScaleR));
  j.wristL = add(j.elbowL, dir(aL - q.elbowL, L.farm * q.farmScaleL));
  const tRa = 180 + q.hipAbdR, tLa = 180 - q.hipAbdL;
  j.kneeR = add(j.hipR, dir(tRa, L.thigh * q.thighScaleR));
  j.kneeL = add(j.hipL, dir(tLa, L.thigh * q.thighScaleL));
  j.ankleR = add(j.kneeR, dir(180 + q.shankR, L.shank));
  j.ankleL = add(j.kneeL, dir(180 - q.shankL, L.shank));
  j.ankleR[1] -= q.liftR; j.ankleL[1] -= q.liftL;
  j.headRot = q.headRot;
  return place(j, anchor);
}

// ---------- Main, vue de côté : avant-bras appuyé, paume vers le bas (ou le haut / pouce en haut) ----------
// wrist, mcp, pip, dip : angles en degrés, + = vers la paume (flexion), − = extension.
function handPose(p, anchor) {
  const q = { ...HAND_DEFAULT, ...p };
  const s = q.side === 'palmUp' ? -1 : 1; // pouce en haut : comme paume en bas (+ = déviation cubitale, vers le bas) // sens de la flexion à l'écran (paume vers le bas : vers le bas)
  const j = { side: q.side || 'palmDown', s, forearmRot: q.forearmRot };
  j.elbow = [0, 0];
  j.wrist = [98, 0];
  const pa = 90 + s * q.wrist;
  j.palmDir = pa;
  j.mcp = add(j.wrist, dir(pa, 38));
  j.pip = add(j.mcp, dir(pa + s * q.mcp, 22));
  j.dip = add(j.pip, dir(pa + s * (q.mcp + q.pip), 14));
  j.tip = add(j.dip, dir(pa + s * (q.mcp + q.pip + q.dip), 11));
  // pouce : naît du côté paume, près du poignet
  // pouce (vue latérale) : part de la base de la paume, reste le long de l'index ; « thumb » = flexion/opposition vers la paume
  const th = Math.min(q.thumb, 60) * 0.55;
  j.thumbBase = add(add(j.wrist, dir(pa, 10)), dir(pa + 90 * s, 3));
  j.thumbMcp = add(j.thumbBase, dir(pa + s * th, 14));
  j.thumbTip = add(j.thumbMcp, dir(pa + s * (th + q.thumbIp * 0.8), 11));
  j.curl = q.mcp + q.pip + q.dip;
  return place(j, anchor);
}

// ---------- Main, vue de face (paume vers soi, doigts vers le haut) : opposition du pouce, poing, prise ----------
// mcp/pip/dip : flexion commune des 4 doigts ; opp : 0 = pouce au repos, 1–4 = pouce touche l'index…l'auriculaire ;
// thumb : écartement du pouce (degrés) ; fingers : flexion propre à chaque doigt [index, majeur, annulaire, auriculaire] (0–1).
const FINGERS = [{ x: 22, len: [25, 15, 11] }, { x: 7, len: [27, 17, 12] }, { x: -8, len: [25, 16, 11] }, { x: -22, len: [20, 12, 9] }];
function palmPose(p, anchor) {
  const q = { ...HAND_DEFAULT, ...p };
  const j = { palm: true };
  j.wrist = [0, 0];
  const top = -52; // tête des métacarpiens
  j.palmPts = [[-20, 0], [-27, -14], [-28, top + 4], [-20, top], [28, top], [32, top + 8], [30, -20], [20, 0]];
  j.fingers = FINGERS.map((f, i) => {
    const extra = (q.fingers && q.fingers[i]) || 0;
    // doigt visé par le pouce (opp entre 0 et 1 : l'index se prépare progressivement)
    const opp = !q.opp ? 0 : q.opp < 1 ? (i === 0 ? q.opp : 0) : Math.abs(q.opp - (i + 1)) < 0.5 ? 1 - Math.abs(q.opp - (i + 1)) * 2 : 0;
    const a = [q.mcp + extra * 80 + opp * 30, q.pip + extra * 95 + opp * 35, q.dip + extra * 60 + opp * 15];
    const base = [f.x + (i - 1.5) * q.spread * 0.15, top - 2];
    const pts = [base]; let cum = 0, cur = base;
    for (let k = 0; k < 3; k++) {
      cum += a[k];
      const ly = -f.len[k] * Math.cos((cum * Math.PI) / 180); // projection : un doigt plié se raccourcit puis se replie vers la paume
      const lx = (i - 1.5) * q.spread * 0.04 * f.len[k];
      cur = [cur[0] + lx, cur[1] + ly]; pts.push(cur);
    }
    return pts;
  });
  [j.mcp, j.pip, j.dip, j.tip] = j.fingers[0];
  j.thumbBase = [22, -8]; // articulation à la base du pouce (trapézo-métacarpienne)
  // pouce au repos (écarté selon « thumb »)
  const restMcp = add(j.thumbBase, dir(38 + q.thumb, 24));
  const restTip = add(restMcp, dir(22 + q.thumb * 0.8 + (q.thumbIp || 0), 22));
  if (q.opp) {
    const k = Math.max(1, Math.min(4, q.opp)), i0 = Math.floor(k) - 1, i1 = Math.min(3, i0 + 1), t = k - 1 - i0;
    const a = j.fingers[i0][3], b = j.fingers[i1][3];
    const tip = [a[0] + (b[0] - a[0]) * t + 3, a[1] + (b[1] - a[1]) * t + 4];
    // articulation du pouce bombée vers l'extérieur : le pouce et le doigt forment un « O »
    const dx = tip[0] - j.thumbBase[0], dy = tip[1] - j.thumbBase[1], L = Math.hypot(dx, dy) || 1;
    const m = [(j.thumbBase[0] + tip[0]) / 2, (j.thumbBase[1] + tip[1]) / 2];
    j.thumbMcp = [m[0] - (dy / L) * 14, m[1] + (dx / L) * 14];
    if (j.thumbMcp[0] < m[0]) j.thumbMcp = [m[0] + (dy / L) * 14, m[1] - (dx / L) * 14];
    j.thumbTip = tip;
    // entre le repos et le premier contact : le pouce se déplace progressivement (pas de saut)
    if (q.opp < 1) {
      const w = q.opp, mix = (a, b) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      j.thumbMcp = mix(restMcp, j.thumbMcp); j.thumbTip = mix(restTip, j.thumbTip);
    }
  } else {
    j.thumbMcp = restMcp;
    j.thumbTip = restTip;
  }
  j.ball = q.ball ? [0, -30] : null; j.band = !!q.band;
  return place(j, anchor);
}

// ---------- Pied, vue de côté (pied droit, orteils vers la droite) ----------
// ankle : inclinaison de la jambe (+ vers l'avant) ; pf : flexion plantaire (+ pointe vers le bas) ; toes : extension des orteils (+ vers le haut) ;
// arch : hauteur de l'arche (mm schématiques).
function footPose(p, anchor) {
  const q = { ...FOOT_DEFAULT, ...p };
  const j = { foot: true };
  j.ankle = [0, 0];
  j.knee = add(j.ankle, dir(-q.ankle, 125)); // la jambe sort du cadre (pas de « tête »)
  const r = (pt) => { const a = (q.pf * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a); return [pt[0] * c - pt[1] * s2, pt[0] * s2 + pt[1] * c]; };
  const P = (x, y) => add(j.ankle, r([x, y]));
  j.heel = P(-16, 30);
  j.heelBack = P(-22, 18);
  j.mtp = P(58, 30);
  j.archTop = P(22, 30 - q.arch - 4);
  j.archLow = P(22, 30 - q.arch);
  j.dorsum = P(36, 12);
  j.front = P(8, 6);
  const ta = 90 - q.toes - q.pf; // orteils : prolongent le pied, relevés si toes > 0
  j.toe = add(j.mtp, dir(ta, 19));
  j.toeTop = add(add(j.mtp, dir(ta, 17)), dir(ta - 90, 5));
  j.mtpTop = P(54, 23);
  return place(j, anchor);
}

// ---------- Avant-bras vu de bout (prono-supination) : le poing et le manche tournent autour de l'axe de l'avant-bras ----------
function endPose(p, anchor) {
  const q = { ...HAND_DEFAULT, ...p };
  const j = { end: true, forearmRot: q.forearmRot };
  j.wrist = [0, 0]; j.mcp = [0, 0]; j.pip = [0, 0];
  return place(j, anchor);
}

// ---------- Pied, vue de derrière (jambe droite) : inversion / éversion ----------
// inv : + inversion (la plante regarde vers l'intérieur), − éversion.
function footBackPose(p, anchor) {
  const q = { ...FOOT_DEFAULT, ...p };
  const j = { footBack: true };
  j.ankle = [0, 0];
  j.knee = [0, -130];
  const a = (-q.inv * Math.PI) / 180; // intérieur (médial) = gauche de l'image pour la jambe droite vue de derrière
  const R = (x, y) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a) + 0];
  const c = [0, 14]; // axe sous-talien
  const T = (x, y) => { const v = R(x, y - c[1]); return [v[0] + c[0], v[1] + c[1]]; };
  j.heel = T(0, 30);
  j.solL = T(-26, 30); j.solR = T(26, 30);
  j.topL = T(-18, 8); j.topR = T(18, 8);
  j.archTop = T(-14, 22);
  j.mtp = j.solR; j.toe = j.solR;
  return place(j, anchor);
}

function place(j, anchor) {
  const a = anchor || { j: 'pelvis', x: 120, y: 100 };
  const ref = j[a.j] || [0, 0];
  const dx = a.x - ref[0], dy = a.y - ref[1];
  const out = {};
  const mv = (v) => (Array.isArray(v) ? (typeof v[0] === 'number' ? [v[0] + dx, v[1] + dy] : v.map(mv)) : v);
  for (const k in j) out[k] = mv(j[k]);
  return out;
}

// Mise au sol automatique (vues corps entier) : la partie la plus basse du corps repose sur le sol, rien ne passe dessous.
// Désactivée si le patient est sur une marche (fig.ground === false ou accessoire « step »).
const GROUND_Y = 178;
export function pose(fig, params) {
  const j = poseRaw(fig, params);
  const v = fig.view || 'side';
  if ((v !== 'side' && v !== 'front') || fig.ground === false || (fig.props || []).some((p) => (Array.isArray(p) ? p[0] : p) === 'step')) return j;
  let maxY = -Infinity;
  for (const [k, p] of Object.entries(j)) {
    if (!Array.isArray(p) || typeof p[0] !== 'number') continue;
    maxY = Math.max(maxY, p[1] + (k === 'head' ? 7 : 0));
  }
  const dy = GROUND_Y - maxY;
  if (Math.abs(dy) < 0.01) return j;
  const out = {};
  for (const [k, p] of Object.entries(j)) out[k] = Array.isArray(p) && typeof p[0] === 'number' ? [p[0], p[1] + dy] : p;
  return out;
}
function poseRaw(fig, params) {
  const v = fig.view || 'side';
  if (v === 'front') return frontPose(params, fig.anchor || { j: 'pelvis', x: 120, y: 98 });
  if (v === 'hand') return handPose(params, fig.anchor || { j: 'elbow', x: 22, y: 92 });
  if (v === 'palm') return palmPose(params, fig.anchor || { j: 'wrist', x: 112, y: 182 });
  if (v === 'foot') return footPose(params, fig.anchor || { j: 'ankle', x: 96, y: 118 });
  if (v === 'footBack') return footBackPose(params, fig.anchor || { j: 'ankle', x: 120, y: 120 });
  if (v === 'end') return endPose(params, fig.anchor || { j: 'wrist', x: 120, y: 112 });
  return sidePose(params, fig.anchor || { j: 'ankle', x: 120, y: 178 });
}

// Valeur d'un paramètre dans une image clé : valeur donnée, sinon membre « proche » (pour uarm2…), sinon valeur par défaut
const DEF_ALL = { ...SIDE_DEFAULT, ...FRONT_DEFAULT, ...HAND_DEFAULT, ...FOOT_DEFAULT };
const pv = (f, k) => f[k] ?? (k.endsWith('2') ? f[k.slice(0, -1)] ?? DEF_ALL[k.slice(0, -1)] : undefined) ?? DEF_ALL[k];
export function interpParams(a, b, t) {
  const o = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = pv(a, k) ?? b[k] ?? 0;
    const vb = pv(b, k) ?? a[k] ?? 0;
    o[k] = typeof va === 'number' && typeof vb === 'number' ? lerp(va, vb, t) : (t < 0.5 ? va : vb);
  }
  return o;
}

// ---------- Rendu SVG ----------
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const line = (g, a, b, cls) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls }, g);
const poly = (g, pts, cls) => el('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: cls }, g);

function drawProps(g, fig, j0) {
  const props = fig.props || [];
  const v = fig.view || 'side';
  if (v === 'side' || v === 'front') el('line', { x1: 8, y1: 182, x2: 232, y2: 182, class: 'fg-ground' }, g);
  if ((v === 'foot' || v === 'footBack') && fig.ground !== false) el('line', { x1: 20, y1: j0.heel[1] + 2, x2: 220, y2: j0.heel[1] + 2, class: 'fg-ground' }, g);
  for (const p of props) {
    const [name, a = 0, b = 0] = Array.isArray(p) ? p : [p];
    if (name === 'wall') el('rect', { x: a || 196, y: -40, width: 10, height: 222, class: 'fg-prop' }, g);
    if (name === 'step') el('rect', { x: a || 90, y: 162, width: b || 60, height: 20, rx: 3, class: 'fg-prop' }, g);
    if (name === 'chair') {
      const x = a || 56, y = b || 142;
      el('rect', { x, y, width: 44, height: 6, rx: 2, class: 'fg-prop' }, g);
      el('rect', { x: x + 2, y: y + 6, width: 5, height: 182 - y - 6, class: 'fg-prop' }, g);
      el('rect', { x: x + 37, y: y + 6, width: 5, height: 182 - y - 6, class: 'fg-prop' }, g);
    }
    if (name === 'mat') el('rect', { x: 14, y: 178, width: 212, height: 5, rx: 2, class: 'fg-mat' }, g);
    if (name === 'table' && v === 'end') el('rect', { x: 40, y: j0.wrist[1] + 26, width: 160, height: 10, rx: 3, class: 'fg-prop' }, g);
    if (name === 'table' && v === 'hand') { el('rect', { x: 4, y: j0.elbow[1] + 9, width: (j0.wrist[0] - 4) - 2, height: 9, rx: 3, class: 'fg-prop' }, g); el('rect', { x: 14, y: j0.elbow[1] + 18, width: 6, height: 182 - j0.elbow[1] - 18, class: 'fg-prop' }, g); }
    else if (name === 'table') el('rect', { x: a || 20, y: b || 108, width: 115, height: 10, rx: 3, class: 'fg-prop' }, g);
    if (name === 'roll' && j0.toe) el('circle', { cx: j0.toe[0] - 4, cy: 177.5, r: 4.5, class: 'fg-prop' }, g);
    if (name === 'towel') el('path', { d: `M${j0.heel[0] - 10},${j0.heel[1] + 3} L${j0.mtp[0] + 34},${j0.heel[1] + 3}`, class: 'fg-towel' }, g);
  }
}

function drawBody(g, fig, j, cls) {
  const v = fig.view || 'side';
  if (v === 'side') {
    // membres éloignés (plus pâles)
    poly(g, [j.pelvis, j.knee2, j.ankle2, j.toe2], `fg-limb fg-far ${cls}`);
    poly(g, [j.shoulder, j.elbow2, j.wrist2], `fg-limb fg-far ${cls}`);
    if (j.bend) {
      const m = [(j.pelvis[0] + j.shoulder[0]) / 2, (j.pelvis[1] + j.shoulder[1]) / 2];
      const dx = j.shoulder[0] - j.pelvis[0], dy = j.shoulder[1] - j.pelvis[1];
      const n = Math.hypot(dx, dy) || 1;
      const c = [m[0] + (dy / n) * j.bend * 2, m[1] - (dx / n) * j.bend * 2];
      el('path', { d: `M${j.pelvis} Q${c} ${j.shoulder}`, class: `fg-trunk ${cls}`, fill: 'none' }, g);
    } else line(g, j.pelvis, j.shoulder, `fg-trunk ${cls}`);
    poly(g, [j.pelvis, j.knee, j.ankle, j.toe], `fg-limb ${cls}`);
    poly(g, [j.shoulder, j.elbow, j.wrist], `fg-limb ${cls}`);
    el('circle', { cx: j.head[0], cy: j.head[1], r: 9, class: `fg-head ${cls}` }, g);
    if (j.nose) el('circle', { cx: j.nose[0], cy: j.nose[1], r: 2.8, class: `fg-head ${cls}` }, g);
    for (const k of ['knee', 'elbow', 'pelvis', 'shoulder', 'ankle', 'wrist'])
      el('circle', { cx: j[k][0], cy: j[k][1], r: 2.6, class: `fg-joint ${cls}` }, g);
  } else if (v === 'front') {
    poly(g, [j.hipR, j.hipL], `fg-trunk ${cls}`);
    line(g, j.pelvis, j.neck, `fg-trunk ${cls}`);
    poly(g, [j.shR, j.shL], `fg-trunk ${cls}`);
    poly(g, [j.shR, j.elbowR, j.wristR], `fg-limb ${cls}`);
    poly(g, [j.shL, j.elbowL, j.wristL], `fg-limb ${cls}`);
    poly(g, [j.hipR, j.kneeR, j.ankleR], `fg-limb ${cls}`);
    poly(g, [j.hipL, j.kneeL, j.ankleL], `fg-limb ${cls}`);
    el('circle', { cx: j.head[0], cy: j.head[1], r: 9, class: `fg-head ${cls}` }, g);
    el('circle', { cx: j.head[0] + (j.headRot || 0) * 6, cy: j.head[1] + 1, r: 1.8, class: `fg-nose ${cls}` }, g);
    for (const k of ['kneeR', 'kneeL', 'elbowR', 'elbowL', 'shR', 'shL', 'hipR', 'hipL'])
      el('circle', { cx: j[k][0], cy: j[k][1], r: 2.4, class: `fg-joint ${cls}` }, g);
  } else drawExtremity(g, v, j, cls);
}

// Contour plein d'un segment (avant-bras, jambe) : largeur w1 au départ, w2 à l'arrivée
function limbShape(g, a, b, w1, w2, cls) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L];
  const pts = [[a[0] + n[0] * w1, a[1] + n[1] * w1], [b[0] + n[0] * w2, b[1] + n[1] * w2], [b[0] - n[0] * w2, b[1] - n[1] * w2], [a[0] - n[0] * w1, a[1] - n[1] * w1]];
  el('polygon', { points: pts.map((p) => p.join(',')).join(' '), class: cls }, g);
  el('circle', { cx: a[0], cy: a[1], r: w1, class: cls }, g);
  el('circle', { cx: b[0], cy: b[1], r: w2, class: cls }, g);
}
function drawExtremity(g, v, j, cls) {
  if (v === 'hand') {
    limbShape(g, j.elbow, j.wrist, 9, 6.5, `fg-skin ${cls}`);
    limbShape(g, j.wrist, j.mcp, 7, 6.5, `fg-skin ${cls}`);
    poly(g, [j.thumbBase, j.thumbMcp, j.thumbTip], `fg-finger fg-far fg-thumb-side ${cls}`); // pouce le long de l'index, côté caché (vue de côté)
    // doigts : un doigt « arrière » plus pâle donne la profondeur des 4 doigts
    const off = (p) => [p[0] + 2.5, p[1] - 2.5];
    poly(g, [j.mcp, j.pip, j.dip, j.tip].map(off), `fg-finger fg-far ${cls}`);
    if (j.curl > 150) el('polygon', { points: [j.mcp, j.pip, j.dip, j.tip].map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` }, g); // poing fermé : forme pleine
    poly(g, [j.mcp, j.pip, j.dip, j.tip], `fg-finger ${cls}`);
    for (const k of ['wrist', 'mcp', 'pip', 'dip']) el('circle', { cx: j[k][0], cy: j[k][1], r: 1.8, class: `fg-joint ${cls}` }, g);
  } else if (v === 'palm') {
    el('polygon', { points: [[j.wrist[0] - 17, j.wrist[1] + 2], [j.wrist[0] + 17, j.wrist[1] + 2], [j.wrist[0] + 15, j.wrist[1] + 30], [j.wrist[0] - 15, j.wrist[1] + 30]].map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` }, g);
    el('polygon', { points: j.palmPts.map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` }, g);
    // plis de la paume
    el('path', { d: `M${j.palmPts[3][0] + 4},${j.palmPts[3][1] + 12} q 22,6 46,-2`, class: `fg-crease ${cls}` }, g);
    el('path', { d: `M${j.thumbBase[0] - 4},${j.thumbBase[1] - 4} q -16,-8 -20,-34`, class: `fg-crease ${cls}` }, g);
    if (j.ball) el('circle', { cx: j.ball[0], cy: j.ball[1], r: 13, class: `fg-ball ${cls}` }, g);
    j.fingers.forEach((f, i) => {
      poly(g, f, `fg-finger fg-finger-palm ${cls}`);
      for (const pt of f.slice(1, 3)) el('circle', { cx: pt[0], cy: pt[1], r: 1.3, class: `fg-joint ${cls}` }, g);
    });
    poly(g, [j.thumbBase, j.thumbMcp, j.thumbTip], `fg-finger fg-finger-palm fg-thumb ${cls}`);
    if (j.band) el('path', { d: `M${j.thumbTip[0]},${j.thumbTip[1]} C${j.thumbTip[0] + 14},${j.thumbTip[1] - 18} ${j.tip[0] + 10},${j.tip[1] - 22} ${j.tip[0]},${j.tip[1]}`, class: `fg-band ${cls}` }, g);
  } else if (v === 'foot') {
    limbShape(g, j.knee, j.ankle, 9, 6.5, `fg-skin ${cls}`);
    const d = `M${j.front} L${j.dorsum} L${j.mtpTop} L${j.toeTop} Q${j.toe[0] + 3},${j.toe[1] + 2} ${j.toe} L${j.mtp} Q${j.archTop} ${j.heel} Q${j.heel[0] - 8},${j.heel[1] - 2} ${j.heelBack} L${j.ankle} Z`;
    el('path', { d, class: `fg-skin ${cls}` }, g);
    for (const k of ['ankle', 'mtp']) el('circle', { cx: j[k][0], cy: j[k][1], r: 1.8, class: `fg-joint ${cls}` }, g);
  } else if (v === 'end') {
    // avant-bras appuyé sur la table, vu dans son axe : coupe ronde + poing qui tourne
    // coude et bras (au loin, en perspective) : donnent le sens de l'avant-bras posé sur la table
    el('ellipse', { cx: j.wrist[0], cy: j.wrist[1] + 10, rx: 24, ry: 20, class: `fg-skin fg-far ${cls}` }, g);
    const a = ((j.forearmRot || 0) * Math.PI) / 180, w = 14, h = 20;
    const R = (x, y) => [j.wrist[0] + x * Math.cos(a) - y * Math.sin(a), j.wrist[1] + x * Math.sin(a) + y * Math.cos(a)];
    const pts = [R(-w, -h + 6), R(-w + 6, -h), R(w - 6, -h), R(w, -h + 6), R(w, h - 6), R(w - 6, h), R(-w + 6, h), R(-w, h - 6)];
    el('polygon', { points: pts.map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}`, 'stroke-linejoin': 'round' }, g);
    // jointures des doigts (côté dos de la main) et pouce sur le dessus du poing
    for (let k = 0; k < 4; k++) el('circle', { cx: R(-w + 1, -h + 8 + k * 9.5)[0], cy: R(-w + 1, -h + 8 + k * 9.5)[1], r: 2.4, class: `fg-joint ${cls}` }, g);
    const th = R(-2, -h - 1), th2 = R(9, -h - 3);
    line(g, th, th2, `fg-finger fg-thumb ${cls}`);
    j.fistTop = R(0, -h);
  } else if (v === 'footBack') {
    limbShape(g, j.knee, j.ankle, 10, 7, `fg-skin ${cls}`);
    el('polygon', { points: [j.topL, j.topR, j.solR, j.solL].map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` }, g);
    el('circle', { cx: j.heel[0], cy: j.heel[1] - 4, r: 9, class: `fg-skin ${cls}` }, g);
    line(g, j.solL, j.solR, `fg-sole ${cls}`);
    el('circle', { cx: j.ankle[0], cy: j.ankle[1], r: 2, class: `fg-joint ${cls}` }, g);
  }
}

function drawHeld(g, fig, j) {
  const held = fig.held || [];
  for (const h of held) {
    const [name, a, b] = Array.isArray(h) ? h : [h];
    if (name === 'dumbbell' && j.palmDir != null) { // vue de côté de la main : l'haltère est vu de bout (disque)
      const c = [(j.mcp[0] + j.pip[0]) / 2, (j.mcp[1] + j.pip[1]) / 2];
      el('circle', { cx: c[0], cy: c[1], r: 11, class: 'fg-held' }, g); el('circle', { cx: c[0], cy: c[1], r: 4, class: 'fg-joint' }, g);
    } else if (name === 'dumbbell' && j[a || 'wrist']) {
      const p = j[a || 'wrist'];
      el('rect', { x: p[0] - 7, y: p[1] - 3, width: 14, height: 6, rx: 2, class: 'fg-held' }, g);
    }
    if (name === 'stick' && j[a] && j[b]) line(g, j[a], j[b], 'fg-held-line');
    // bâton tenu à deux mains, vu de bout (vue de côté) : rond dans les mains
    if (name === 'dowel' && j[a || 'wrist']) { const p = j[a || 'wrist']; el('circle', { cx: p[0] + 1, cy: p[1], r: 4.5, class: 'fg-held' }, g); el('circle', { cx: p[0] + 1, cy: p[1], r: 1.6, class: 'fg-joint' }, g); }
    // bâton le long du dos (charnière de hanche) : tête, haut du dos et sacrum en contact
    if (name === 'dowelBack' && j.pelvis && j.shoulder) {
      const u = [j.shoulder[0] - j.pelvis[0], j.shoulder[1] - j.pelvis[1]], l = Math.hypot(u[0], u[1]) || 1, e = [u[0] / l, u[1] / l], n = [e[1], -e[0]];
      const back = (p, k) => [p[0] - n[0] * 6 + e[0] * k, p[1] - n[1] * 6 + e[1] * k];
      line(g, back(j.pelvis, -12), back(j.shoulder, 30), 'fg-held-line');
    }
    if (name === 'band' && j[a]) line(g, j[a], [b?.[0] ?? 200, b?.[1] ?? j[a][1]], 'fg-band');
    if (name === 'ball' && j[a]) el('circle', { cx: j[a][0], cy: j[a][1], r: 6, class: 'fg-held' }, g);
    if (name === 'vbar' && j.pip) { const d = j.palmDir ?? 90; line(g, add(j.pip, dir(d - 90, 34)), add(j.pip, dir(d + 90, 34)), 'fg-held-line fg-thick'); }
    if (name === 'hammer' && j.pip) {
      // manche tenu dans le poing (centre du poing ≈ entre MCP et IPP), tête en haut ; forearmRot = rotation du manche
      const ang = j.forearmRot || 0, c = [(j.mcp[0] + j.pip[0]) / 2, (j.mcp[1] + j.pip[1]) / 2];
      const bot = add(c, dir(ang + 180, 12)), top = add(c, dir(ang, 38));
      line(g, bot, top, 'fg-held-line');
      const hd = dir(ang + 90, 10);
      line(g, add(top, hd), add(top, [-hd[0], -hd[1]]), 'fg-held-line fg-thick');
    }
  }
}

function arcPath(c, a, b, r) {
  const a1 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const a2 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const s = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
  const e = [c[0] + r * Math.cos(a1 + d), c[1] + r * Math.sin(a1 + d)];
  return { d: `M${s} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${e}`, deg: Math.abs((d * 180) / Math.PI), mid: a1 + d / 2 };
}

// Étiquette qui reste dans le cadre du schéma
function label(g, x, y, anchor, text) {
  const w = text.length * 3.7;
  if (anchor === 'end' && x - w < 3) { anchor = 'start'; x = 3; }
  if (anchor === 'start' && x + w > 237) { anchor = 'end'; x = 237; }
  if (anchor === 'middle') x = Math.min(237 - w / 2, Math.max(3 + w / 2, x));
  const tx = el('text', { x, y: Math.min(196, Math.max(8, y)), class: 'fg-an-label', 'text-anchor': anchor }, g);
  tx.textContent = text;
}

// Couche anatomique : muscles, tendons, nerfs, fascia, articulations
function drawAnat(g, j, keys) {
  for (const key of keys || []) {
    const st = STRUCTURES[key];
    if (!st) continue;
    if (st.kind === 'joint') {
      const p = j[st.at]; if (!p) continue;
      el('circle', { cx: p[0], cy: p[1], r: st.r, class: 'fg-an-joint' }, g);
      label(g, p[0] + st.r + 3, p[1] + st.r + 9, 'start', tr(st.name));
      continue;
    }
    const parts = [[st.seg[0], st.seg[1], st.off, st.t]];
    if (st.mirror) parts.push([st.mirror[0], st.mirror[1], st.mirror[2], st.t]);
    for (const m of st.more || []) parts.push([m[0], m[1], m[2], [0, 1]]);
    let labelled = false;
    parts.forEach(([A, B, off, t], i) => {
      const a = j[A], b = j[B];
      if (!a || !b) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const n = [dy / len, -dx / len];
      const P = (u) => [a[0] + dx * u + n[0] * off, a[1] + dy * u + n[1] * off];
      const p0 = P(t[0]), p1 = P(t[1]);
      el('line', { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], class: `fg-an fg-an-${st.kind}`, 'stroke-width': st.w }, g);
      if (!labelled && i === 0) {
        labelled = true;
        const m = P((t[0] + t[1]) / 2);
        const side = off >= 0 ? 1 : -1;
        const lx = m[0] + n[0] * side * (st.w / 2 + 5), ly = m[1] + n[1] * side * (st.w / 2 + 5) + 3;
        label(g, lx, ly, n[0] * side >= 0.2 ? 'start' : n[0] * side <= -0.2 ? 'end' : 'middle', tr(st.name));
      }
    });
  }
}

// Échelle qui garde tout le mouvement dans le cadre (vues corps entier posées au sol, sans zoom manuel)
export function figFit(fig) {
  const v = fig.view || 'side';
  if (fig.zoom && fig.anchor) return { z: fig.zoom, cx: fig.anchor.x, cy: fig.anchor.y };
  if (v !== 'side' && v !== 'front') return { z: 1, cx: 0, cy: 0 };
  const fr = fig.frames && fig.frames.length ? fig.frames : [{}];
  const pairs = fr.length > 1 ? fr.slice(0, -1).map((a, i) => [a, fr[i + 1]]) : [[fr[0], fr[0]]];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const [A, B] of pairs) for (let k = 0; k <= 8; k++) {
    const j = pose(fig, interpParams(A, B, k / 8));
    for (const [n, p] of Object.entries(j)) {
      if (!Array.isArray(p) || typeof p[0] !== 'number') continue;
      const m = n === 'head' ? 7 : 3;
      x0 = Math.min(x0, p[0] - m); x1 = Math.max(x1, p[0] + m); y0 = Math.min(y0, p[1] - m);
    }
  }
  const cx = 120, cy = 182;
  const z = Math.min(1, y0 < 2 ? (cy - 2) / (cy - y0) : 1, x0 < 2 ? (cx - 2) / (cx - x0) : 1, x1 > 238 ? (238 - cx) / (x1 - cx) : 1);
  return { z: Math.round(z * 1000) / 1000, cx, cy };
}

export function renderFigure(svg, fig, opts = {}) {
  const keys = opts.keys || [];
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 240 200');
  const frames = fig.frames && fig.frames.length ? fig.frames : [{}];
  // agrandissement (mains) : tout le dessin est mis à l'échelle autour du point d'ancrage, traits compris
  const fit = figFit(fig);
  const root = fit.z !== 1 ? el('g', { transform: `translate(${fit.cx},${fit.cy}) scale(${fit.z}) translate(${-fit.cx},${-fit.cy})` }, svg) : svg;
  const gProps = el('g', {}, root);
  const gGhost = el('g', {}, root);
  const gTrace = el('g', {}, root);
  const gBody = el('g', {}, root);
  const gAnat = el('g', { class: 'fg-anat' }, root);
  const gArc = el('g', {}, root);
  let showAnat = !!opts.showAnatomy;
  const gKeys = el('g', {}, root);
  drawProps(gProps, fig, pose(fig, frames[0]));
  // fantômes : position de départ et position cible
  if (frames.length > 1) {
    drawBody(gGhost, fig, pose(fig, frames[0]), 'fg-ghost');
    drawBody(gGhost, fig, pose(fig, frames[frames.length > 2 ? 1 : frames.length - 1]), 'fg-ghost fg-ghost-end');
  }
  // trajectoire du segment distal (flèche)
  if (fig.trace && frames.length > 1) {
    const pts = [];
    const target = frames.length > 2 ? 1 : frames.length - 1;
    for (let i = 0; i <= 16; i++) pts.push(pose(fig, interpParams(frames[0], frames[target], i / 16))[fig.trace]);
    if (pts[0]) {
      poly(gTrace, pts, 'fg-trace');
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h = (o) => [b[0] - 7 * Math.cos(ang + o), b[1] - 7 * Math.sin(ang + o)];
      poly(gTrace, [h(0.5), b, h(-0.5)], 'fg-trace fg-arrow');
    }
  }
  let raf = 0, prevTs = 0, stopped = false, lastMs = 0, animated = false, speed = 1, paused = false;
  const period = (fig.period || 3.2) * 1000;
  const seq = frames.length > 2 ? frames.concat([frames[0]]) : frames.length === 2 ? [frames[0], frames[1], frames[0]] : [frames[0], frames[0]];

  function paramsAt(ms) {
    const n = seq.length - 1;
    const u = ((ms % period) / period) * n;
    const i = Math.min(Math.floor(u), n - 1);
    let t = u - i;
    // petite pause en fin de mouvement
    t = Math.min(1, Math.max(0, (t - 0.12) / 0.76));
    return interpParams(seq[i], seq[i + 1], ease(t));
  }

  function draw(ms) {
    gBody.innerHTML = ''; gArc.innerHTML = ''; gKeys.innerHTML = '';
    const j = pose(fig, paramsAt(ms));
    drawBody(gBody, fig, j, '');
    drawHeld(gBody, fig, j);
    gAnat.innerHTML = '';
    if (showAnat) drawAnat(gAnat, j, opts.anatomy);
    if (fig.arc && j[fig.arc[0]]) {
      const [c, a, b] = fig.arc.map((k) => j[k]);
      if (a && b) {
        const r = arcPath(c, a, b, 15);
        el('path', { d: r.d, class: 'fg-arc' }, gArc);
        const tp = [c[0] + 26 * Math.cos(r.mid), c[1] + 26 * Math.sin(r.mid)];
        const t = el('text', { x: tp[0], y: tp[1] + 3, class: 'fg-arc-txt', 'text-anchor': 'middle' }, gArc);
        t.textContent = `${Math.round(r.deg)}°`;
      }
    }
    keys.forEach((k, i) => {
      const p = j[k.j];
      if (!p) return;
      const off = k.off || [10, -10];
      el('circle', { cx: p[0] + off[0], cy: p[1] + off[1], r: 6.5, class: 'fg-key' }, gKeys);
      const t = el('text', { x: p[0] + off[0], y: p[1] + off[1] + 3, class: 'fg-key-txt', 'text-anchor': 'middle' }, gKeys);
      t.textContent = String(i + 1);
    });
  }

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(ts) {
    if (stopped) return;
    if (!prevTs) prevTs = ts;
    if (!paused) { lastMs += Math.min(100, ts - prevTs) * speed; draw(lastMs); }
    prevTs = ts;
    raf = requestAnimationFrame(loop);
  }
  if (opts.at != null) { lastMs = period * opts.at; draw(lastMs); }
  else if (opts.static || reduce || frames.length < 2) { lastMs = period * (frames.length > 1 ? 0.3 : 0); draw(lastMs); }
  else { animated = true; raf = requestAnimationFrame(loop); }
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); },
    setAnatomy(on) { showAnat = !!on; if (!animated || paused) draw(lastMs); },
    // lecture de la démonstration : pause / ralenti (0,5×)
    setSpeed(f) { speed = f; },
    setPaused(on) { paused = !!on; },
    get animated() { return animated; },
  };
}
