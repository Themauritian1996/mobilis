// Superposition vidéo → canevas : géométrie (cover / contain, miroir, DPR), lissage d'affichage (filtre One Euro)
// et garde-fou contre les sauts de squelette. Fonctions pures (testées dans tests/overlay.test.mjs).

/** Taille du canevas en pixels réels pour une boîte CSS donnée (DPR plafonné : inutile de remplir 3× plus de pixels). */
export function canvasSize(cssW, cssH, dpr = 1, maxDpr = 2) {
  const k = Math.max(1, Math.min(dpr || 1, maxDpr));
  return { W: Math.max(1, Math.round(cssW * k)), H: Math.max(1, Math.round(cssH * k)), k };
}

/** Rectangle où l'image (vw × vh) est dessinée dans la boîte (W × H) : cover = remplit et rogne, contain = entière avec bandes. */
export function fitRect(vw, vh, W, H, fit = 'cover') {
  if (!(vw > 0) || !(vh > 0) || !(W > 0) || !(H > 0)) return { sc: 1, ox: 0, oy: 0, w: W || 0, h: H || 0 };
  const sc = fit === 'contain' ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
  return { sc, ox: (W - vw * sc) / 2, oy: (H - vh * sc) / 2, w: vw * sc, h: vh * sc };
}

/** Point normalisé de l'image (0–1) → pixels du canevas, tel qu'il est affiché (miroir compris). */
export function toCanvas(pt, vw, vh, W, H, { fit = 'cover', mirror = false } = {}) {
  const r = fitRect(vw, vh, W, H, fit);
  const x = pt.x * vw * r.sc + r.ox, y = pt.y * vh * r.sc + r.oy;
  return { x: mirror ? W - x : x, y };
}

/** Inverse : pixels du canevas → point normalisé de l'image. */
export function fromCanvas(px, vw, vh, W, H, { fit = 'cover', mirror = false } = {}) {
  const r = fitRect(vw, vh, W, H, fit);
  const x = mirror ? W - px.x : px.x;
  return { x: (x - r.ox) / r.sc / vw, y: (px.y - r.oy) / r.sc / vh };
}

/** Points normalisés de l'image → coordonnées normalisées de l'écran (0–1 du canevas, SANS miroir :
 *  drawSkeleton / drawHand / drawGuides appliquent le miroir). Les autres champs (visibility…) sont conservés. */
export function projectLandmarks(lm, vw, vh, W, H, fit = 'cover') {
  const r = fitRect(vw, vh, W, H, fit);
  return lm.map((l) => ({ ...l, x: (l.x * vw * r.sc + r.ox) / W, y: (l.y * vh * r.sc + r.oy) / H }));
}

// ---------- Filtre One Euro (Casiez et al.) : lisse le tremblement au repos, suit sans retard les mouvements rapides ----------
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
export class OneEuro {
  constructor({ minCutoff = 1.7, beta = 25, dCutoff = 1 } = {}) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.x = null; this.dx = 0; this.t = 0; }
  reset() { this.x = null; this.dx = 0; }
  /** v : valeur brute ; t : temps en ms */
  filter(v, t) {
    if (this.x == null || !(t > this.t) || t - this.t > 500) { this.x = v; this.dx = 0; this.t = t; return v; }
    const dt = (t - this.t) / 1000; this.t = t;
    const d = (v - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (d - this.dx);
    this.x += alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

/** Lissage d'AFFICHAGE d'une liste de points normalisés (le comptage reçoit toujours les points bruts). */
export class LandmarkSmoother {
  constructor(opts) { this.opts = opts; this.f = []; }
  reset() { this.f = []; }
  apply(lm, t) {
    if (!lm) { this.reset(); return lm; }
    if (this.f.length !== lm.length) this.f = lm.map(() => [new OneEuro(this.opts), new OneEuro(this.opts)]);
    return lm.map((l, i) => ({ ...l, x: this.f[i][0].filter(l.x, t), y: this.f[i][1].filter(l.y, t) }));
  }
}

/** Garde-fou « quelqu'un passe derrière » : si le tronc (épaules + hanches, points 11, 12, 23, 24) saute d'un coup
 *  de plus d'une longueur de tronc ou change brutalement de taille, on garde le squelette précédent pendant maxHoldMs
 *  au plus (ensuite on accepte : le patient s'est vraiment déplacé). */
export class SubjectGuard {
  constructor({ maxHoldMs = 700 } = {}) { this.maxHoldMs = maxHoldMs; this.prev = null; this.holdStart = 0; }
  reset() { this.prev = null; this.holdStart = 0; }
  static box(lm) {
    const p = [11, 12, 23, 24].map((i) => lm[i]); if (p.some((q) => !q)) return null;
    const cx = p.reduce((a, q) => a + q.x, 0) / 4, cy = p.reduce((a, q) => a + q.y, 0) / 4;
    const size = Math.hypot((p[0].x + p[1].x - p[2].x - p[3].x) / 2, (p[0].y + p[1].y - p[2].y - p[3].y) / 2);
    return { cx, cy, size };
  }
  /** lm : points normalisés (ou null) ; aspect = largeur / hauteur de l'image. Retourne { lm, jumped }. */
  check(lm, t, aspect = 1) {
    const b = lm && SubjectGuard.box(lm);
    if (!b) return { lm, jumped: false };
    const pv = this.prev;
    if (pv && t - pv.t < 1000 && pv.size > 0.02) {
      const d = Math.hypot((b.cx - pv.cx) * aspect, b.cy - pv.cy), ratio = b.size / pv.size;
      const jump = d > Math.max(pv.size, b.size) || ratio > 1.8 || ratio < 0.55;
      if (jump) {
        if (!this.holdStart) this.holdStart = t;
        if (t - this.holdStart < this.maxHoldMs) return { lm: pv.lm, jumped: true };
      }
    }
    this.holdStart = 0;
    this.prev = { ...b, t, lm };
    return { lm, jumped: false };
  }
}

/** Cadence d'analyse : au plus `hz` analyses par seconde, et jamais plus de ~75 % du temps passé à analyser
 *  (téléphone lent : on laisse de l'air à l'interface et à la voix). */
export class Pacer {
  constructor(hz) { this.min = 1000 / hz; this.next = 0; this.cost = 0; }
  due(now) { return now >= this.next; }
  done(start, end) {
    const c = end - start; this.cost = this.cost ? this.cost * 0.7 + c * 0.3 : c;
    // petite marge (4 ms) : requestAnimationFrame arrive par pas de 16,7 ms, on ne rate pas une image pour 1 ms
    this.next = start + Math.max(this.min, this.cost * 1.33) - 4;
  }
}

// Couleurs du squelette (variables CSS), relues au plus toutes les 2 s : getComputedStyle à chaque image coûte cher sur téléphone
let colors = null, colorsT = 0;
export function poseColors() {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (!colors || now - colorsT > 2000) {
    let ok = '', bad = '';
    try { const css = getComputedStyle(document.documentElement); ok = css.getPropertyValue('--pose-ok').trim(); bad = css.getPropertyValue('--pose-bad').trim(); } catch (_) {}
    colors = { ok: ok || '#2dd4bf', bad: bad || '#ff7a59' }; colorsT = now;
  }
  return colors;
}
