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

const DEG = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Indices MediaPipe Pose
export const LM = { nose: 0, ear: { L: 7, R: 8 }, sh: { L: 11, R: 12 }, el: { L: 13, R: 14 }, wr: { L: 15, R: 16 }, pinky: { L: 17, R: 18 }, idx: { L: 19, R: 20 },
  hip: { L: 23, R: 24 }, kn: { L: 25, R: 26 }, an: { L: 27, R: 28 }, heel: { L: 29, R: 30 }, ft: { L: 31, R: 32 } };
const other = (s) => (s === 'L' ? 'R' : 'L');
const vis = (l) => (l ? (l.visibility ?? 1) : 0);

// ---------- Géométrie ----------
const P = (f, i) => { const l = f.lm && f.lm[i]; return l ? { x: l.x * f.w, y: l.y * f.h, v: vis(l) } : null; };
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = (a) => Math.hypot(a.x, a.y);
/** Angle non signé entre deux vecteurs (0–180°). */
export const angleBetween = (u, v) => Math.atan2(Math.abs(cross(u, v)), dot(u, v)) * DEG;
/** Angle de u vers v, positif quand v est du côté de `ref` par rapport à u (0–180° dans les deux sens). */
export function signedToward(u, v, ref) {
  const a = angleBetween(u, v), cu = cross(u, v), cr = cross(u, ref);
  if (Math.abs(cu) < 1e-9 || Math.abs(cr) < 1e-9) return a;
  return (cu > 0) === (cr > 0) ? a : -a;
}
const minVis = (...pts) => Math.min(...pts.map((p) => (p ? p.v : 0)));

/** Sens où regarde le patient en vue de profil : +1 = vers la droite de l'image, −1 = vers la gauche, 0 = inconnu.
 *  `prefer: 'foot'` (fente cheville) : orientation du pied ; sinon nez / oreilles puis pied. */
export function facing(f, side, prefer = 'head') {
  const head = () => {
    const n = P(f, LM.nose), eL = P(f, LM.ear.L), eR = P(f, LM.ear.R);
    const ears = [eL, eR].filter((e) => e && e.v >= 0.4);
    if (!n || n.v < 0.4 || !ears.length) return 0;
    const ex = ears.reduce((s, e) => s + e.x, 0) / ears.length, d = n.x - ex;
    return Math.abs(d) > 0.01 * f.h ? Math.sign(d) : 0;
  };
  const foot = () => {
    for (const s of [side, other(side)]) { const h = P(f, LM.heel[s]), t = P(f, LM.ft[s]); if (h && t && h.v >= 0.4 && t.v >= 0.4 && Math.abs(t.x - h.x) > 0.01 * f.h) return Math.sign(t.x - h.x); }
    return 0;
  };
  return prefer === 'foot' ? foot() || head() : head() || foot();
}

/** Rapport largeur des épaules / longueur du tronc : ≈ 0,5–0,9 de face, < 0,28 de profil (même mesure que placement.js). */
export function planeRatio(lm, w = 1, h = 1) {
  if (!lm) return null;
  const q = (i) => (lm[i] && vis(lm[i]) >= 0.5 ? { x: lm[i].x * w, y: lm[i].y * h } : null);
  const sL = q(11), sR = q(12), hL = q(23), hR = q(24);
  if (!sL || !sR || (!hL && !hR)) return null;
  const sh = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
  const hp = hL && hR ? { x: (hL.x + hR.x) / 2, y: (hL.y + hR.y) / 2 } : hL || hR;
  const torso = len(sub(sh, hp));
  return torso > 1e-6 ? len(sub(sL, sR)) / torso : null;
}

// ---------- Calculs d'angle ----------
// Flexion d'épaule (vue de profil) : angle entre le tronc (épaule → hanche) et le bras (épaule → coude) dans le plan sagittal,
// positif quand le bras part vers l'avant. La référence est le tronc (pas la verticale) : une inclinaison du tronc est compensée.
function shoulderFlex(f, side) {
  const sh = P(f, LM.sh[side]), el = P(f, LM.el[side]), hip = P(f, LM.hip[side]), fc = facing(f, side);
  if (!sh || !el || !hip || !fc) return null;
  const u = sub(hip, sh), v = sub(el, sh);
  return { deg: signedToward(u, v, { x: fc, y: 0 }), vis: minVis(sh, el, hip), draw: { c: sh, a: hip, b: el } };
}
// Abduction d'épaule (vue de face) : même angle dans le plan frontal, positif quand le bras s'éloigne du corps.
function shoulderAbd(f, side) {
  const sh = P(f, LM.sh[side]), el = P(f, LM.el[side]), hip = P(f, LM.hip[side]), sh2 = P(f, LM.sh[other(side)]);
  if (!sh || !el || !hip || !sh2) return null;
  const u = sub(hip, sh), v = sub(el, sh), out = { x: Math.sign(sh.x - sh2.x) || (side === 'L' ? 1 : -1), y: 0 };
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
function shoulderER(f, side) {
  const sh = P(f, LM.sh[side]), sh2 = P(f, LM.sh[other(side)]), el = P(f, LM.el[side]), wr = P(f, LM.wr[side]);
  if (!sh || !sh2 || !el || !wr) return null;
  const l2 = sub(P(f, LM.sh.L), P(f, LM.sh.R)), n2 = len(l2);
  const upper = len(sub(el, sh));
  if (!n2 || upper < 1e-6) return null;
  const out2 = { x: (side === 'L' ? 1 : -1) * l2.x / n2, y: (side === 'L' ? 1 : -1) * l2.y / n2 };
  const off = dot(sub(wr, el), out2);
  const er2 = Math.asin(clamp(off / (FOREARM_RATIO * upper), -1, 1)) * DEG;
  let deg = er2, q = 1;
  const W = f.world;
  if (W && W[LM.el[side]] && W[LM.wr[side]] && W[LM.sh.L] && W[LM.sh.R]) {
    const wl = { x: W[LM.sh.L].x - W[LM.sh.R].x, y: W[LM.sh.L].z - W[LM.sh.R].z }, nl = len(wl);
    if (nl > 1e-6) {
      const lx = wl.x / nl, lz = wl.y / nl, s = side === 'L' ? 1 : -1;
      const e = { x: W[LM.wr[side]].x - W[LM.el[side]].x, y: W[LM.wr[side]].z - W[LM.el[side]].z };
      const outc = s * (e.x * lx + e.y * lz), fwd = e.x * lz - e.y * lx; // avant = (lz, −lx) dans (x, z) : vers la caméra (−z) quand le patient est de face
      const er3 = Math.atan2(outc, fwd) * DEG;
      if (Number.isFinite(er3)) {
        if (Math.abs(er3 - er2) <= 25) deg = 0.6 * er2 + 0.4 * er3; else q = 0.7;
      }
    }
  }
  return { deg, vis: minVis(sh, sh2, el, wr), q, draw: null };
}
// Angle intérieur en un sommet (180° = segment droit)
const interior = (a, c, b) => angleBetween(sub(a, c), sub(b, c));
// Coude : flexion = 180° − angle intérieur épaule–coude–poignet (0° = bras tendu). L'extension est rapportée comme DÉFICIT d'extension
// (même mesure, valeur plus petite = meilleure) : l'hyperextension (recurvatum) n'est pas détectée en 2D.
function elbowAngle(f, side) {
  const sh = P(f, LM.sh[side]), el = P(f, LM.el[side]), wr = P(f, LM.wr[side]);
  if (!sh || !el || !wr) return null;
  return { deg: 180 - interior(sh, el, wr), vis: minVis(sh, el, wr), draw: { c: el, a: { x: el.x + (el.x - sh.x), y: el.y + (el.y - sh.y) }, b: wr } };
}
// Poignet : angle entre l'avant-bras (coude → poignet, pose) et l'axe de la main (poignet → base du majeur, points 0 → 9 de la main ;
// sinon poignet → milieu index/auriculaire de la pose). Avant-bras à plat, paume vers le bas, main dépassant du bord (vue de profil) :
// main au-dessus de la ligne de l'avant-bras = extension, en dessous = flexion.
function wristDev(f, side) {
  const el = P(f, LM.el[side]), wr = P(f, LM.wr[side]);
  if (!el || !wr) return null;
  const d = sub(wr, el);
  if (len(d) < 1e-6) return null;
  let hv = null, hvis = 0;
  const H = f.hand && f.hand.lm && f.hand.lm.length === 21 ? f.hand.lm : null;
  if (H) {
    const h0 = { x: H[0].x * f.w, y: H[0].y * f.h }, h9 = { x: H[9].x * f.w, y: H[9].y * f.h };
    if (len(sub(h0, wr)) <= 0.35 * len(d)) { hv = sub(h9, h0); hvis = 1; }
  }
  if (!hv) {
    const a = P(f, LM.idx[side]), b = P(f, LM.pinky[side]);
    if (!a || !b) return null;
    hv = sub({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, wr); hvis = Math.min(a.v, b.v);
  }
  if (len(hv) < 1e-6) return null;
  const up = angleBetween(d, hv) * (cross(d, hv) * d.x < 0 ? 1 : -1); // + = main au-dessus (extension)
  return { up, vis: Math.min(minVis(el, wr), hvis), draw: { c: wr, a: { x: wr.x + d.x, y: wr.y + d.y }, b: { x: wr.x + hv.x, y: wr.y + hv.y } } };
}
// Hanche : flexion = 180° − angle intérieur épaule–hanche–genou (couché sur le dos ou debout, genou vers la poitrine). Une bascule du bassin
// ou une flexion lombaire fait gonfler la valeur : le bassin doit rester à plat (autre jambe tendue).
function hipFlex(f, side) {
  const sh = P(f, LM.sh[side]), hip = P(f, LM.hip[side]), kn = P(f, LM.kn[side]);
  if (!sh || !hip || !kn) return null;
  return { deg: 180 - interior(sh, hip, kn), vis: minVis(sh, hip, kn), draw: { c: hip, a: { x: hip.x + (hip.x - sh.x), y: hip.y + (hip.y - sh.y) }, b: kn } };
}
// Genou : flexion = 180° − angle intérieur hanche–genou–cheville ; extension = déficit d'extension (0° = jambe tendue).
function kneeAngle(f, side) {
  const hip = P(f, LM.hip[side]), kn = P(f, LM.kn[side]), an = P(f, LM.an[side]);
  if (!hip || !kn || !an) return null;
  return { deg: 180 - interior(hip, kn, an), vis: minVis(hip, kn, an), draw: { c: kn, a: { x: kn.x + (kn.x - hip.x), y: kn.y + (kn.y - hip.y) }, b: an } };
}
// Cheville, fente genou au mur : inclinaison du tibia (cheville → genou) par rapport à la verticale, positive vers l'avant (sens du pied).
// Mesure en charge (« weight-bearing lunge test »), ≠ dorsiflexion goniométrique sans charge (AAOS 20°).
function ankleLunge(f, side) {
  const kn = P(f, LM.kn[side]), an = P(f, LM.an[side]), fc = facing(f, side, 'foot');
  if (!kn || !an || !fc) return null;
  const deg = Math.atan2((kn.x - an.x) * fc, an.y - kn.y) * DEG;
  return { deg, vis: minVis(kn, an), draw: { c: an, a: { x: an.x, y: an.y - 1 }, b: kn } };
}
// Rotation cervicale (vue de face). Lacet de la tête estimé par le décalage horizontal du nez par rapport au milieu des oreilles,
// rapporté à la largeur des épaules : le bout du nez est ≈ 0,30 × largeur des épaules en avant de l'axe des oreilles
// (tragion–pronasale ≈ 11–12 cm ; biacromial ≈ 38–40 cm) → sin(lacet) = décalage / (0,30 × largeur d'épaules).
// Avec les worldLandmarks : lacet = atan2(nez · axe latéral, nez · avant) dans le plan horizontal ; moyenne 50/50 si accord à 20°.
// Limites : le tronc doit rester de face (les épaules qui tournent faussent la mesure), la précision baisse au-delà de ~60° (oreille cachée).
export const NOSE_DEPTH = 0.30;
function cervicalYaw(f) {
  const n = P(f, LM.nose), eL = P(f, LM.ear.L), eR = P(f, LM.ear.R), sL = P(f, LM.sh.L), sR = P(f, LM.sh.R);
  if (!n || !sL || !sR || (!eL && !eR)) return null;
  const ears = [eL, eR].filter((e) => e && e.v >= 0.3), mx = ears.length ? ears.reduce((s, e) => s + e.x, 0) / ears.length : null;
  if (mx == null) return null;
  const shW = len(sub(sL, sR));
  if (shW < 1e-6) return null;
  const y2 = Math.asin(clamp((n.x - mx) / (NOSE_DEPTH * shW), -1, 1)) * DEG; // + = vers la gauche du patient (droite de l'image)
  let deg = y2, q = 1;
  const W = f.world;
  if (W && W[0] && W[7] && W[8] && W[11] && W[12]) {
    const l = { x: W[11].x - W[12].x, z: W[11].z - W[12].z }, nl = Math.hypot(l.x, l.z);
    if (nl > 1e-6) {
      const lx = l.x / nl, lz = l.z / nl, mxw = (W[7].x + W[8].x) / 2, mzw = (W[7].z + W[8].z) / 2;
      const d = { x: W[0].x - mxw, z: W[0].z - mzw };
      const lat = d.x * lx + d.z * lz, fwd = d.x * lz - d.z * lx; // avant = (lz, −lx) : vers la caméra (−z) quand le patient est de face
      const y3 = Math.atan2(lat, fwd) * DEG;
      if (Number.isFinite(y3)) { if (Math.abs(y3 - y2) <= 20) deg = 0.5 * y2 + 0.5 * y3; else q = 0.7; }
    }
  }
  return { deg, vis: minVis(n, sL, sR, ...ears), q, draw: null };
}
// Flexion lombaire (debout, vue de profil) : hauteur du bout des doigts au-dessus du sol, en % de la longueur de jambe (hanche → cheville).
// 0 % = doigts au sol. Ce n'est PAS un angle : mesure indirecte, utile pour suivre l'évolution d'un même patient, pas pour comparer.
function lumbarFloor(f, side) {
  const hip = P(f, LM.hip[side]), an = P(f, LM.an[side]), fi = P(f, LM.idx[side]) || P(f, LM.wr[side]), wr = P(f, LM.wr[side]);
  const heel = P(f, LM.heel[side]), ft = P(f, LM.ft[side]);
  if (!hip || !an || !fi) return null;
  const floor = Math.max(...[an, heel, ft].filter(Boolean).map((p) => p.y));
  const tip = Math.max(fi.y, wr ? wr.y : fi.y);
  const leg = len(sub(an, hip));
  if (leg < 1e-6) return null;
  return { deg: Math.max(0, ((floor - tip) / leg) * 100), vis: minVis(hip, an, fi), draw: null };
}

const flexSigned = (r, k) => (r ? { ...r, deg: r.deg * k } : null);
const wrist = (k) => (f, side) => { const r = wristDev(f, side); return r ? { deg: r.up * k, vis: r.vis, draw: r.draw } : null; };
const cerv = (f, side) => { const r = cervicalYaw(f); return r ? { ...r, deg: side === 'L' ? r.deg : -r.deg } : null; };

export const CALC = { shoulderFlex, shoulderAbd, shoulderER, elbowAngle, wristDev, hipFlex, kneeAngle, ankleLunge, cervicalYaw, lumbarFloor, flexSigned };

// ---------- Catalogue ----------
const S = (fr, en) => ({ fr, en });
// Références : AAOS = American Academy of Orthopaedic Surgeons (Greene & Heckman 1994) ; AMA = Guides to the Evaluation of Permanent Impairment, 5e éd.
// sch = schéma : axes en degrés d'écran (0 = vers la droite, 90 = vers le bas) — segment fixe, position de départ, position d'arrivée.
export const TESTS = {
  sh_flex: {
    id: 'sh_flex', region: 'shoulder', name: S('Épaule — flexion', 'Shoulder — flexion'), plane: 'sagittal', view: 'side', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['sh', 'el', 'hip'], minTravel: 25, maxConf: 1, calc: shoulderFlex,
    normal: { ref: 180, lo: 160, hi: 180, src: 'AAOS 0–180°, AMA 180°' },
    pos: S('Debout (ou assis dos droit), bras le long du corps, paume vers la cuisse.', 'Standing (or sitting upright), arm at your side, palm toward the thigh.'),
    how: S('Lève le bras tendu vers l’avant puis vers le haut, le plus haut possible sans douleur importante, sans te pencher en arrière. Tiens 2 secondes.', 'Raise your straight arm forward and up as high as you comfortably can, without leaning back. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur de la poitrine, à 2–3 m, côté travaillé face à la caméra (tu es de profil), en entier dans l’image.', 'Phone at chest height, 2–3 m away, the tested side toward the camera (you are in profile), full upper body in frame.'),
    note: S('Angle tronc–bras dans le plan sagittal. Un bras qui part de côté (abduction) est sous-estimé. Le tronc sert de référence : une inclinaison du tronc est en partie compensée.', 'Trunk–arm angle in the sagittal plane. An arm drifting sideways (abduction) is underestimated. The trunk is the reference, so trunk lean is partly compensated.'),
    sch: { fix: 90, from: 90, to: -90 },
  },
  sh_abd: {
    id: 'sh_abd', region: 'shoulder', name: S('Épaule — abduction', 'Shoulder — abduction'), plane: 'frontal', view: 'front', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['sh', 'el', 'hip'], both: ['sh'], minTravel: 25, maxConf: 1, calc: shoulderAbd,
    normal: { ref: 180, lo: 160, hi: 180, src: 'AAOS 0–180°, AMA 180°' },
    pos: S('Debout face à la caméra, bras le long du corps, paume vers la cuisse.', 'Standing facing the camera, arm at your side, palm toward the thigh.'),
    how: S('Lève le bras tendu sur le côté, paume vers le haut en haut du mouvement, le plus haut possible sans douleur importante, sans pencher le tronc. Tiens 2 secondes.', 'Raise your straight arm out to the side as high as you comfortably can, without leaning the trunk. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur de la poitrine, à 2–3 m, de face, épaules et hanches visibles.', 'Phone at chest height, 2–3 m away, facing you, shoulders and hips visible.'),
    note: S('Angle tronc–bras dans le plan frontal. Si le bras monte vers l’avant (scaption), le bras est raccourci et l’angle sous-estimé.', 'Trunk–arm angle in the frontal plane. If the arm drifts forward (scaption) it is foreshortened and the angle underestimated.'),
    sch: { fix: 90, from: 90, to: -90 },
  },
  sh_er: {
    id: 'sh_er', region: 'shoulder', name: S('Épaule — rotation externe (coude au corps)', 'Shoulder — external rotation (elbow at side)'), plane: 'transverse', view: 'front', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['sh', 'el', 'wr'], both: ['sh'], minTravel: 15, maxConf: 0.8, calc: shoulderER,
    normal: { ref: 90, lo: 70, hi: 90, src: 'AAOS 0–90°, AMA 90°' },
    pos: S('Debout face à la caméra, coude collé au corps plié à 90°, avant-bras vers l’avant (pouce vers le haut). Une serviette roulée sous le coude aide à le garder collé.', 'Standing facing the camera, elbow tucked against your side bent to 90°, forearm pointing forward (thumb up). A rolled towel under the elbow helps keep it in.'),
    how: S('Garde le coude collé et ouvre l’avant-bras vers l’extérieur, comme on ouvre une porte, le plus loin possible sans douleur importante. Tiens 2 secondes.', 'Keep the elbow tucked and swing the forearm outward like opening a door, as far as you comfortably can. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur de la poitrine, à 2–3 m, de face, bras et avant-bras bien visibles.', 'Phone at chest height, 2–3 m away, facing you, arm and forearm clearly visible.'),
    note: S('Le mouvement se fait dans le plan horizontal : de face l’avant-bras est raccourci. Estimation 2D (décalage du poignet ÷ longueur d’avant-bras ≈ 0,79 × bras) combinée à la 3D des worldLandmarks (profondeur bruitée ± 15–20°). Précision attendue ± 10–15° : à utiliser pour suivre l’évolution, pas pour un diagnostic. Un goniomètre reste la référence.', 'The movement happens in the horizontal plane: from the front the forearm is foreshortened. 2D estimate (wrist offset ÷ forearm length ≈ 0.79 × upper arm) blended with the 3D worldLandmarks (noisy depth ± 15–20°). Expected accuracy ± 10–15°: use it to follow change, not to diagnose. A goniometer remains the reference.'),
    sch: { fix: -90, from: 0, to: 60 },
  },
  el_flex: {
    id: 'el_flex', region: 'elbow', name: S('Coude — flexion', 'Elbow — flexion'), plane: 'sagittal', view: 'side', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['sh', 'el', 'wr'], minTravel: 25, maxConf: 1, calc: elbowAngle,
    normal: { ref: 150, lo: 135, hi: 150, src: 'AAOS 0–150°, AMA 140°' },
    pos: S('Debout ou assis, bras le long du corps, coude tendu, paume vers l’avant.', 'Standing or sitting, arm at your side, elbow straight, palm forward.'),
    how: S('Plie le coude au maximum en amenant la main vers l’épaule, sans lever l’épaule. Tiens 2 secondes.', 'Bend the elbow as far as it goes, bringing the hand toward the shoulder, without lifting the shoulder. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur de la poitrine, à 2 m, de profil, côté travaillé vers la caméra.', 'Phone at chest height, 2 m away, side-on, tested side toward the camera.'),
    note: S('0° = bras tendu. Angle épaule–coude–poignet : un bras qui part vers l’avant ou en dehors du plan sagittal est faussé.', '0° = straight arm. Shoulder–elbow–wrist angle: an arm moving forward or out of the sagittal plane distorts it.'),
    sch: { fix: 90, from: 90, to: -150 },
  },
  el_ext: {
    id: 'el_ext', region: 'elbow', name: S('Coude — extension (déficit)', 'Elbow — extension (deficit)'), plane: 'sagittal', view: 'side', scope: 'upper', sided: true, dir: -1, unit: '°',
    joints: ['sh', 'el', 'wr'], minTravel: 15, maxConf: 1, calc: elbowAngle, deficit: true,
    normal: { ref: 0, lo: 0, hi: 5, src: 'AAOS 0° (extension complète) ; hyperextension 0–10° possible' },
    pos: S('Debout ou assis, bras légèrement en avant, coude plié.', 'Standing or sitting, arm slightly forward, elbow bent.'),
    how: S('Tends le coude au maximum, comme pour pousser un objet loin devant toi, sans forcer. Tiens 2 secondes.', 'Straighten the elbow as far as possible, like pushing something away, without forcing. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur de la poitrine, à 2 m, de profil, côté travaillé vers la caméra.', 'Phone at chest height, 2 m away, side-on, tested side toward the camera.'),
    note: S('Rapporté comme déficit d’extension (0° = coude tendu, plus petit = mieux). L’hyperextension n’est pas détectée en 2D (valeur plancher à 0°).', 'Reported as extension deficit (0° = straight elbow, lower is better). Hyperextension is not detected in 2D (floored at 0°).'),
    sch: { fix: 90, from: -60, to: -90 },
  },
  wr_flex: {
    id: 'wr_flex', region: 'wrist', name: S('Poignet — flexion', 'Wrist — flexion'), plane: 'sagittal', view: 'side', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['el', 'wr'], minTravel: 20, maxConf: 0.9, calc: wrist(-1), needsHand: true,
    normal: { ref: 80, lo: 65, hi: 80, src: 'AAOS 0–80°, AMA 60°' },
    pos: S('Assis à une table, avant-bras à plat, paume vers le bas, main qui dépasse du bord.', 'Sitting at a table, forearm resting flat, palm down, hand beyond the edge.'),
    how: S('Laisse la main descendre puis fléchis le poignet vers le bas au maximum, doigts relâchés. Tiens 2 secondes. L’avant-bras reste posé.', 'Let the hand drop then flex the wrist down as far as it goes, fingers relaxed. Hold 2 seconds. The forearm stays resting.'),
    cam: S('Téléphone posé à hauteur de la table, à 50–80 cm, de profil : on voit le coude, le poignet et la main de côté.', 'Phone at table height, 50–80 cm away, side-on: elbow, wrist and hand seen from the side.'),
    note: S('Angle entre l’avant-bras (coude → poignet) et l’axe de la main (points de la main). La paume doit être vers le bas (sinon flexion et extension sont inversées). Précision limitée par la petite taille de la main : ± 8–10°.', 'Angle between forearm (elbow → wrist) and hand axis (hand landmarks). Palm must face down (otherwise flexion and extension swap). Accuracy limited by the small hand size: ± 8–10°.'),
    sch: { fix: 0, from: 0, to: 70 },
  },
  wr_ext: {
    id: 'wr_ext', region: 'wrist', name: S('Poignet — extension', 'Wrist — extension'), plane: 'sagittal', view: 'side', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['el', 'wr'], minTravel: 20, maxConf: 0.9, calc: wrist(1), needsHand: true,
    normal: { ref: 70, lo: 55, hi: 70, src: 'AAOS 0–70°, AMA 60°' },
    pos: S('Assis à une table, avant-bras à plat, paume vers le bas, main qui dépasse du bord.', 'Sitting at a table, forearm resting flat, palm down, hand beyond the edge.'),
    how: S('Relève la main vers le haut au maximum, comme pour dire « stop », doigts relâchés. Tiens 2 secondes. L’avant-bras reste posé.', 'Lift the hand up as far as it goes, like a “stop” sign, fingers relaxed. Hold 2 seconds. The forearm stays resting.'),
    cam: S('Téléphone posé à hauteur de la table, à 50–80 cm, de profil : on voit le coude, le poignet et la main de côté.', 'Phone at table height, 50–80 cm away, side-on: elbow, wrist and hand seen from the side.'),
    note: S('Même méthode que la flexion ; paume vers le bas obligatoire. Précision ± 8–10°.', 'Same method as flexion; palm down required. Accuracy ± 8–10°.'),
    sch: { fix: 0, from: 0, to: -65 },
  },
  hip_flex: {
    id: 'hip_flex', region: 'hip', name: S('Hanche — flexion (genou vers la poitrine)', 'Hip — flexion (knee to chest)'), plane: 'sagittal', view: 'side', scope: 'full', sided: true, dir: 1, unit: '°',
    joints: ['sh', 'hip', 'kn'], minTravel: 25, maxConf: 0.9, calc: hipFlex,
    normal: { ref: 120, lo: 100, hi: 125, src: 'AAOS 0–120°, AMA 100° (genou fléchi)' },
    pos: S('Couché sur le dos, jambes allongées (ou debout appuyé au mur). L’autre jambe reste tendue et à plat.', 'Lying on your back, legs straight (or standing against a wall). The other leg stays straight and flat.'),
    how: S('Ramène un genou vers la poitrine le plus loin possible, en laissant le genou se plier. Le bas du dos reste à plat. Tiens 2 secondes.', 'Bring one knee toward your chest as far as it goes, letting the knee bend. Keep your lower back flat. Hold 2 seconds.'),
    cam: S('Téléphone au sol ou sur un support à 2 m, côté travaillé face à la caméra, du tronc aux pieds visibles.', 'Phone on the floor or a stand 2 m away, the tested side toward the camera, trunk to feet visible.'),
    note: S('Angle tronc–cuisse. La bascule du bassin et la flexion lombaire ajoutent des degrés (la valeur surestime la hanche si le dos se décolle). Précision ± 8°.', 'Trunk–thigh angle. Pelvic tilt and lumbar flexion add degrees (the value overestimates the hip if the back lifts). Accuracy ± 8°.'),
    sch: { fix: 180, from: 180, to: 60 },
  },
  kn_flex: {
    id: 'kn_flex', region: 'knee', name: S('Genou — flexion', 'Knee — flexion'), plane: 'sagittal', view: 'side', scope: 'full', sided: true, dir: 1, unit: '°',
    joints: ['hip', 'kn', 'an'], minTravel: 25, maxConf: 1, calc: kneeAngle,
    normal: { ref: 135, lo: 125, hi: 145, src: 'AAOS 0–135°, AMA 140°' },
    pos: S('Assis au bord d’une chaise ou couché sur le dos, jambe détendue.', 'Sitting on the edge of a chair or lying on your back, leg relaxed.'),
    how: S('Plie le genou au maximum en ramenant le talon vers la fesse (le pied peut glisser). Tiens 2 secondes.', 'Bend the knee as far as it goes, bringing the heel toward the buttock (the foot may slide). Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur du genou, à 2 m, de profil, hanche, genou et cheville visibles.', 'Phone at knee height, 2 m away, side-on, hip, knee and ankle visible.'),
    note: S('Angle hanche–genou–cheville. 0° = jambe tendue. Précision ± 5°.', 'Hip–knee–ankle angle. 0° = straight leg. Accuracy ± 5°.'),
    sch: { fix: 90, from: 90, to: 230 },
  },
  kn_ext: {
    id: 'kn_ext', region: 'knee', name: S('Genou — extension (déficit)', 'Knee — extension (deficit)'), plane: 'sagittal', view: 'side', scope: 'full', sided: true, dir: -1, unit: '°',
    joints: ['hip', 'kn', 'an'], minTravel: 15, maxConf: 1, calc: kneeAngle, deficit: true,
    normal: { ref: 0, lo: 0, hi: 5, src: 'AAOS 0° (extension complète) ; hyperextension 0–10° possible' },
    pos: S('Assis sur une chaise, dos droit, genou plié à 90° ; ou couché sur le dos.', 'Sitting on a chair, back straight, knee bent to 90°; or lying on your back.'),
    how: S('Tends le genou au maximum en levant le pied, quadriceps contracté. Tiens 2 secondes.', 'Straighten the knee as far as it goes by lifting the foot, quadriceps tight. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur du genou, à 2 m, de profil, hanche, genou et cheville visibles.', 'Phone at knee height, 2 m away, side-on, hip, knee and ankle visible.'),
    note: S('Rapporté comme déficit d’extension (0° = jambe tendue, plus petit = mieux). Hyperextension non détectée en 2D.', 'Reported as extension deficit (0° = straight leg, lower is better). Hyperextension not detected in 2D.'),
    sch: { fix: 90, from: 150, to: 180 },
  },
  an_df: {
    id: 'an_df', region: 'ankle', name: S('Cheville — dorsiflexion (fente genou au mur)', 'Ankle — dorsiflexion (knee-to-wall lunge)'), plane: 'sagittal', view: 'side', scope: 'full', sided: true, dir: 1, unit: '°',
    joints: ['kn', 'an', 'heel', 'ft'], minTravel: 12, maxConf: 0.9, calc: ankleLunge,
    normal: { ref: 40, lo: 35, hi: 45, src: 'Test de fente en charge (Bennell 1998 ; Konor 2012) ≈ 35–45° d’inclinaison du tibia. ≠ AAOS 20° sans charge.' },
    pos: S('Debout face à un mur, le pied testé en avant, orteils vers le mur (≈ 10 cm au début), l’autre jambe en arrière.', 'Standing facing a wall, tested foot forward, toes toward the wall (≈ 10 cm at first), other leg behind.'),
    how: S('Fléchis le genou vers le mur sans décoller le talon, le plus loin possible. Tiens 2 secondes. Si le genou touche le mur facilement, recule le pied.', 'Bend the knee toward the wall without lifting the heel, as far as possible. Hold 2 seconds. If the knee touches the wall easily, move the foot back.'),
    cam: S('Téléphone à hauteur de la jambe, à 2 m, de profil, côté travaillé vers la caméra ; le genou, la cheville et le pied sont visibles.', 'Phone at leg height, 2 m away, side-on, tested side toward the camera; knee, ankle and foot visible.'),
    note: S('Inclinaison du tibia par rapport à la verticale, en charge. Le talon doit rester au sol (un talon qui se décolle gonfle la valeur). Mesure différente de la dorsiflexion au goniomètre sans charge.', 'Tibia inclination from vertical, weight-bearing. The heel must stay down (a lifting heel inflates the value). A different measure from non-weight-bearing goniometric dorsiflexion.'),
    sch: { fix: -90, from: -90, to: -50 },
  },
  cerv_rot: {
    id: 'cerv_rot', region: 'cervical', name: S('Rotation cervicale', 'Cervical rotation'), plane: 'transverse', view: 'front', scope: 'upper', sided: true, dir: 1, unit: '°',
    joints: ['nose', 'ear'], both: ['sh'], minTravel: 20, maxConf: 0.7, calc: cerv, lowConfidence: true,
    normal: { ref: 80, lo: 70, hi: 90, src: 'AAOS 0–80° de chaque côté, AMA 80°' },
    pos: S('Assis ou debout, dos droit, épaules relâchées et de face, regard devant toi.', 'Sitting or standing, back straight, shoulders relaxed and square, looking ahead.'),
    how: S('Tourne la tête du côté demandé le plus loin possible sans douleur importante, sans tourner les épaules ni le tronc. Tiens 2 secondes.', 'Turn your head to the requested side as far as you comfortably can, without turning shoulders or trunk. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur du visage, à 1,5 m, de face, la tête et les deux épaules visibles.', 'Phone at face height, 1.5 m away, facing you, head and both shoulders visible.'),
    note: S('Mesure prudente, confiance plafonnée à 70 % : le lacet de la tête est déduit du décalage du nez par rapport aux oreilles (2D) et de la profondeur 3D. Au-delà de ~60° l’oreille se cache. Les épaules qui tournent faussent la mesure. Précision ± 10–15°.', 'Conservative measure, confidence capped at 70%: head yaw is inferred from the nose offset against the ears (2D) and 3D depth. Beyond ~60° the ear disappears. Rotating shoulders distort the measure. Accuracy ± 10–15°.'),
    sch: { fix: -90, from: -90, to: -170 },
  },
  lumb_flex: {
    id: 'lumb_flex', region: 'lumbar', name: S('Flexion lombaire (doigts–sol)', 'Lumbar flexion (fingertips–floor)'), plane: 'sagittal', view: 'side', scope: 'full', sided: false, dir: -1, unit: '%', unitLabel: S('% de la longueur de jambe', '% of leg length'), optional: true,
    joints: ['hip', 'an', 'idx'], minTravel: 15, maxConf: 0.8, calc: lumbarFloor, deficit: true, ratio: true,
    normal: { ref: 0, lo: 0, hi: 10, src: 'Indicatif : bout des doigts au sol ou presque chez l’adulte sans raideur (grande variabilité, surtout avec des ischio-jambiers courts)' },
    pos: S('Debout, pieds à la largeur des hanches, genoux tendus, bras relâchés.', 'Standing, feet hip-width apart, knees straight, arms relaxed.'),
    how: S('Penche-toi lentement vers l’avant en glissant les mains vers le sol, genoux tendus, le plus bas possible. Tiens 2 secondes.', 'Slowly bend forward sliding your hands toward the floor, knees straight, as low as you can. Hold 2 seconds.'),
    cam: S('Téléphone à la hauteur de la taille, à 2,5 m, de profil, le corps entier (mains et pieds) dans l’image.', 'Phone at waist height, 2.5 m away, side-on, whole body (hands and feet) in frame.'),
    note: S('Distance doigts–sol en % de la longueur de jambe (0 % = doigts au sol) : mesure indirecte qui mélange la hanche et le dos, pas un angle lombaire. Sert à suivre l’évolution d’une même personne.', 'Fingertip-to-floor distance as % of leg length (0% = fingers on the floor): an indirect measure mixing hip and spine, not a lumbar angle. Use it to follow the same person over time.'),
    sch: { fix: 90, from: 90, to: 10 },
  },
};

export const TEST_IDS = Object.keys(TESTS);
export const getTest = (id) => TESTS[id] || null;
/** Côtés mesurables d'un test : ['L','R'] ou [null] (test sans côté). */
export const sidesOf = (id) => (TESTS[id]?.sided ? ['L', 'R'] : [null]);
/** Indices MediaPipe Pose utilisés (pour la visibilité) pour un test et un côté. */
export function jointIdx(test, side) {
  const T = typeof test === 'string' ? TESTS[test] : test;
  if (!T) return [];
  const s = side || 'L', out = [];
  for (const j of T.joints) { const v = LM[j]; if (typeof v === 'number') out.push(v); else if (v) out.push(v[s]); }
  for (const j of T.both || []) { const v = LM[j]; if (v && typeof v === 'object') out.push(v.L, v.R); }
  return out;
}
/** Calcule le test sur une image ; null si impossible. */
export function measure(testId, f, side) {
  const T = TESTS[testId];
  if (!T) return null;
  const r = T.calc(f, side || 'L');
  return r && Number.isFinite(r.deg) ? r : null;
}
/** Ensembles suggérés au clinicien d'après la pathologie / la région. Chaque entrée : [test, côtés]. */
export const SUGGESTED = {
  frozen: [['sh_flex', 'LR'], ['sh_abd', 'LR'], ['sh_er', 'LR']],
  sub_acromial: [['sh_flex', 'LR'], ['sh_abd', 'LR']], cuff_tear: [['sh_flex', 'LR'], ['sh_abd', 'LR'], ['sh_er', 'LR']],
  gh_instab: [['sh_flex', 'LR'], ['sh_abd', 'LR'], ['sh_er', 'LR']], gh_oa: [['sh_flex', 'LR'], ['sh_abd', 'LR'], ['sh_er', 'LR']],
  elbow_stiff: [['el_flex', 'LR'], ['el_ext', 'LR']], wrist_stiff: [['wr_flex', 'LR'], ['wr_ext', 'LR']],
  hip_oa: [['hip_flex', 'LR']], knee_oa: [['kn_flex', 'LR'], ['kn_ext', 'LR']], knee_sprain: [['kn_flex', 'LR'], ['kn_ext', 'LR']],
  ankle_stiff: [['an_df', 'LR']], ankle_sprain: [['an_df', 'LR']],
  neck_mech: [['cerv_rot', 'LR']], wad: [['cerv_rot', 'LR']], cerv_radic: [['cerv_rot', 'LR']],
  lbp_chronic: [['lumb_flex', '']], stenosis: [['lumb_flex', '']],
};
export const SUGGESTED_REGION = {
  shoulder: [['sh_flex', 'LR'], ['sh_abd', 'LR']], elbow: [['el_flex', 'LR'], ['el_ext', 'LR']], wrist: [['wr_flex', 'LR'], ['wr_ext', 'LR']],
  hip: [['hip_flex', 'LR']], knee: [['kn_flex', 'LR'], ['kn_ext', 'LR']], ankle: [['an_df', 'LR']], cervical: [['cerv_rot', 'LR']], lumbar: [['lumb_flex', '']],
};
