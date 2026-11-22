// Superposition vidéo → canevas : géométrie (cover / contain, miroir, DPR), lissage d'affichage (filtre One Euro)
// et garde-fou contre les sauts de squelette. Fonctions pures (testées dans tests/overlay.test.mjs).

/** Point 2D (normalisé ou en pixels selon le contexte). */
export interface Point2 {
  x: number;
  y: number;
}

/** Ajustement de l'image dans la boîte : cover = remplit et rogne, contain = entière avec bandes. */
export type Fit = 'cover' | 'contain';

export interface FitOptions {
  fit?: Fit;
  mirror?: boolean;
}

export interface FitRect {
  sc: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/** Taille du canevas en pixels réels pour une boîte CSS donnée (DPR plafonné : inutile de remplir 3× plus de pixels). */
export function canvasSize(cssW: number, cssH: number, dpr = 1, maxDpr = 2): { W: number; H: number; k: number } {
  const k = Math.max(1, Math.min(dpr || 1, maxDpr));
  return { W: Math.max(1, Math.round(cssW * k)), H: Math.max(1, Math.round(cssH * k)), k };
}

/** Rectangle où l'image (vw × vh) est dessinée dans la boîte (W × H) : cover = remplit et rogne, contain = entière avec bandes. */
export function fitRect(vw: number, vh: number, W: number, H: number, fit: Fit = 'cover'): FitRect {
  if (!(vw > 0) || !(vh > 0) || !(W > 0) || !(H > 0)) return { sc: 1, ox: 0, oy: 0, w: W || 0, h: H || 0 };
  const sc = fit === 'contain' ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
  return { sc, ox: (W - vw * sc) / 2, oy: (H - vh * sc) / 2, w: vw * sc, h: vh * sc };
}

/** Point normalisé de l'image (0–1) → pixels du canevas, tel qu'il est affiché (miroir compris). */
export function toCanvas(
  pt: Point2,
  vw: number,
  vh: number,
  W: number,
  H: number,
  { fit = 'cover', mirror = false }: FitOptions = {},
): Point2 {
  const r = fitRect(vw, vh, W, H, fit);
  const x = pt.x * vw * r.sc + r.ox,
    y = pt.y * vh * r.sc + r.oy;
  return { x: mirror ? W - x : x, y };
}

/** Inverse : pixels du canevas → point normalisé de l'image. */
export function fromCanvas(
  px: Point2,
  vw: number,
  vh: number,
  W: number,
  H: number,
  { fit = 'cover', mirror = false }: FitOptions = {},
): Point2 {
  const r = fitRect(vw, vh, W, H, fit);
  const x = mirror ? W - px.x : px.x;
  return { x: (x - r.ox) / r.sc / vw, y: (px.y - r.oy) / r.sc / vh };
}

/** Points normalisés de l'image → coordonnées normalisées de l'écran (0–1 du canevas, SANS miroir :
 *  drawSkeleton / drawHand / drawGuides appliquent le miroir). Les autres champs (visibility…) sont conservés. */
export function projectLandmarks<L extends Point2>(
  lm: readonly L[],
  vw: number,
  vh: number,
  W: number,
  H: number,
  fit: Fit = 'cover',
): L[] {
  const r = fitRect(vw, vh, W, H, fit);
  return lm.map((l) => ({ ...l, x: (l.x * vw * r.sc + r.ox) / W, y: (l.y * vh * r.sc + r.oy) / H }));
}

// ---------- Filtre One Euro (Casiez et al.) : lisse le tremblement au repos, suit sans retard les mouvements rapides ----------
const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export interface OneEuroOptions {
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
}

export class OneEuro {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  x: number | null;
  dx: number;
  t: number;
  constructor({ minCutoff = 1.7, beta = 25, dCutoff = 1 }: OneEuroOptions = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }
  reset(): void {
    this.x = null;
    this.dx = 0;
  }
  /** v : valeur brute ; t : temps en ms */
  filter(v: number, t: number): number {
    if (this.x === null || !(t > this.t) || t - this.t > 500) {
      this.x = v;
      this.dx = 0;
      this.t = t;
      return v;
    }
    const dt = (t - this.t) / 1000;
    this.t = t;
    const d = (v - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (d - this.dx);
    this.x += alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

export interface LandmarkSmootherOptions extends OneEuroOptions {
  /** Écart maximal (normalisé) entre le point affiché et le point détecté. */
  maxLag?: number;
}

/** Lissage d'AFFICHAGE d'une liste de points normalisés (le comptage reçoit toujours les points bruts).
 *  Le point affiché ne s'écarte jamais de plus de `maxLag` (0,4 % de l'image) du point détecté : le squelette est dessiné
 *  sur l'image même qui a été analysée, il ne doit pas « traîner » derrière un doigt qui bouge vite, même à 5 analyses / s. */
export class LandmarkSmoother {
  opts: LandmarkSmootherOptions;
  maxLag: number;
  f: [OneEuro, OneEuro][];
  constructor(opts: LandmarkSmootherOptions = {}) {
    this.opts = opts;
    this.maxLag = opts.maxLag ?? 0.004;
    this.f = [];
  }
  reset(): void {
    this.f = [];
  }
  apply<L extends Point2>(lm: readonly L[], t: number): L[];
  apply<T extends null | undefined>(lm: T, t: number): T;
  apply<L extends Point2>(lm: readonly L[] | null | undefined, t: number): L[] | null | undefined {
    if (!lm) {
      this.reset();
      return lm as null | undefined;
    }
    if (this.f.length !== lm.length) this.f = lm.map(() => [new OneEuro(this.opts), new OneEuro(this.opts)]);
    const one = (f: OneEuro, v: number): number => {
      const y = f.filter(v, t),
        c = Math.max(v - this.maxLag, Math.min(v + this.maxLag, y));
      f.x = c;
      return c;
    };
    return lm.map((l, i) => {
      const pair = this.f[i] as [OneEuro, OneEuro];
      return { ...l, x: one(pair[0], l.x), y: one(pair[1], l.y) };
    });
  }
}

/** Boîte du tronc : centre et taille (distance épaules–hanches). */
export interface TorsoBox {
  cx: number;
  cy: number;
  size: number;
}

/** Garde-fou « quelqu'un passe derrière » : si le tronc (épaules + hanches, points 11, 12, 23, 24) saute d'un coup
 *  de plus d'une longueur de tronc ou change brutalement de taille, on garde le squelette précédent pendant maxHoldMs
 *  au plus (ensuite on accepte : le patient s'est vraiment déplacé). */
export class SubjectGuard<L extends Point2 = Point2> {
  maxHoldMs: number;
  prev: (TorsoBox & { t: number; lm: readonly L[] }) | null;
  holdStart: number;
  constructor({ maxHoldMs = 700 }: { maxHoldMs?: number } = {}) {
    this.maxHoldMs = maxHoldMs;
    this.prev = null;
    this.holdStart = 0;
  }
  reset(): void {
    this.prev = null;
    this.holdStart = 0;
  }
  static box(lm: readonly Point2[]): TorsoBox | null {
    const p = [11, 12, 23, 24].map((i) => lm[i]);
    if (p.some((q) => !q)) return null;
    const [p0, p1, p2, p3] = p as [Point2, Point2, Point2, Point2];
    const cx = p.reduce((a, q) => a + (q as Point2).x, 0) / 4,
      cy = p.reduce((a, q) => a + (q as Point2).y, 0) / 4;
    const size = Math.hypot((p0.x + p1.x - p2.x - p3.x) / 2, (p0.y + p1.y - p2.y - p3.y) / 2);
    return { cx, cy, size };
  }
  /** lm : points normalisés (ou null) ; aspect = largeur / hauteur de l'image. Retourne { lm, jumped }. */
  check(
    lm: readonly L[] | null | undefined,
    t: number,
    aspect = 1,
  ): { lm: readonly L[] | null | undefined; jumped: boolean } {
    const b = lm && SubjectGuard.box(lm);
    if (!b) return { lm, jumped: false };
    const pv = this.prev;
    if (pv && t - pv.t < 1000 && pv.size > 0.02) {
      const d = Math.hypot((b.cx - pv.cx) * aspect, b.cy - pv.cy),
        ratio = b.size / pv.size;
      const jump = d > Math.max(pv.size, b.size) || ratio > 1.8 || ratio < 0.55;
      if (jump) {
        if (!this.holdStart) this.holdStart = t;
        if (t - this.holdStart < this.maxHoldMs) return { lm: pv.lm, jumped: true };
      }
    }
    this.holdStart = 0;
    this.prev = { ...b, t, lm: lm as readonly L[] };
    return { lm, jumped: false };
  }
}

/** Cadence d'analyse : au plus `hz` analyses par seconde, et jamais plus de ~80 % du temps passé à analyser
 *  (téléphone lent : on laisse de l'air à l'interface et à la voix). */
export class Pacer {
  min: number;
  next: number;
  cost: number;
  constructor(hz: number) {
    this.min = 1000 / hz;
    this.next = 0;
    this.cost = 0;
  }
  due(now: number): boolean {
    return now >= this.next;
  }
  done(start: number, end: number): void {
    const c = end - start;
    this.cost = this.cost ? this.cost * 0.7 + c * 0.3 : c;
    // petite marge (4 ms) : requestAnimationFrame arrive par pas de 16,7 ms, on ne rate pas une image pour 1 ms
    this.next = start + Math.max(this.min, this.cost * 1.25) - 4;
  }
}

// Couleurs du squelette (variables CSS), relues au plus toutes les 2 s : getComputedStyle à chaque image coûte cher sur téléphone
let colors: { ok: string; bad: string } | null = null,
  colorsT = 0;
export function poseColors(): { ok: string; bad: string } {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (!colors || now - colorsT > 2000) {
    let ok = '',
      bad = '';
    try {
      const css = getComputedStyle(document.documentElement);
      ok = css.getPropertyValue('--pose-ok').trim();
      bad = css.getPropertyValue('--pose-bad').trim();
    } catch {
      /* hors navigateur : couleurs par défaut */
    }
    colors = { ok: ok || '#2dd4bf', bad: bad || '#ff7a59' };
    colorsT = now;
  }
  return colors;
}

/** Ordre d'essai des moteurs MediaPipe : processeur graphique puis processeur. `localStorage['mobilis.delegate'] = 'CPU'`
 *  force le processeur (tests automatisés sans carte graphique, ou appareil dont le moteur graphique est défaillant). */
export function delegates(): ('GPU' | 'CPU')[] {
  let d: string | null = null;
  try {
    d = localStorage.getItem('mobilis.delegate');
  } catch {
    /* stockage indisponible : ordre par défaut */
  }
  return d === 'CPU' ? ['CPU'] : ['GPU', 'CPU'];
}
