// Catalogue des tests d'amplitude mesurés par la caméra (goniométrie 2D / 3D à partir des points MediaPipe Pose + Hand).
// Fonctions pures : aucune dépendance au navigateur (testées dans tests/rom.test.mjs).
//
// Entrée de chaque calcul : une « image » f = { lm, w, h, world?, hand? }
//   lm    : 33 points de pose normalisés (0–1) de l'image BRUTE (non retournée), avec .visibility
//   w, h  : taille de l'image en pixels (corrige le rapport largeur/hauteur : on travaille en pixels carrés)
//   world : (option) 33 points 3D en mètres (worldLandmarks), origine au milieu des hanches, x → droite de l'image, y ↓, z : plus petit = plus près de la caméra
//   hand  : (option) { lm: 21 points normalisés de la main, world? }
// Sortie : { deg, vis, q?, draw? } ou null (point manquant / vue impossible)
//   deg  : valeur du test (degrés, ou % de la longueur de jambe pour la flexion lombaire)
//   vis  : visibilité minimale des points utilisés (0–1)
//   q    : facteur de qualité (0–1) quand deux estimations (2D / 3D) divergent
//   draw : { c, a, b } vertex et deux extrémités (pixels de l'image) pour dessiner l'arc d'angle en direct
//
// Conventions : y vers le bas dans l'image. Côté 'L' / 'R' = côté du PATIENT (point 11 / 23… = gauche du patient).
// « Avant » (vue de profil) = sens où regarde le patient. Les valeurs de référence viennent de l'AAOS (Greene & Heckman,
// The Clinical Measurement of Joint Motion, 1994) et des Guides de l'AMA (5e éd.) ; elles sont indicatives (âge, sexe, morphologie).

import type { Landmark } from './index.ts';

/** Côté du PATIENT (point 11 / 23… = gauche du patient). */
export type Side = 'L' | 'R';

export interface Pt {
  x: number;
  y: number;
}
/** Point en pixels avec sa visibilité (0–1). */
interface VPt extends Pt {
  v: number;
}
interface Pt3 {
  x: number;
  y: number;
  z: number;
}

/** Image : 33 points de pose normalisés, taille en pixels, points 3D (m) et main facultatifs. */
export interface RomFrame {
  readonly lm?: readonly Landmark[] | null | undefined;
  readonly w: number;
  readonly h: number;
  readonly world?: readonly (Pt3 | undefined)[] | null | undefined;
  readonly hand?: { readonly lm?: readonly Landmark[]; readonly world?: readonly Landmark[] } | null | undefined;
}

/** Sommet et deux extrémités (pixels) pour dessiner l'arc d'angle. */
export interface RomDraw {
  c: Pt;
  a: Pt;
  b: Pt;
}

/** Résultat d'un calcul : valeur, visibilité minimale, facteur de qualité et tracé facultatifs. */
export interface RomResult {
  deg: number;
  vis: number;
  q?: number;
  draw?: RomDraw | null;
}

export type RomCalc = (f: RomFrame, side: Side) => RomResult | null;

const DEG = 180 / Math.PI;
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

// Indices MediaPipe Pose
export const LM = {
  nose: 0,
  ear: { L: 7, R: 8 },
  sh: { L: 11, R: 12 },
  el: { L: 13, R: 14 },
  wr: { L: 15, R: 16 },
  pinky: { L: 17, R: 18 },
  idx: { L: 19, R: 20 },
  hip: { L: 23, R: 24 },
  kn: { L: 25, R: 26 },
  an: { L: 27, R: 28 },
  heel: { L: 29, R: 30 },
  ft: { L: 31, R: 32 },
};
const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');
const vis = (l: Landmark | null | undefined): number => (l ? (l.visibility ?? 1) : 0);

// ---------- Géométrie ----------
const P = (f: RomFrame, i: number): VPt | null => {
  const l = f.lm && f.lm[i];
  return l ? { x: l.x * f.w, y: l.y * f.h, v: vis(l) } : null;
};
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
const len = (a: Pt): number => Math.hypot(a.x, a.y);
/** Angle non signé entre deux vecteurs (0–180°). */
export const angleBetween = (u: Pt, v: Pt): number => Math.atan2(Math.abs(cross(u, v)), dot(u, v)) * DEG;
/** Angle de u vers v, positif quand v est du côté de `ref` par rapport à u (0–180° dans les deux sens). */
export function signedToward(u: Pt, v: Pt, ref: Pt): number {
  const a = angleBetween(u, v),
    cu = cross(u, v),
    cr = cross(u, ref);
  if (Math.abs(cu) < 1e-9 || Math.abs(cr) < 1e-9) return a;
  return cu > 0 === cr > 0 ? a : -a;
}
const minVis = (...pts: readonly (VPt | null | undefined)[]): number => Math.min(...pts.map((p) => (p ? p.v : 0)));

/** Sens où regarde le patient en vue de profil : +1 = vers la droite de l'image, −1 = vers la gauche, 0 = inconnu.
 *  `prefer: 'foot'` (fente cheville) : orientation du pied ; sinon nez / oreilles puis pied. */
export function facing(f: RomFrame, side: Side, prefer = 'head'): number {
  const head = () => {
    const n = P(f, LM.nose),
      eL = P(f, LM.ear.L),
      eR = P(f, LM.ear.R);
    const ears = [eL, eR].filter((e): e is VPt => !!e && e.v >= 0.4);
    if (!n || n.v < 0.4 || !ears.length) return 0;
    const ex = ears.reduce((s, e) => s + e.x, 0) / ears.length,
      d = n.x - ex;
    return Math.abs(d) > 0.01 * f.h ? Math.sign(d) : 0;
  };
  const foot = () => {
    for (const s of [side, other(side)]) {
      const h = P(f, LM.heel[s]),
        t = P(f, LM.ft[s]);
      if (h && t && h.v >= 0.4 && t.v >= 0.4 && Math.abs(t.x - h.x) > 0.01 * f.h) return Math.sign(t.x - h.x);
    }
    return 0;
  };
  return prefer === 'foot' ? foot() || head() : head() || foot();
}

/** Rapport largeur des épaules / longueur du tronc : ≈ 0,5–0,9 de face, < 0,28 de profil (même mesure que placement.js). */
export function planeRatio(lm: readonly Landmark[] | null | undefined, w = 1, h = 1): number | null {
  if (!lm) return null;
  const q = (i: number): Pt | null => {
    const l = lm[i];
    return l && vis(l) >= 0.5 ? { x: l.x * w, y: l.y * h } : null;
  };
  const sL = q(11),
    sR = q(12),
    hL = q(23),
    hR = q(24);
  if (!sL || !sR || (!hL && !hR)) return null;
  const sh = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
  const hp = (hL && hR ? { x: (hL.x + hR.x) / 2, y: (hL.y + hR.y) / 2 } : hL || hR) as Pt;
  const torso = len(sub(sh, hp));
  return torso > 1e-6 ? len(sub(sL, sR)) / torso : null;
}

// ---------- Calculs d'angle ----------
// Flexion d'épaule (vue de profil) : angle entre le tronc (épaule → hanche) et le bras (épaule → coude) dans le plan sagittal,
// positif quand le bras part vers l'avant. La référence est le tronc (pas la verticale) : une inclinaison du tronc est compensée.
function shoulderFlex(f: RomFrame, side: Side): RomResult | null {
  const sh = P(f, LM.sh[side]),
    el = P(f, LM.el[side]),
    hip = P(f, LM.hip[side]),
    fc = facing(f, side);
  if (!sh || !el || !hip || !fc) return null;
  const u = sub(hip, sh),
    v = sub(el, sh);
  return { deg: signedToward(u, v, { x: fc, y: 0 }), vis: minVis(sh, el, hip), draw: { c: sh, a: hip, b: el } };
}
// Abduction d'épaule (vue de face) : même angle dans le plan frontal, positif quand le bras s'éloigne du corps.
function shoulderAbd(f: RomFrame, side: Side): RomResult | null {
  const sh = P(f, LM.sh[side]),
    el = P(f, LM.el[side]),
    hip = P(f, LM.hip[side]),
    sh2 = P(f, LM.sh[other(side)]);
  if (!sh || !el || !hip || !sh2) return null;
  const u = sub(hip, sh),
    v = sub(el, sh),
    out = { x: Math.sign(sh.x - sh2.x) || (side === 'L' ? 1 : -1), y: 0 };
  return { deg: signedToward(u, v, out), vis: minVis(sh, el, hip, sh2), draw: { c: sh, a: hip, b: el } };
}
// Rotation externe d'épaule, coude au corps fléchi à 90° (vue de face). Le mouvement est dans le plan horizontal : de face l'avant-bras
// pointe vers la caméra (raccourci en 2D). Deux estimations :
//  (2D) décalage latéral du poignet par rapport au coude, ramené à la longueur d'avant-bras (≈ 0,79 × longueur du bras, anthropométrie de Winter) :
//       RE = asin(décalage / longueur). Précis près de 0–60°, mais l'arcsinus devient sensible près de 90° ;
//  (3D) vecteur coude → poignet des worldLandmarks projeté dans le plan transversal du tronc (axe latéral = épaules, avant = perpendiculaire) :
//       RE = atan2(composante latérale externe, composante avant). La profondeur z de MediaPipe est bruitée (± 15–20°).
// Moyenne pondérée (60 % 2D / 40 % 3D) si les deux concordent à 25° près ; sinon 2D seul et qualité réduite.
export const FOREARM_RATIO = 0.79;
function shoulderER(f: RomFrame, side: Side): RomResult | null {
  const sh = P(f, LM.sh[side]),
    sh2 = P(f, LM.sh[other(side)]),
    el = P(f, LM.el[side]),
    wr = P(f, LM.wr[side]);
  if (!sh || !sh2 || !el || !wr) return null;
  const l2 = sub(P(f, LM.sh.L) as VPt, P(f, LM.sh.R) as VPt),
    n2 = len(l2);
  const upper = len(sub(el, sh));
  if (!n2 || upper < 1e-6) return null;
  const out2 = { x: ((side === 'L' ? 1 : -1) * l2.x) / n2, y: ((side === 'L' ? 1 : -1) * l2.y) / n2 };
  const off = dot(sub(wr, el), out2);
  const er2 = Math.asin(clamp(off / (FOREARM_RATIO * upper), -1, 1)) * DEG;
  let deg = er2,
    q = 1;
  const W = f.world;
  const wEl = W?.[LM.el[side]],
    wWr = W?.[LM.wr[side]],
    wShL = W?.[LM.sh.L],
    wShR = W?.[LM.sh.R];
  if (wEl && wWr && wShL && wShR) {
    const wl = { x: wShL.x - wShR.x, y: wShL.z - wShR.z },
      nl = len(wl);
    if (nl > 1e-6) {
      const lx = wl.x / nl,
        lz = wl.y / nl,
        s = side === 'L' ? 1 : -1;
      const e = { x: wWr.x - wEl.x, y: wWr.z - wEl.z };
      const outc = s * (e.x * lx + e.y * lz),
        fwd = e.x * lz - e.y * lx; // avant = (lz, −lx) dans (x, z) : vers la caméra (−z) quand le patient est de face
      const er3 = Math.atan2(outc, fwd) * DEG;
      if (Number.isFinite(er3)) {
        if (Math.abs(er3 - er2) <= 25) deg = 0.6 * er2 + 0.4 * er3;
        else q = 0.7;
      }
    }
  }
  return { deg, vis: minVis(sh, sh2, el, wr), q, draw: null };
}
// Angle intérieur en un sommet (180° = segment droit)
const interior = (a: Pt, c: Pt, b: Pt): number => angleBetween(sub(a, c), sub(b, c));
// Coude : flexion = 180° − angle intérieur épaule–coude–poignet (0° = bras tendu). L'extension est rapportée comme DÉFICIT d'extension
// (même mesure, valeur plus petite = meilleure) : l'hyperextension (recurvatum) n'est pas détectée en 2D.
function elbowAngle(f: RomFrame, side: Side): RomResult | null {
  const sh = P(f, LM.sh[side]),
    el = P(f, LM.el[side]),
    wr = P(f, LM.wr[side]);
  if (!sh || !el || !wr) return null;
  return {
    deg: 180 - interior(sh, el, wr),
    vis: minVis(sh, el, wr),
    draw: { c: el, a: { x: el.x + (el.x - sh.x), y: el.y + (el.y - sh.y) }, b: wr },
  };
}
// Poignet : angle entre l'avant-bras (coude → poignet, pose) et l'axe de la main (poignet → base du majeur, points 0 → 9 de la main ;
// sinon poignet → milieu index/auriculaire de la pose). Avant-bras à plat, paume vers le bas, main dépassant du bord (vue de profil) :
// main au-dessus de la ligne de l'avant-bras = extension, en dessous = flexion.
/** Déviation du poignet : `up` > 0 = main au-dessus de la ligne de l'avant-bras (extension). */
export interface WristDev {
  up: number;
  vis: number;
  draw: RomDraw;
}

function wristDev(f: RomFrame, side: Side): WristDev | null {
  const el = P(f, LM.el[side]),
    wr = P(f, LM.wr[side]);
  if (!el || !wr) return null;
  const d = sub(wr, el);
  if (len(d) < 1e-6) return null;
  let hv: Pt | null = null,
    hvis = 0;
  const H = f.hand && f.hand.lm && f.hand.lm.length === 21 ? f.hand.lm : null;
  if (H) {
    const H0 = H[0] as Landmark,
      H9 = H[9] as Landmark;
    const h0 = { x: H0.x * f.w, y: H0.y * f.h },
      h9 = { x: H9.x * f.w, y: H9.y * f.h };
    if (len(sub(h0, wr)) <= 0.35 * len(d)) {
      hv = sub(h9, h0);
      hvis = 1;
    }
  }
  if (!hv) {
    const a = P(f, LM.idx[side]),
      b = P(f, LM.pinky[side]);
    if (!a || !b) return null;
    hv = sub({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, wr);
    hvis = Math.min(a.v, b.v);
  }
  if (len(hv) < 1e-6) return null;
  const up = angleBetween(d, hv) * (cross(d, hv) * d.x < 0 ? 1 : -1); // + = main au-dessus (extension)
  return {
    up,
    vis: Math.min(minVis(el, wr), hvis),
    draw: { c: wr, a: { x: wr.x + d.x, y: wr.y + d.y }, b: { x: wr.x + hv.x, y: wr.y + hv.y } },
  };
}
// Hanche : flexion = 180° − angle intérieur épaule–hanche–genou (couché sur le dos ou debout, genou vers la poitrine). Une bascule du bassin
// ou une flexion lombaire fait gonfler la valeur : le bassin doit rester à plat (autre jambe tendue).
function hipFlex(f: RomFrame, side: Side): RomResult | null {
  const sh = P(f, LM.sh[side]),
    hip = P(f, LM.hip[side]),
    kn = P(f, LM.kn[side]);
  if (!sh || !hip || !kn) return null;
  return {
    deg: 180 - interior(sh, hip, kn),
    vis: minVis(sh, hip, kn),
    draw: { c: hip, a: { x: hip.x + (hip.x - sh.x), y: hip.y + (hip.y - sh.y) }, b: kn },
  };
}
// Genou : flexion = 180° − angle intérieur hanche–genou–cheville ; extension = déficit d'extension (0° = jambe tendue).
function kneeAngle(f: RomFrame, side: Side): RomResult | null {
  const hip = P(f, LM.hip[side]),
    kn = P(f, LM.kn[side]),
    an = P(f, LM.an[side]);
  if (!hip || !kn || !an) return null;
  return {
    deg: 180 - interior(hip, kn, an),
    vis: minVis(hip, kn, an),
    draw: { c: kn, a: { x: kn.x + (kn.x - hip.x), y: kn.y + (kn.y - hip.y) }, b: an },
  };
}
// Cheville, fente genou au mur : inclinaison du tibia (cheville → genou) par rapport à la verticale, positive vers l'avant (sens du pied).
// Mesure en charge (« weight-bearing lunge test »), ≠ dorsiflexion goniométrique sans charge (AAOS 20°).
function ankleLunge(f: RomFrame, side: Side): RomResult | null {
  const kn = P(f, LM.kn[side]),
    an = P(f, LM.an[side]),
    fc = facing(f, side, 'foot');
  if (!kn || !an || !fc) return null;
  const deg = Math.atan2((kn.x - an.x) * fc, an.y - kn.y) * DEG;
  return { deg, vis: minVis(kn, an), draw: { c: an, a: { x: an.x, y: an.y - 1 }, b: kn } };
}
// Rotation cervicale (vue de face). Lacet de la tête estimé par le décalage horizontal du nez par rapport au milieu des oreilles,
// rapporté à la largeur des épaules : le bout du nez est ≈ 0,30 × largeur des épaules en avant de l'axe des oreilles
// (tragion–pronasale ≈ 11–12 cm ; biacromial ≈ 38–40 cm) → sin(lacet) = décalage / (0,30 × largeur d'épaules).
// Avec les worldLandmarks : lacet = atan2(nez · axe latéral, nez · avant) dans le plan horizontal ; moyenne 50/50 si accord à 20°.
// Limites : le tronc doit rester de face (les épaules qui tournent faussent la mesure), la précision baisse au-delà de ~60° (oreille cachée).
export const NOSE_DEPTH = 0.3;
function cervicalYaw(f: RomFrame): RomResult | null {
  const n = P(f, LM.nose),
    eL = P(f, LM.ear.L),
    eR = P(f, LM.ear.R),
    sL = P(f, LM.sh.L),
    sR = P(f, LM.sh.R);
  if (!n || !sL || !sR || (!eL && !eR)) return null;
  const ears = [eL, eR].filter((e): e is VPt => !!e && e.v >= 0.3),
    mx = ears.length ? ears.reduce((s, e) => s + e.x, 0) / ears.length : null;
  if (mx === null) return null;
  const shW = len(sub(sL, sR));
  if (shW < 1e-6) return null;
  const y2 = Math.asin(clamp((n.x - mx) / (NOSE_DEPTH * shW), -1, 1)) * DEG; // + = vers la gauche du patient (droite de l'image)
  let deg = y2,
    q = 1;
  const W = f.world;
  if (W && W[0] && W[7] && W[8] && W[11] && W[12]) {
    const l = { x: W[11].x - W[12].x, z: W[11].z - W[12].z },
      nl = Math.hypot(l.x, l.z);
    if (nl > 1e-6) {
      const lx = l.x / nl,
        lz = l.z / nl,
        mxw = (W[7].x + W[8].x) / 2,
        mzw = (W[7].z + W[8].z) / 2;
      const d = { x: W[0].x - mxw, z: W[0].z - mzw };
      const lat = d.x * lx + d.z * lz,
        fwd = d.x * lz - d.z * lx; // avant = (lz, −lx) : vers la caméra (−z) quand le patient est de face
      const y3 = Math.atan2(lat, fwd) * DEG;
      if (Number.isFinite(y3)) {
        if (Math.abs(y3 - y2) <= 20) deg = 0.5 * y2 + 0.5 * y3;
        else q = 0.7;
      }
    }
  }
  return { deg, vis: minVis(n, sL, sR, ...ears), q, draw: null };
}
// Flexion lombaire (debout, vue de profil) : hauteur du bout des doigts au-dessus du sol, en % de la longueur de jambe (hanche → cheville).
// 0 % = doigts au sol. Ce n'est PAS un angle : mesure indirecte, utile pour suivre l'évolution d'un même patient, pas pour comparer.
function lumbarFloor(f: RomFrame, side: Side): RomResult | null {
  const hip = P(f, LM.hip[side]),
    an = P(f, LM.an[side]),
    fi = P(f, LM.idx[side]) || P(f, LM.wr[side]),
    wr = P(f, LM.wr[side]);
  const heel = P(f, LM.heel[side]),
    ft = P(f, LM.ft[side]);
  if (!hip || !an || !fi) return null;
  const floor = Math.max(...[an, heel, ft].filter((p): p is VPt => !!p).map((p) => p.y));
  const tip = Math.max(fi.y, wr ? wr.y : fi.y);
  const leg = len(sub(an, hip));
  if (leg < 1e-6) return null;
  return { deg: Math.max(0, ((floor - tip) / leg) * 100), vis: minVis(hip, an, fi), draw: null };
}

const flexSigned = <T extends { deg: number }>(r: T | null | undefined, k: number): T | null =>
  r ? { ...r, deg: r.deg * k } : null;

/** Calcul de flexion/extension du poignet (k = −1 : flexion, 1 : extension), pour le catalogue des tests. */
export const wrist =
  (k: number): RomCalc =>
  (f, side) => {
    const r = wristDev(f, side);
    return r ? { deg: r.up * k, vis: r.vis, draw: r.draw } : null;
  };
/** Calcul de rotation cervicale : le signe dépend du côté testé. */
export const cerv: RomCalc = (f, side) => {
  const r = cervicalYaw(f);
  return r ? { ...r, deg: side === 'L' ? r.deg : -r.deg } : null;
};

export const CALC = {
  shoulderFlex,
  shoulderAbd,
  shoulderER,
  elbowAngle,
  wristDev,
  hipFlex,
  kneeAngle,
  ankleLunge,
  cervicalYaw,
  lumbarFloor,
  flexSigned,
};
