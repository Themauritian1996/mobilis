// Schéma cinétique animé : bonhomme 2D par cinématique directe (vue de côté, de face, main, pied).
// Angles absolus en degrés : 0 = haut, 90 = avant (droite de l'écran), 180 = bas, 270 = arrière.

/** Point 2D [x, y] du schéma (unités du viewBox 240 × 190). */
export type Pt = [number, number];

type Extra = Pt | Pt[] | Pt[][] | string | number | boolean | null | undefined;

/**
 * Articulations et indicateurs d'un schéma. Les champs présents dépendent de la vue (côté, face, main, pied…) ;
 * l'accès dynamique `joints[nom]` peut donner n'importe quel champ.
 */
export interface Joints {
  [name: string]: Extra;
  pelvis: Pt;
  shoulder: Pt;
  head: Pt;
  nose: Pt;
  elbow: Pt;
  wrist: Pt;
  knee: Pt;
  ankle: Pt;
  toe: Pt;
  elbow2: Pt;
  wrist2: Pt;
  knee2: Pt;
  ankle2: Pt;
  toe2: Pt;
  hip: Pt;
  neck: Pt;
  shR: Pt;
  shL: Pt;
  hipR: Pt;
  hipL: Pt;
  elbowR: Pt;
  elbowL: Pt;
  wristR: Pt;
  wristL: Pt;
  kneeR: Pt;
  kneeL: Pt;
  ankleR: Pt;
  ankleL: Pt;
  mcp: Pt;
  pip: Pt;
  dip: Pt;
  tip: Pt;
  thumbBase: Pt;
  thumbMcp: Pt;
  thumbTip: Pt;
  heel: Pt;
  heelBack: Pt;
  mtp: Pt;
  archTop: Pt;
  archLow: Pt;
  dorsum: Pt;
  front: Pt;
  toeTop: Pt;
  mtpTop: Pt;
  solL: Pt;
  solR: Pt;
  topL: Pt;
  topR: Pt;
  fistTop: Pt;
  bend?: number;
  headRot?: number;
  forearmRot?: number;
  palmDir?: number;
  curl?: number;
  s?: number;
  side?: string;
  palm?: boolean;
  foot?: boolean;
  end?: boolean;
  footBack?: boolean;
  band?: boolean;
  ball?: Pt | null;
  palmPts?: Pt[];
  fingers?: Pt[][];
}

/** Paramètres d'une position clé : angles en degrés par segment, plus quelques indicateurs. */
export type FigureParams = Readonly<Record<string, number | string | boolean | readonly number[] | undefined>>;

/** Ancre : l'articulation `j` est placée en (x, y). */
export interface Anchor {
  readonly j: string;
  readonly x: number;
  readonly y: number;
}

/** Description d'un schéma (voir data/exercises : fig). */
export interface FigureSpec {
  readonly view?: string;
  readonly anchor?: Anchor;
  readonly ground?: boolean;
  readonly props?: readonly (string | readonly (string | number | readonly number[])[])[];
  readonly held?: readonly (string | readonly (string | number | readonly number[])[])[];
  readonly frames?: readonly FigureParams[];
  readonly trace?: string | null;
  readonly arc?: readonly string[];
  readonly period?: number;
  readonly zoom?: number;
  readonly [other: string]: unknown;
}

/** Paramètres numériques d'une position clé, avec les valeurs par défaut de chaque vue. */
interface Q {
  trunk: number;
  head: number;
  uarm: number;
  farm: number;
  thigh: number;
  shank: number;
  foot: number;
  headRot: number;
  shAbdR: number;
  shAbdL: number;
  elbowR: number;
  elbowL: number;
  farmScaleR: number;
  farmScaleL: number;
  hipAbdR: number;
  hipAbdL: number;
  thighScaleR: number;
  thighScaleL: number;
  shankR: number;
  shankL: number;
  liftR: number;
  liftL: number;
  pelvisTilt: number;
  wrist: number;
  mcp: number;
  pip: number;
  dip: number;
  thumb: number;
  thumbIp: number;
  forearmRot: number;
  opp: number;
  spread: number;
  tilt: number;
  arch: number;
  toes: number;
  ankle: number;
  pf: number;
  inv: number;
  thigh2?: number;
  shank2?: number;
  foot2?: number;
  uarm2?: number;
  farm2?: number;
  nod?: number;
  ts?: number;
  ss?: number;
  ts2?: number;
  ss2?: number;
  bend?: number;
  side?: string;
  ball?: boolean;
  band?: boolean;
  fingers?: readonly number[];
}

const L = { trunk: 52, head: 17, uarm: 30, farm: 27, thigh: 42, shank: 40, foot: 15 };
const rad = (d: number): number => (d * Math.PI) / 180;
export const dir = (a: number, len: number): Pt => [Math.sin(rad(a)) * len, -Math.cos(rad(a)) * len];
export const add = (p: Pt, v: Pt): Pt => [p[0] + v[0], p[1] + v[1]];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const SIDE_DEFAULT: Readonly<Record<string, number>> = { trunk: 0, head: 0, uarm: 180, farm: 175, thigh: 180, shank: 180, foot: 90 };
const FRONT_DEFAULT: Readonly<Record<string, number>> = {
  trunk: 0,
  head: 0,
  headRot: 0,
  shAbdR: 8,
  shAbdL: 8,
  elbowR: 0,
  elbowL: 0,
  farmScaleR: 1,
  farmScaleL: 1,
  hipAbdR: 4,
  hipAbdL: 4,
  thighScaleR: 1,
  thighScaleL: 1,
  shankR: 0,
  shankL: 0,
  liftR: 0,
  liftL: 0,
  pelvisTilt: 0,
};
const HAND_DEFAULT: Readonly<Record<string, number>> = {
  wrist: 0,
  mcp: 0,
  pip: 0,
  dip: 0,
  thumb: 20,
  thumbIp: 0,
  forearmRot: 0,
  opp: 0,
  spread: 0,
  tilt: 0,
};
const FOOT_DEFAULT: Readonly<Record<string, number>> = { arch: 6, toes: 0, ankle: 0, pf: 0, inv: 0 };

// ---------- Cinématique ----------
function sidePose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...SIDE_DEFAULT, ...p } as unknown as Q;
  const far = {
    thigh: q.thigh2 ?? q.thigh,
    shank: q.shank2 ?? q.shank,
    foot: q.foot2 ?? q.foot,
    uarm: q.uarm2 ?? q.uarm,
    farm: q.farm2 ?? q.farm,
  };
  const j = {} as Joints;
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

function frontPose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...FRONT_DEFAULT, ...p } as unknown as Q;
  const j = {} as Joints;
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
  const aR = 180 + q.shAbdR,
    aL = 180 - q.shAbdL;
  j.elbowR = add(j.shR, dir(aR, L.uarm));
  j.elbowL = add(j.shL, dir(aL, L.uarm));
  j.wristR = add(j.elbowR, dir(aR + q.elbowR, L.farm * q.farmScaleR));
  j.wristL = add(j.elbowL, dir(aL - q.elbowL, L.farm * q.farmScaleL));
  const tRa = 180 + q.hipAbdR,
    tLa = 180 - q.hipAbdL;
  j.kneeR = add(j.hipR, dir(tRa, L.thigh * q.thighScaleR));
  j.kneeL = add(j.hipL, dir(tLa, L.thigh * q.thighScaleL));
  j.ankleR = add(j.kneeR, dir(180 + q.shankR, L.shank));
  j.ankleL = add(j.kneeL, dir(180 - q.shankL, L.shank));
  j.ankleR[1] -= q.liftR;
  j.ankleL[1] -= q.liftL;
  j.headRot = q.headRot;
  return place(j, anchor);
}

// ---------- Main, vue de côté : avant-bras appuyé, paume vers le bas (ou le haut / pouce en haut) ----------
// wrist, mcp, pip, dip : angles en degrés, + = vers la paume (flexion), − = extension.
function handPose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...HAND_DEFAULT, ...p } as unknown as Q;
  const s = q.side === 'palmUp' ? -1 : 1; // pouce en haut : comme paume en bas (+ = déviation cubitale, vers le bas) // sens de la flexion à l'écran (paume vers le bas : vers le bas)
  const j = { side: q.side || 'palmDown', s, forearmRot: q.forearmRot } as Joints;
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
const FINGERS = [
  { x: 22, len: [25, 15, 11] },
  { x: 7, len: [27, 17, 12] },
  { x: -8, len: [25, 16, 11] },
  { x: -22, len: [20, 12, 9] },
];
function palmPose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...HAND_DEFAULT, ...p } as unknown as Q;
  const j = { palm: true } as Joints;
  j.wrist = [0, 0];
  const top = -52; // tête des métacarpiens
  j.palmPts = [
    [-20, 0],
    [-27, -14],
    [-28, top + 4],
    [-20, top],
    [28, top],
    [32, top + 8],
    [30, -20],
    [20, 0],
  ];
  const fingers: Pt[][] = FINGERS.map((f, i): Pt[] => {
    const extra = (q.fingers && q.fingers[i]) || 0;
    // doigt visé par le pouce (opp entre 0 et 1 : l'index se prépare progressivement)
    const opp = !q.opp
      ? 0
      : q.opp < 1
        ? i === 0
          ? q.opp
          : 0
        : Math.abs(q.opp - (i + 1)) < 0.5
          ? 1 - Math.abs(q.opp - (i + 1)) * 2
          : 0;
    const a: number[] = [q.mcp + extra * 80 + opp * 30, q.pip + extra * 95 + opp * 35, q.dip + extra * 60 + opp * 15];
    const base: Pt = [f.x + (i - 1.5) * q.spread * 0.15, top - 2];
    const pts: Pt[] = [base];
    let cum = 0,
      cur: Pt = base;
    for (let k = 0; k < 3; k++) {
      cum += a[k] as number;
      const ly = -(f.len[k] as number) * Math.cos((cum * Math.PI) / 180); // projection : un doigt plié se raccourcit puis se replie vers la paume
      const lx = (i - 1.5) * q.spread * 0.04 * (f.len[k] as number);
      cur = [cur[0] + lx, cur[1] + ly];
      pts.push(cur);
    }
    return pts;
  });
  j.fingers = fingers;
  [j.mcp, j.pip, j.dip, j.tip] = fingers[0] as [Pt, Pt, Pt, Pt];
  j.thumbBase = [22, -8]; // articulation à la base du pouce (trapézo-métacarpienne)
  // pouce au repos (écarté selon « thumb »)
  const restMcp = add(j.thumbBase, dir(38 + q.thumb, 24));
  const restTip = add(restMcp, dir(22 + q.thumb * 0.8 + (q.thumbIp || 0), 22));
  if (q.opp) {
    const k = Math.max(1, Math.min(4, q.opp)),
      i0 = Math.floor(k) - 1,
      i1 = Math.min(3, i0 + 1),
      t = k - 1 - i0;
    const a = (fingers[i0] as Pt[])[3] as Pt,
      b = (fingers[i1] as Pt[])[3] as Pt;
    const tip: Pt = [a[0] + (b[0] - a[0]) * t + 3, a[1] + (b[1] - a[1]) * t + 4];
    // articulation du pouce bombée vers l'extérieur : le pouce et le doigt forment un « O »
    const dx = tip[0] - j.thumbBase[0],
      dy = tip[1] - j.thumbBase[1],
      L = Math.hypot(dx, dy) || 1;
    const m: Pt = [(j.thumbBase[0] + tip[0]) / 2, (j.thumbBase[1] + tip[1]) / 2];
    j.thumbMcp = [m[0] - (dy / L) * 14, m[1] + (dx / L) * 14];
    if (j.thumbMcp[0] < m[0]) j.thumbMcp = [m[0] + (dy / L) * 14, m[1] - (dx / L) * 14];
    j.thumbTip = tip;
    // entre le repos et le premier contact : le pouce se déplace progressivement (pas de saut)
    if (q.opp < 1) {
      const w = q.opp,
        mix = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      j.thumbMcp = mix(restMcp, j.thumbMcp);
      j.thumbTip = mix(restTip, j.thumbTip);
    }
  } else {
    j.thumbMcp = restMcp;
    j.thumbTip = restTip;
  }
  j.ball = q.ball ? [0, -30] : null;
  j.band = !!q.band;
  return place(j, anchor);
}

// ---------- Pied, vue de côté (pied droit, orteils vers la droite) ----------
// ankle : inclinaison de la jambe (+ vers l'avant) ; pf : flexion plantaire (+ pointe vers le bas) ; toes : extension des orteils (+ vers le haut) ;
// arch : hauteur de l'arche (mm schématiques).
function footPose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...FOOT_DEFAULT, ...p } as unknown as Q;
  const j = { foot: true } as Joints;
  j.ankle = [0, 0];
  j.knee = add(j.ankle, dir(-q.ankle, 125)); // la jambe sort du cadre (pas de « tête »)
  const r = (pt: Pt): Pt => {
    const a = (q.pf * Math.PI) / 180,
      c = Math.cos(a),
      s2 = Math.sin(a);
    return [pt[0] * c - pt[1] * s2, pt[0] * s2 + pt[1] * c];
  };
  const P = (x: number, y: number): Pt => add(j.ankle, r([x, y]));
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
function endPose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...HAND_DEFAULT, ...p } as unknown as Q;
  const j = { end: true, forearmRot: q.forearmRot } as Joints;
  j.wrist = [0, 0];
  j.mcp = [0, 0];
  j.pip = [0, 0];
  return place(j, anchor);
}

// ---------- Pied, vue de derrière (jambe droite) : inversion / éversion ----------
// inv : + inversion (la plante regarde vers l'intérieur), − éversion.
function footBackPose(p: FigureParams, anchor: Anchor): Joints {
  const q = { ...FOOT_DEFAULT, ...p } as unknown as Q;
  const j = { footBack: true } as Joints;
  j.ankle = [0, 0];
  j.knee = [0, -130];
  const a = (-q.inv * Math.PI) / 180; // intérieur (médial) = gauche de l'image pour la jambe droite vue de derrière
  const R = (x: number, y: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a) + 0];
  const c: Pt = [0, 14]; // axe sous-talien
  const T = (x: number, y: number): Pt => {
    const v = R(x, y - c[1]);
    return [v[0] + c[0], v[1] + c[1]];
  };
  j.heel = T(0, 30);
  j.solL = T(-26, 30);
  j.solR = T(26, 30);
  j.topL = T(-18, 8);
  j.topR = T(18, 8);
  j.archTop = T(-14, 22);
  j.mtp = j.solR;
  j.toe = j.solR;
  return place(j, anchor);
}

function place(j: Joints, anchor: Anchor | undefined): Joints {
  const a = anchor || { j: 'pelvis', x: 120, y: 100 };
  const ref = (j[a.j] as Pt | undefined) || [0, 0];
  const dx = a.x - ref[0],
    dy = a.y - ref[1];
  const out: Record<string, Extra> = {};
  const mv = (v: Extra): Extra =>
    Array.isArray(v)
      ? typeof v[0] === 'number'
        ? [(v as Pt)[0] + dx, (v as Pt)[1] + dy]
        : (v as Pt[][]).map(mv as (x: Pt[] | Pt) => Pt & Pt[])
      : v;
  for (const k in j) out[k] = mv(j[k]);
  return out as unknown as Joints;
}

// Mise au sol automatique (vues corps entier) : la partie la plus basse du corps repose sur le sol, rien ne passe dessous.
// Désactivée si le patient est sur une marche (fig.ground === false ou accessoire « step »).
const GROUND_Y = 178;
export function pose(fig: FigureSpec, params: FigureParams): Joints {
  const j = poseRaw(fig, params);
  const v = fig.view || 'side';
  if (
    (v !== 'side' && v !== 'front') ||
    fig.ground === false ||
    (fig.props || []).some((p) => (Array.isArray(p) ? p[0] : p) === 'step')
  )
    return j;
  let maxY = -Infinity;
  for (const [k, p] of Object.entries(j)) {
    if (!Array.isArray(p) || typeof p[0] !== 'number') continue;
    maxY = Math.max(maxY, (p as Pt)[1] + (k === 'head' ? 7 : 0));
  }
  const dy = GROUND_Y - maxY;
  if (Math.abs(dy) < 0.01) return j;
  const out: Record<string, Extra> = {};
  for (const [k, p] of Object.entries(j))
    out[k] = Array.isArray(p) && typeof p[0] === 'number' ? [p[0], (p as Pt)[1] + dy] : p;
  return out as unknown as Joints;
}
function poseRaw(fig: FigureSpec, params: FigureParams): Joints {
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
const DEF_ALL: Readonly<Record<string, number | undefined>> = {
  ...SIDE_DEFAULT,
  ...FRONT_DEFAULT,
  ...HAND_DEFAULT,
  ...FOOT_DEFAULT,
};
type Val = number | string | boolean | readonly number[] | undefined;
const pv = (f: FigureParams, k: string): Val =>
  f[k] ?? (k.endsWith('2') ? (f[k.slice(0, -1)] ?? DEF_ALL[k.slice(0, -1)]) : undefined) ?? DEF_ALL[k];
export function interpParams(a: FigureParams, b: FigureParams, t: number): FigureParams {
  const o: Record<string, Val> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = pv(a, k) ?? b[k] ?? 0;
    const vb = pv(b, k) ?? a[k] ?? 0;
    o[k] = typeof va === 'number' && typeof vb === 'number' ? lerp(va, vb, t) : t < 0.5 ? va : vb;
  }
  return o;
}
