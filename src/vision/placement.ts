// Assistant de placement : avant la calibration, vérifie que le téléphone et le patient sont bien placés
// (distance, cadrage, orientation, hauteur, inclinaison, lumière). Fonctions pures, testées dans tests/placement.test.mjs.
//
// Conventions
//  - Les points sont normalisés (0–1) dans l'image BRUTE de la caméra (non retournée).
//  - Corps : la caméra regarde le patient. Un patient décalé vers la DROITE de l'image brute est, de son point de vue, du côté
//    de sa GAUCHE de la caméra → il doit aller vers SA droite : la consigne ('moveRight') ne dépend donc pas du miroir.
//    Le miroir ne sert qu'à orienter la flèche à l'écran (`dir` = direction à l'écran, patient qui regarde l'écran).
//  - Main : le patient regarde l'écran (selfie miroir ou caméra arrière = « fenêtre ») : sa gauche = la gauche de l'image AFFICHÉE.
//    Consigne et flèche sont donc dans le repère de l'image affichée (miroir appliqué).

import type { Landmark } from './index.ts';

const isNil = (x: unknown): x is null | undefined => x === null || x === undefined;
/** Problème de placement : clé (consigne) et détails facultatifs (direction à l'écran, articulations, degrés…). */
export interface PlacementIssue {
  key: string;
  dir?: string;
  deg?: number;
  first?: boolean;
  joints?: readonly string[];
}

/** Mesures locales calculées pendant l'évaluation. */
export interface PlacementInfo {
  scope?: string;
  size?: number;
  cx?: number;
  missing?: readonly string[];
  ratio?: number;
  shHip?: number;
  torsoLeg?: number;
  palm?: number;
}

/** Luminance moyenne (0–255) de l'image, du centre et des bords. */
export interface Luma {
  mean: number;
  center: number;
  edges: number;
}

/** Orientation du téléphone (capteurs) : beta = avant/arrière, gamma = roulis. */
export interface Tilt {
  beta?: number | null;
  gamma?: number | null;
}

/** Entrées de assessPlacement. */
export interface PlacementInput {
  kind?: 'body' | 'hand';
  plane?: 'side' | 'front';
  side?: 'L' | 'R' | null;
  metric?: string;
  scope?: string;
  lm?: readonly Landmark[] | null;
  hand?: readonly Landmark[] | null;
  handLabel?: string;
  handScore?: number;
  wrongHand?: boolean;
  palm?: 'front' | 'side' | null;
  frameW?: number;
  frameH?: number;
  mirror?: boolean;
  luma?: Luma | null;
  tilt?: Tilt | null;
}

export interface PlacementResult {
  ok: boolean;
  score: number;
  issues: PlacementIssue[];
  info: PlacementInfo;
}

/** Rectangle normalisé. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type JointName =
  | 'nose'
  | 'earL'
  | 'earR'
  | 'shL'
  | 'shR'
  | 'elL'
  | 'elR'
  | 'wrL'
  | 'wrR'
  | 'hipL'
  | 'hipR'
  | 'knL'
  | 'knR'
  | 'anL'
  | 'anR'
  | 'heL'
  | 'heR'
  | 'ftL'
  | 'ftR';

interface Pt {
  x: number;
  y: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  n: number;
}

// ---------- Seuils (tous en fraction de l'image, sauf mention) ----------
export const TH = {
  VIS: 0.6, // visibilité minimale d'une articulation requise
  VIS_BOX: 0.5, // visibilité pour entrer dans la boîte englobante du sujet
  FULL_MIN: 0.45,
  UPPER_MIN: 0.3, // taille du sujet (max hauteur/largeur de la boîte) : en dessous = trop loin
  SIZE_MAX: 0.92, // au-dessus = trop près
  EDGE: 0.02, // point à moins de 2 % du bord = coupé par le bord
  CENTER_MAX: 0.15, // décalage horizontal du centre du sujet (corps)
  SIDE_MAX: 0.28, // (largeur épaules + hanches) / (2 × tronc) : vue de profil si ≤ SIDE_MAX
  FRONT_MIN: 0.45, // vue de face si ≥ FRONT_MIN
  TORSO_VERT_DEG: 35, // en dessous de cet angle (tronc / verticale) on considère le patient debout ; sinon (couché) on ne juge pas l'orientation
  SH_HIP_HIGH: 1.7,
  SH_HIP_LOW: 0.85, // vue de face, caméra haute / basse : largeur épaules ÷ largeur hanches (normal ≈ 1,2–1,4)
  TORSO_LEG_HIGH: 0.95,
  TORSO_LEG_LOW: 0.36, // vue de profil, caméra haute / basse : tronc ÷ jambe (normal ≈ 0,5–0,7)
  ROLL_IMG_DEG: 10, // corps entier penché dans l'image, tronc et jambes alignés : téléphone de travers
  ROLL_MAX: 8,
  PITCH_MAX: 15, // capteurs : roulis et inclinaison avant/arrière tolérés (degrés)
  HAND_MIN: 0.2,
  HAND_MAX: 0.7,
  HAND_EDGE: 0.015,
  HAND_CENTER_MAX: 0.2, // main : taille (max largeur/hauteur de la boîte), bord, décalage
  PALM_FRONT_MIN: 0.5,
  PALM_SIDE_MAX: 0.38, // largeur index–auriculaire ÷ longueur de paume : de face ≈ 0,6–0,9, de profil ≈ 0,1–0,3
  DARK: 60,
  DARK_VERY: 35, // luminance moyenne (0–255)
  BACKLIGHT: 1.6,
  BACKLIGHT_MIN_EDGE: 90, // bords ÷ centre ; et bords au moins assez clairs
  OK_HOLD_MS: 1200, // durée sans problème avant « parfait »
  GRACE_MS: 300, // un problème plus court que cela n'interrompt pas la durée
  ISSUE_HOLD_MS: 500, // un nouveau problème doit durer ce temps avant d'être affiché / dit
} as const;

type Thresholds = { readonly [K in keyof typeof TH]: number };

const I: Readonly<Record<JointName, number>> = {
  nose: 0,
  earL: 7,
  earR: 8,
  shL: 11,
  shR: 12,
  elL: 13,
  elR: 14,
  wrL: 15,
  wrR: 16,
  hipL: 23,
  hipR: 24,
  knL: 25,
  knR: 26,
  anL: 27,
  anR: 28,
  heL: 29,
  heR: 30,
  ftL: 31,
  ftR: 32,
};
const UPPER_METRICS = new Set(['neckFwd', 'headRot', 'shFlex', 'armElev', 'erFront', 'elbow', 'wristUp']);
const vis = (l: Landmark | null | undefined): number => (l ? (l.visibility ?? 1) : 0);
const get = (lm: readonly Landmark[], name: string): Landmark | undefined => lm[I[name as JointName]];

/** Zone du corps à montrer d'après la métrique de l'exercice : 'upper' (tête → hanches) ou 'full' (jusqu'aux chevilles). */
export const scopeOf = (metric: string | undefined): 'upper' | 'full' =>
  UPPER_METRICS.has(metric as string) ? 'upper' : 'full';
/** Orientation de la main exigée d'après la métrique : 'front' (paume face caméra), 'side' (main de profil) ou null. */
export function palmNeed(metric: string | undefined): 'side' | 'front' | null {
  if (metric === 'hAxis') return 'side';
  if (metric === 'hPinch' || metric === 'hThumbAbd' || metric === 'hClose') return 'front';
  return null;
}

/** Articulations requises (noms) pour la vue et la zone. `side` : 'L' | 'R' | null (null = on prend le côté le mieux vu). */
export function requiredJoints(
  plane: string | undefined,
  scope: string | undefined,
  side: string | null | undefined,
  lm?: readonly Landmark[] | null,
): string[] {
  const full = scope === 'full';
  const one = (s: string): string[] =>
    (full ? ['sh', 'hip', 'kn', 'an'] : ['sh', 'el', 'hip', 'ear']).map((j) => j + s);
  if (plane === 'side') {
    let s = side;
    if (!s && lm) {
      const sc = (x: string): number => one(x).reduce((a, n) => a + vis(get(lm, n)), 0);
      s = sc('L') >= sc('R') ? 'L' : 'R';
    }
    return one(s || 'L');
  }
  return [...one('L'), ...one('R')];
}

function bbox(lm: readonly Landmark[], names: readonly string[], minVis: number): Box | null {
  let x0 = 9,
    y0 = 9,
    x1 = -9,
    y1 = -9,
    n = 0;
  for (const nm of names) {
    const l = get(lm, nm);
    if (!l || vis(l) < minVis) continue;
    n++;
    x0 = Math.min(x0, l.x);
    x1 = Math.max(x1, l.x);
    y0 = Math.min(y0, l.y);
    y1 = Math.max(y1, l.y);
  }
  return n ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, n } : null;
}
const BOX_FULL = [
  'nose',
  'earL',
  'earR',
  'shL',
  'shR',
  'elL',
  'elR',
  'hipL',
  'hipR',
  'knL',
  'knR',
  'anL',
  'anR',
  'heL',
  'heR',
  'ftL',
  'ftR',
];
const BOX_UPPER = ['nose', 'earL', 'earR', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR'];

/** Boîte du sujet (image brute) pour les mesures de lumière et le guide : null si rien de visible. */
export const subjectBox = (lm: readonly Landmark[] | null | undefined, scope = 'full'): Box | null =>
  lm ? bbox(lm, scope === 'upper' ? BOX_UPPER : BOX_FULL, TH.VIS_BOX) : null;

const DEG = 180 / Math.PI;
// Direction à l'écran d'un déplacement du patient (corps) : le miroir inverse gauche / droite
const screenDirBody = (patientDir: string, mirror: boolean | undefined): string =>
  patientDir === 'left' || patientDir === 'right'
    ? mirror
      ? patientDir
      : patientDir === 'left'
        ? 'right'
        : 'left'
    : patientDir;

function tiltIssues(tilt: Tilt | null | undefined, out: PlacementIssue[]): void {
  if (!tilt || isNil(tilt.beta) || isNil(tilt.gamma)) return;
  const { beta, gamma } = tilt;
  // portrait : beta ≈ 90 (debout), gamma ≈ 0 ; paysage : gamma ≈ ±90, beta ≈ 0. À plat (beta ≈ 0, gamma ≈ 0) : pas de verticale à juger.
  const landscape = Math.abs(gamma) > 60;
  const flat = Math.abs(beta) < 30 && !landscape;
  if (flat) {
    out.push({ key: 'phoneUpright' });
    return;
  }
  const roll = landscape ? Math.abs(beta) : Math.abs(gamma);
  const pitch = landscape ? 90 - Math.abs(gamma) : Math.abs(beta - 90);
  if (roll > TH.ROLL_MAX) out.push({ key: 'straightenPhone', deg: Math.round(roll) });
  if (pitch > TH.PITCH_MAX) out.push({ key: 'phoneUpright', deg: Math.round(pitch) });
}

function lightIssues(luma: Luma | null | undefined, out: PlacementIssue[]): void {
  if (!luma || !(luma.mean >= 0)) return;
  if (luma.mean < TH.DARK) {
    out.push({ key: 'moreLight', first: luma.mean < TH.DARK_VERY });
    return;
  }
  if (luma.center > 0 && luma.edges >= TH.BACKLIGHT_MIN_EDGE && luma.edges / luma.center > TH.BACKLIGHT)
    out.push({ key: 'backlight' });
}

function bodyIssues(a: PlacementInput, out: PlacementIssue[], info: PlacementInfo): void {
  const { lm, plane, side, frameW: W = 1, frameH: H = 1, mirror } = a;
  const scope = a.scope || scopeOf(a.metric);
  info.scope = scope;
  if (!lm) {
    out.push({ key: 'noBody' });
    return;
  }
  const full = scope === 'full',
    need = requiredJoints(plane, scope, side, lm);
  const box = bbox(lm, full ? BOX_FULL : BOX_UPPER, TH.VIS_BOX);
  if (!box) {
    out.push({ key: 'noBody' });
    return;
  }
  const size = Math.max(box.h, box.w),
    cut = box.y0 < TH.EDGE || box.y1 > 1 - TH.EDGE || box.x0 < TH.EDGE || box.x1 > 1 - TH.EDGE;
  info.size = +size.toFixed(3);
  info.cx = +box.cx.toFixed(3);
  const missing = need.filter((n) => vis(get(lm, n)) < TH.VIS);
  const tooClose = size > TH.SIZE_MAX || (cut && missing.length > 0);
  const tooFar = size < (full ? TH.FULL_MIN : TH.UPPER_MIN);

  if (tooClose) out.push({ key: 'moveBack', dir: 'out' });
  else if (tooFar) out.push({ key: 'moveCloser', dir: 'in' });
  // centrage (aussi quand un côté est coupé : on se décale vers le centre)
  const off = box.cx - 0.5;
  if (!tooClose && Math.abs(off) > TH.CENTER_MAX) {
    const pd = off > 0 ? 'right' : 'left';
    out.push({ key: pd === 'right' ? 'moveRight' : 'moveLeft', dir: screenDirBody(pd, mirror) });
  }
  if (!tooClose && missing.length) {
    info.missing = missing;
    out.push({ key: full ? 'showBody' : 'showUpper', joints: missing });
  }

  // Orientation et perspective : seulement si les épaules et les hanches sont fiables
  const hasTrunk = ['shL', 'shR', 'hipL', 'hipR'].every((n) => vis(get(lm, n)) >= TH.VIS_BOX);
  if (!hasTrunk) return;
  const px = (l: Landmark | undefined): Pt => ({ x: (l as Landmark).x * W, y: (l as Landmark).y * H });
  const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const d = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y);
  const sL = px(get(lm, 'shL')),
    sR = px(get(lm, 'shR')),
    hL = px(get(lm, 'hipL')),
    hR = px(get(lm, 'hipR'));
  const sh = mid(sL, sR),
    hip = mid(hL, hR),
    torso = d(sh, hip) || 1;
  const trunkDeg = Math.abs(Math.atan2(hip.x - sh.x, hip.y - sh.y)) * DEG; // 0 = tronc vertical (épaules au-dessus des hanches)
  const upright = trunkDeg < TH.TORSO_VERT_DEG && hip.y > sh.y;
  if (!upright) return; // couché / à quatre pattes : ni profil / face ni perspective fiables en 2D
  const ratio = (d(sL, sR) + d(hL, hR)) / (2 * torso);
  info.ratio = +ratio.toFixed(2);
  if (plane === 'side' && ratio > TH.SIDE_MAX) out.push({ key: 'turnSide', dir: 'turn' });
  else if (plane === 'front' && ratio < TH.FRONT_MIN) out.push({ key: 'turnFront', dir: 'turn' });
  // hauteur / angle du téléphone (perspective verticale)
  if (plane === 'front' && d(hL, hR) > 1e-6) {
    const k = d(sL, sR) / d(hL, hR);
    info.shHip = +k.toFixed(2);
    if (k > TH.SH_HIP_HIGH) out.push({ key: 'phoneLower', dir: 'down' });
    else if (k < TH.SH_HIP_LOW) out.push({ key: 'phoneHigher', dir: 'up' });
  } else if (plane === 'side' && full && missing.length === 0) {
    const s = (need[0] as string).endsWith('R') ? 'R' : 'L',
      ank = px(get(lm, 'an' + s)),
      hp = px(get(lm, 'hip' + s)),
      leg = d(hp, ank);
    if (leg > 1e-6) {
      const k = torso / leg;
      info.torsoLeg = +k.toFixed(2);
      if (k > TH.TORSO_LEG_HIGH) out.push({ key: 'phoneLower', dir: 'down' });
      else if (k < TH.TORSO_LEG_LOW) out.push({ key: 'phoneHigher', dir: 'up' });
    }
  }
  // Corps entier penché dans l'image, tronc et jambes dans le même sens : c'est le téléphone qui est de travers
  if (full && missing.length === 0 && !a.tilt) {
    const ank = mid(px(get(lm, 'anL')), px(get(lm, 'anR')));
    const bodyDeg = Math.atan2(sh.x - ank.x, ank.y - sh.y) * DEG,
      legDeg = Math.atan2(hip.x - ank.x, ank.y - hip.y) * DEG,
      trDeg = Math.atan2(hip.x - sh.x, hip.y - sh.y) * DEG;
    if (Math.abs(bodyDeg) > TH.ROLL_IMG_DEG && Math.abs(legDeg - -trDeg) < 8)
      out.push({ key: 'straightenPhone', deg: Math.round(Math.abs(bodyDeg)) });
  }
}

// Orientation d'une main : largeur index–auriculaire ÷ longueur de paume (poignet → base du majeur), ~0,7 de face et ~0,2 de profil
export function palmRatio(h: readonly Pt[], W = 1, H = 1): number {
  const p = (i: number): Pt => ({ x: (h[i] as Pt).x * W, y: (h[i] as Pt).y * H });
  const d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
  const L = d(p(0), p(9)) || 1;
  return d(p(5), p(17)) / L;
}

function handIssues(a: PlacementInput, out: PlacementIssue[], info: PlacementInfo): void {
  const { hand: h, frameW: W = 1, frameH: H = 1, mirror } = a;
  if (!h || h.length < 21) {
    out.push({ key: 'noHand' });
    return;
  }
  let x0 = 9,
    y0 = 9,
    x1 = -9,
    y1 = -9;
  for (const l of h) {
    x0 = Math.min(x0, l.x);
    x1 = Math.max(x1, l.x);
    y0 = Math.min(y0, l.y);
    y1 = Math.max(y1, l.y);
  }
  const w = x1 - x0,
    hh = y1 - y0,
    size = Math.max(w, hh);
  info.size = +size.toFixed(3);
  const cut = x0 < TH.HAND_EDGE || y0 < TH.HAND_EDGE || x1 > 1 - TH.HAND_EDGE || y1 > 1 - TH.HAND_EDGE;
  // le patient regarde l'écran : on raisonne dans l'image affichée (miroir compris)
  const cx = mirror ? 1 - (x0 + x1) / 2 : (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  if (
    a.wrongHand ||
    (a.palm === 'front' && a.side && a.handLabel && a.handLabel !== a.side && (a.handScore ?? 0) >= 0.9)
  )
    out.push({ key: a.side === 'L' ? 'wrongHandL' : 'wrongHandR' });
  if (size > TH.HAND_MAX || cut) out.push({ key: 'handFarther', dir: 'out' });
  else if (size < TH.HAND_MIN) out.push({ key: 'handCloser', dir: 'in' });
  if (!(size > TH.HAND_MAX)) {
    if (Math.abs(cx - 0.5) > TH.HAND_CENTER_MAX)
      out.push(cx > 0.5 ? { key: 'handLeft', dir: 'left' } : { key: 'handRight', dir: 'right' });
    if (Math.abs(cy - 0.5) > TH.HAND_CENTER_MAX)
      out.push(cy > 0.5 ? { key: 'handUp', dir: 'up' } : { key: 'handDown', dir: 'down' });
  }
  if (a.palm) {
    const r = palmRatio(h, W, H);
    info.palm = +r.toFixed(2);
    if (a.palm === 'front' && r < TH.PALM_FRONT_MIN) out.push({ key: 'showPalm', dir: 'turn' });
    else if (a.palm === 'side' && r > TH.PALM_SIDE_MAX) out.push({ key: 'turnHandSide', dir: 'turn' });
  }
}

// Gravité : plus le poids est grand, plus l'écart avec « parfait » est important (le score vaut 1 − somme, borné à 0)
const WEIGHT: Readonly<Record<string, number>> = {
  noBody: 0.6,
  noHand: 0.6,
  moreLight: 0.3,
  backlight: 0.2,
  moveBack: 0.3,
  moveCloser: 0.25,
  showBody: 0.3,
  showUpper: 0.3,
  turnSide: 0.25,
  turnFront: 0.25,
  wrongHandL: 0.4,
  wrongHandR: 0.4,
};
// Ordre d'affichage : le plus bloquant d'abord (sans sujet détecté rien d'autre ne se mesure ; la lumière très faible explique souvent l'absence de détection)
const ORDER = [
  'moreLight',
  'noBody',
  'noHand',
  'wrongHandL',
  'wrongHandR',
  'moveBack',
  'moveCloser',
  'handFarther',
  'handCloser',
  'showBody',
  'showUpper',
  'moveLeft',
  'moveRight',
  'handLeft',
  'handRight',
  'handUp',
  'handDown',
  'turnSide',
  'turnFront',
  'showPalm',
  'turnHandSide',
  'phoneLower',
  'phoneHigher',
  'straightenPhone',
  'phoneUpright',
  'backlight',
];

/** Évalue le placement. Entrées : { kind: 'body'|'hand', plane, side, metric?, scope?, lm | hand, handLabel?, handScore?, wrongHand?, palm?, frameW, frameH, mirror, luma, tilt }
 *  Retour : { ok, score (0–1), issues: [{ key, dir?, … }] triées par priorité, info } */
export function assessPlacement(a: PlacementInput = {}): PlacementResult {
  const out: PlacementIssue[] = [],
    info: PlacementInfo = {};
  if (a.kind === 'hand') handIssues(a, out, info);
  else bodyIssues(a, out, info);
  lightIssues(a.luma, out);
  tiltIssues(a.tilt, out);
  // un seul problème par clé, trié par priorité
  const seen = new Set();
  const issues = out
    .filter((i) => !seen.has(i.key) && seen.add(i.key))
    .sort((p, q) => ORDER.indexOf(p.key) - ORDER.indexOf(q.key));
  // très sombre : la lumière passe devant, mais n'efface pas les autres consignes ; si la détection échoue on ne dit que la lumière
  const score = Math.max(0, 1 - issues.reduce((s, i) => s + (WEIGHT[i.key] ?? 0.15), 0));
  return { ok: issues.length === 0, score: +score.toFixed(2), issues, info };
}

/** Hystérésis : « ok » seulement après OK_HOLD_MS sans problème (un écart < GRACE_MS ne remet pas à zéro) ;
 *  le problème affiché ne change que s'il dure ISSUE_HOLD_MS (pas de clignotement). */
export class PlacementGate {
  th: Thresholds;
  okSince!: number | null;
  badSince!: number | null;
  shown!: PlacementIssue | null;
  cand!: { key: string | null } | null;
  candSince!: number;
  stable!: boolean;
  constructor(th: Thresholds = TH) {
    this.th = th;
    this.reset();
  }
  reset(): void {
    this.okSince = null;
    this.badSince = null;
    this.shown = null;
    this.cand = null;
    this.candSince = 0;
    this.stable = false;
  }
  push(
    a: Pick<PlacementResult, 'ok' | 'issues'>,
    now: number,
  ): { stable: boolean; issue: PlacementIssue | null; progress: number } {
    const th = this.th;
    if (a.ok) {
      this.badSince = null;
      if (isNil(this.okSince)) this.okSince = now;
    } else {
      if (isNil(this.badSince)) this.badSince = now;
      if (now - this.badSince >= th.GRACE_MS) this.okSince = null;
    }
    this.stable = !isNil(this.okSince) && now - this.okSince >= th.OK_HOLD_MS;
    const top = a.issues[0] || null,
      key = top ? top.key : null;
    if (key === (this.shown && this.shown.key)) {
      if (top) this.shown = top;
      this.cand = null;
    } else {
      if (!this.cand || this.cand.key !== key) {
        this.cand = { key };
        this.candSince = now;
      }
      if (now - this.candSince >= th.ISSUE_HOLD_MS) {
        this.shown = top;
        this.cand = null;
      }
    }
    return {
      stable: this.stable,
      issue: this.shown,
      progress: !isNil(this.okSince) ? Math.min(1, (now - this.okSince) / th.OK_HOLD_MS) : 0,
    };
  }
}

/** Rectangle guide normalisé (0–1, dans l'image AFFICHÉE) où le sujet doit tenir. */
export function guideRect(kind: string | undefined, plane: string | undefined, scope = 'full'): Rect {
  if (kind === 'hand') return { x: 0.22, y: 0.18, w: 0.56, h: 0.64 };
  if (scope === 'upper')
    return plane === 'side' ? { x: 0.28, y: 0.12, w: 0.44, h: 0.62 } : { x: 0.18, y: 0.12, w: 0.64, h: 0.62 };
  return plane === 'side' ? { x: 0.3, y: 0.06, w: 0.4, h: 0.88 } : { x: 0.22, y: 0.06, w: 0.56, h: 0.88 };
}

/** Consigne locale en une ligne pour l'IA : mesures et problèmes (les conseils de l'IA ne doivent pas les contredire). */
export function measurementsText(
  a: Pick<PlacementInput, 'plane' | 'kind'>,
  info: PlacementInfo,
  issues: readonly PlacementIssue[],
  luma?: Luma | null,
): string {
  const f = (v: unknown): unknown => (isNil(v) ? '?' : v);
  return (
    `Local measurements (reliable, do not contradict): issues=[${issues.map((i) => i.key).join(', ') || 'none'}]; subject size=${f(info.size)} of frame; horizontal center=${f(info.cx)}; ` +
    `shoulder/trunk ratio=${f(info.ratio)}; brightness=${luma ? Math.round(luma.mean) : '?'}/255 (centre ${luma ? Math.round(luma.center) : '?'}, edges ${luma ? Math.round(luma.edges) : '?'}); view wanted=${a.plane || a.kind}.`
  );
}

// Icônes (viewBox 24) : flèche vers le haut tournée selon `dir`, entrée / sortie, rotation, soleil, téléphone
const A = (d: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON_SVG: Readonly<Record<string, string>> = {
  up: A('<path d="M12 20V5M5 12l7-7 7 7"/>'),
  down: A('<path d="M12 4v15M5 12l7 7 7-7"/>'),
  left: A('<path d="M20 12H5M12 5l-7 7 7 7"/>'),
  right: A('<path d="M4 12h15M12 5l7 7-7 7"/>'),
  in: A('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  out: A('<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>'),
  turn: A('<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>'),
  sun: A(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  ),
  phone: A('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
  eye: A('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  ok: A('<path d="M20 6 9 17l-5-5"/>'),
};
/** Icône d'un problème : sa direction à l'écran si elle existe, sinon une icône selon la nature du problème. */
export function issueIcon(i: PlacementIssue | null | undefined): string {
  if (!i) return 'ok';
  if (i.dir && ICON_SVG[i.dir]) return i.dir;
  if (i.key === 'moreLight' || i.key === 'backlight') return 'sun';
  if (i.key === 'straightenPhone' || i.key === 'phoneUpright') return 'phone';
  return 'eye';
}
