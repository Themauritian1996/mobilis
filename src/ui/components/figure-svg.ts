import { STRUCTURES } from '../../domains/rehab/data/anatomy.ts';
import type { AnatomyStructure, Bilingual } from '../../domains/rehab/data/types.ts';
import { tr } from './l10n.ts';
import {
  add,
  dir,
  ease,
  interpParams,
  pose,
  type FigureParams,
  type FigureSpec,
  type Joints,
  type Pt,
} from '../../vision/figure/kinematics.ts';

const isNil = (x: unknown): x is null | undefined => x === null || x === undefined;
// ---------- Rendu SVG ----------
const NS = 'http://www.w3.org/2000/svg';
/** Point d'une articulation connue de la vue courante. */
const jpt = (j: Joints, k: string): Pt => j[k] as Pt;

type Attrs = Readonly<Record<string, string | number | undefined>>;
type Svg = SVGElement | SVGSVGElement;

const el = (name: string, attrs: Attrs = {}, parent?: Svg): SVGElement => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
};
const line = (g: Svg, a: Pt, b: Pt, cls: string): SVGElement =>
  el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls }, g);
const poly = (g: Svg, pts: readonly Pt[], cls: string): SVGElement =>
  el('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: cls }, g);

function drawProps(g: Svg, fig: FigureSpec, j0: Joints): void {
  const props = fig.props || [];
  const v = fig.view || 'side';
  if (v === 'side' || v === 'front') el('line', { x1: 8, y1: 182, x2: 232, y2: 182, class: 'fg-ground' }, g);
  if ((v === 'foot' || v === 'footBack') && fig.ground !== false)
    el('line', { x1: 20, y1: j0.heel[1] + 2, x2: 220, y2: j0.heel[1] + 2, class: 'fg-ground' }, g);
  for (const p of props) {
    const [name, a = 0, b = 0] = Array.isArray(p) ? p : [p];
    if (name === 'wall') el('rect', { x: a || 196, y: -40, width: 10, height: 222, class: 'fg-prop' }, g);
    if (name === 'step') el('rect', { x: a || 90, y: 162, width: b || 60, height: 20, rx: 3, class: 'fg-prop' }, g);
    if (name === 'chair') {
      const x = a || 56,
        y = b || 142;
      el('rect', { x, y, width: 44, height: 6, rx: 2, class: 'fg-prop' }, g);
      el('rect', { x: x + 2, y: y + 6, width: 5, height: 182 - y - 6, class: 'fg-prop' }, g);
      el('rect', { x: x + 37, y: y + 6, width: 5, height: 182 - y - 6, class: 'fg-prop' }, g);
    }
    if (name === 'mat') el('rect', { x: 14, y: 178, width: 212, height: 5, rx: 2, class: 'fg-mat' }, g);
    if (name === 'table' && v === 'end')
      el('rect', { x: 40, y: j0.wrist[1] + 26, width: 160, height: 10, rx: 3, class: 'fg-prop' }, g);
    if (name === 'table' && v === 'hand') {
      el('rect', { x: 4, y: j0.elbow[1] + 9, width: j0.wrist[0] - 4 - 2, height: 9, rx: 3, class: 'fg-prop' }, g);
      el('rect', { x: 14, y: j0.elbow[1] + 18, width: 6, height: 182 - j0.elbow[1] - 18, class: 'fg-prop' }, g);
    } else if (name === 'table')
      el('rect', { x: a || 20, y: b || 108, width: 115, height: 10, rx: 3, class: 'fg-prop' }, g);
    if (name === 'roll' && j0.toe) el('circle', { cx: j0.toe[0] - 4, cy: 177.5, r: 4.5, class: 'fg-prop' }, g);
    if (name === 'towel')
      el(
        'path',
        { d: `M${j0.heel[0] - 10},${j0.heel[1] + 3} L${j0.mtp[0] + 34},${j0.heel[1] + 3}`, class: 'fg-towel' },
        g,
      );
  }
}

function drawBody(g: Svg, fig: FigureSpec, j: Joints, cls: string): void {
  const v = fig.view || 'side';
  if (v === 'side') {
    // membres éloignés (plus pâles)
    poly(g, [j.pelvis, j.knee2, j.ankle2, j.toe2], `fg-limb fg-far ${cls}`);
    poly(g, [j.shoulder, j.elbow2, j.wrist2], `fg-limb fg-far ${cls}`);
    if (j.bend) {
      const m: Pt = [(j.pelvis[0] + j.shoulder[0]) / 2, (j.pelvis[1] + j.shoulder[1]) / 2];
      const dx = j.shoulder[0] - j.pelvis[0],
        dy = j.shoulder[1] - j.pelvis[1];
      const n = Math.hypot(dx, dy) || 1;
      const c: Pt = [m[0] + (dy / n) * j.bend * 2, m[1] - (dx / n) * j.bend * 2];
      el('path', { d: `M${j.pelvis} Q${c} ${j.shoulder}`, class: `fg-trunk ${cls}`, fill: 'none' }, g);
    } else line(g, j.pelvis, j.shoulder, `fg-trunk ${cls}`);
    poly(g, [j.pelvis, j.knee, j.ankle, j.toe], `fg-limb ${cls}`);
    poly(g, [j.shoulder, j.elbow, j.wrist], `fg-limb ${cls}`);
    el('circle', { cx: j.head[0], cy: j.head[1], r: 9, class: `fg-head ${cls}` }, g);
    if (j.nose) el('circle', { cx: j.nose[0], cy: j.nose[1], r: 2.8, class: `fg-head ${cls}` }, g);
    for (const k of ['knee', 'elbow', 'pelvis', 'shoulder', 'ankle', 'wrist'])
      el('circle', { cx: jpt(j, k)[0], cy: jpt(j, k)[1], r: 2.6, class: `fg-joint ${cls}` }, g);
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
      el('circle', { cx: jpt(j, k)[0], cy: jpt(j, k)[1], r: 2.4, class: `fg-joint ${cls}` }, g);
  } else drawExtremity(g, v, j, cls);
}

// Contour plein d'un segment (avant-bras, jambe) : largeur w1 au départ, w2 à l'arrivée
function limbShape(g: Svg, a: Pt, b: Pt, w1: number, w2: number, cls: string): void {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = Math.hypot(dx, dy) || 1,
    n: Pt = [-dy / L, dx / L];
  const pts: Pt[] = [
    [a[0] + n[0] * w1, a[1] + n[1] * w1],
    [b[0] + n[0] * w2, b[1] + n[1] * w2],
    [b[0] - n[0] * w2, b[1] - n[1] * w2],
    [a[0] - n[0] * w1, a[1] - n[1] * w1],
  ];
  el('polygon', { points: pts.map((p) => p.join(',')).join(' '), class: cls }, g);
  el('circle', { cx: a[0], cy: a[1], r: w1, class: cls }, g);
  el('circle', { cx: b[0], cy: b[1], r: w2, class: cls }, g);
}
function drawExtremity(g: Svg, v: string, j: Joints, cls: string): void {
  if (v === 'hand') {
    limbShape(g, j.elbow, j.wrist, 9, 6.5, `fg-skin ${cls}`);
    limbShape(g, j.wrist, j.mcp, 7, 6.5, `fg-skin ${cls}`);
    poly(g, [j.thumbBase, j.thumbMcp, j.thumbTip], `fg-finger fg-far fg-thumb-side ${cls}`); // pouce le long de l'index, côté caché (vue de côté)
    // doigts : un doigt « arrière » plus pâle donne la profondeur des 4 doigts
    const off = (p: Pt): Pt => [p[0] + 2.5, p[1] - 2.5];
    poly(g, [j.mcp, j.pip, j.dip, j.tip].map(off), `fg-finger fg-far ${cls}`);
    if ((j.curl ?? 0) > 150)
      el(
        'polygon',
        { points: [j.mcp, j.pip, j.dip, j.tip].map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` },
        g,
      ); // poing fermé : forme pleine
    poly(g, [j.mcp, j.pip, j.dip, j.tip], `fg-finger ${cls}`);
    for (const k of ['wrist', 'mcp', 'pip', 'dip'])
      el('circle', { cx: jpt(j, k)[0], cy: jpt(j, k)[1], r: 1.8, class: `fg-joint ${cls}` }, g);
  } else if (v === 'palm') {
    el(
      'polygon',
      {
        points: [
          [j.wrist[0] - 17, j.wrist[1] + 2],
          [j.wrist[0] + 17, j.wrist[1] + 2],
          [j.wrist[0] + 15, j.wrist[1] + 30],
          [j.wrist[0] - 15, j.wrist[1] + 30],
        ]
          .map((p) => p.join(','))
          .join(' '),
        class: `fg-skin ${cls}`,
      },
      g,
    );
    const palmPts = j.palmPts as Pt[];
    el('polygon', { points: palmPts.map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` }, g);
    // plis de la paume
    el(
      'path',
      { d: `M${(palmPts[3] as Pt)[0] + 4},${(palmPts[3] as Pt)[1] + 12} q 22,6 46,-2`, class: `fg-crease ${cls}` },
      g,
    );
    el('path', { d: `M${j.thumbBase[0] - 4},${j.thumbBase[1] - 4} q -16,-8 -20,-34`, class: `fg-crease ${cls}` }, g);
    if (j.ball) el('circle', { cx: j.ball[0], cy: j.ball[1], r: 13, class: `fg-ball ${cls}` }, g);
    (j.fingers as Pt[][]).forEach((f) => {
      poly(g, f, `fg-finger fg-finger-palm ${cls}`);
      for (const pt of f.slice(1, 3)) el('circle', { cx: pt[0], cy: pt[1], r: 1.3, class: `fg-joint ${cls}` }, g);
    });
    poly(g, [j.thumbBase, j.thumbMcp, j.thumbTip], `fg-finger fg-finger-palm fg-thumb ${cls}`);
    if (j.band)
      el(
        'path',
        {
          d: `M${j.thumbTip[0]},${j.thumbTip[1]} C${j.thumbTip[0] + 14},${j.thumbTip[1] - 18} ${j.tip[0] + 10},${j.tip[1] - 22} ${j.tip[0]},${j.tip[1]}`,
          class: `fg-band ${cls}`,
        },
        g,
      );
  } else if (v === 'foot') {
    limbShape(g, j.knee, j.ankle, 9, 6.5, `fg-skin ${cls}`);
    const d = `M${j.front} L${j.dorsum} L${j.mtpTop} L${j.toeTop} Q${j.toe[0] + 3},${j.toe[1] + 2} ${j.toe} L${j.mtp} Q${j.archTop} ${j.heel} Q${j.heel[0] - 8},${j.heel[1] - 2} ${j.heelBack} L${j.ankle} Z`;
    el('path', { d, class: `fg-skin ${cls}` }, g);
    for (const k of ['ankle', 'mtp'])
      el('circle', { cx: jpt(j, k)[0], cy: jpt(j, k)[1], r: 1.8, class: `fg-joint ${cls}` }, g);
  } else if (v === 'end') {
    // avant-bras appuyé sur la table, vu dans son axe : coupe ronde + poing qui tourne
    // coude et bras (au loin, en perspective) : donnent le sens de l'avant-bras posé sur la table
    el('ellipse', { cx: j.wrist[0], cy: j.wrist[1] + 10, rx: 24, ry: 20, class: `fg-skin fg-far ${cls}` }, g);
    const a = ((j.forearmRot || 0) * Math.PI) / 180,
      w = 14,
      h = 20;
    const R = (x: number, y: number): Pt => [
      j.wrist[0] + x * Math.cos(a) - y * Math.sin(a),
      j.wrist[1] + x * Math.sin(a) + y * Math.cos(a),
    ];
    const pts: Pt[] = [
      R(-w, -h + 6),
      R(-w + 6, -h),
      R(w - 6, -h),
      R(w, -h + 6),
      R(w, h - 6),
      R(w - 6, h),
      R(-w + 6, h),
      R(-w, h - 6),
    ];
    el(
      'polygon',
      { points: pts.map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}`, 'stroke-linejoin': 'round' },
      g,
    );
    // jointures des doigts (côté dos de la main) et pouce sur le dessus du poing
    for (let k = 0; k < 4; k++)
      el(
        'circle',
        { cx: R(-w + 1, -h + 8 + k * 9.5)[0], cy: R(-w + 1, -h + 8 + k * 9.5)[1], r: 2.4, class: `fg-joint ${cls}` },
        g,
      );
    const th = R(-2, -h - 1),
      th2 = R(9, -h - 3);
    line(g, th, th2, `fg-finger fg-thumb ${cls}`);
    j.fistTop = R(0, -h);
  } else if (v === 'footBack') {
    limbShape(g, j.knee, j.ankle, 10, 7, `fg-skin ${cls}`);
    el(
      'polygon',
      { points: [j.topL, j.topR, j.solR, j.solL].map((p) => p.join(',')).join(' '), class: `fg-skin ${cls}` },
      g,
    );
    el('circle', { cx: j.heel[0], cy: j.heel[1] - 4, r: 9, class: `fg-skin ${cls}` }, g);
    line(g, j.solL, j.solR, `fg-sole ${cls}`);
    el('circle', { cx: j.ankle[0], cy: j.ankle[1], r: 2, class: `fg-joint ${cls}` }, g);
  }
}

function drawHeld(g: Svg, fig: FigureSpec, j: Joints): void {
  const held = fig.held || [];
  const at = (k: unknown): Pt | undefined => (typeof k === 'string' ? (j[k] as Pt | undefined) : undefined);
  for (const h of held) {
    const [name, a, b] = (Array.isArray(h) ? h : [h]) as readonly unknown[];
    const key = (a || 'wrist') as string;
    if (name === 'dumbbell' && !isNil(j.palmDir)) {
      // vue de côté de la main : l'haltère est vu de bout (disque)
      const c: Pt = [(j.mcp[0] + j.pip[0]) / 2, (j.mcp[1] + j.pip[1]) / 2];
      el('circle', { cx: c[0], cy: c[1], r: 11, class: 'fg-held' }, g);
      el('circle', { cx: c[0], cy: c[1], r: 4, class: 'fg-joint' }, g);
    } else if (name === 'dumbbell' && at(key)) {
      const p = at(key) as Pt;
      el('rect', { x: p[0] - 7, y: p[1] - 3, width: 14, height: 6, rx: 2, class: 'fg-held' }, g);
    }
    if (name === 'stick' && at(a) && at(b)) line(g, at(a) as Pt, at(b) as Pt, 'fg-held-line');
    // bâton tenu à deux mains, vu de bout (vue de côté) : rond dans les mains
    if (name === 'dowel' && at(key)) {
      const p = at(key) as Pt;
      el('circle', { cx: p[0] + 1, cy: p[1], r: 4.5, class: 'fg-held' }, g);
      el('circle', { cx: p[0] + 1, cy: p[1], r: 1.6, class: 'fg-joint' }, g);
    }
    // bâton le long du dos (charnière de hanche) : tête, haut du dos et sacrum en contact
    if (name === 'dowelBack' && j.pelvis && j.shoulder) {
      const u: Pt = [j.shoulder[0] - j.pelvis[0], j.shoulder[1] - j.pelvis[1]],
        l = Math.hypot(u[0], u[1]) || 1,
        e: Pt = [u[0] / l, u[1] / l],
        n: Pt = [e[1], -e[0]];
      const back = (p: Pt, k: number): Pt => [p[0] - n[0] * 6 + e[0] * k, p[1] - n[1] * 6 + e[1] * k];
      line(g, back(j.pelvis, -12), back(j.shoulder, 30), 'fg-held-line');
    }
    if (name === 'band' && at(a)) {
      const pa = at(a) as Pt;
      const bn = b as readonly number[] | undefined;
      line(g, pa, [bn?.[0] ?? 200, bn?.[1] ?? pa[1]], 'fg-band');
    }
    if (name === 'ball' && at(a)) {
      const pa = at(a) as Pt;
      el('circle', { cx: pa[0], cy: pa[1], r: 6, class: 'fg-held' }, g);
    }
    if (name === 'vbar' && j.pip) {
      const d = j.palmDir ?? 90;
      line(g, add(j.pip, dir(d - 90, 34)), add(j.pip, dir(d + 90, 34)), 'fg-held-line fg-thick');
    }
    if (name === 'hammer' && j.pip) {
      // manche tenu dans le poing (centre du poing ≈ entre MCP et IPP), tête en haut ; forearmRot = rotation du manche
      const ang = j.forearmRot || 0,
        c: Pt = [(j.mcp[0] + j.pip[0]) / 2, (j.mcp[1] + j.pip[1]) / 2];
      const bot = add(c, dir(ang + 180, 12)),
        top = add(c, dir(ang, 38));
      line(g, bot, top, 'fg-held-line');
      const hd = dir(ang + 90, 10);
      line(g, add(top, hd), add(top, [-hd[0], -hd[1]]), 'fg-held-line fg-thick');
    }
  }
}

function arcPath(c: Pt, a: Pt, b: Pt, r: number): { d: string; deg: number; mid: number } {
  const a1 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const a2 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const s: Pt = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
  const e: Pt = [c[0] + r * Math.cos(a1 + d), c[1] + r * Math.sin(a1 + d)];
  return { d: `M${s} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${e}`, deg: Math.abs((d * 180) / Math.PI), mid: a1 + d / 2 };
}

// Étiquette qui reste dans le cadre du schéma
function label(g: Svg, x: number, y: number, anchor: string, text: string): void {
  const w = text.length * 3.7;
  if (anchor === 'end' && x - w < 3) {
    anchor = 'start';
    x = 3;
  }
  if (anchor === 'start' && x + w > 237) {
    anchor = 'end';
    x = 237;
  }
  if (anchor === 'middle') x = Math.min(237 - w / 2, Math.max(3 + w / 2, x));
  const tx = el('text', { x, y: Math.min(196, Math.max(8, y)), class: 'fg-an-label', 'text-anchor': anchor }, g);
  tx.textContent = text;
}

// Couche anatomique : muscles, tendons, nerfs, fascia, articulations
function drawAnat(g: Svg, j: Joints, keys: readonly string[] | undefined): void {
  for (const key of keys || []) {
    const st = (STRUCTURES as Readonly<Record<string, AnatomyStructure>>)[key];
    if (!st) continue;
    if (st.kind === 'joint') {
      const p = j[st.at as string] as Pt | undefined;
      if (!p) continue;
      const r = st.r as number;
      el('circle', { cx: p[0], cy: p[1], r, class: 'fg-an-joint' }, g);
      label(g, p[0] + r + 3, p[1] + r + 9, 'start', tr(st.name as Bilingual));
      continue;
    }
    type Part = [string, string, number, readonly [number, number]];
    const stT = st.t as readonly [number, number];
    const seg = st.seg as readonly [string, string];
    const parts: Part[] = [[seg[0], seg[1], st.off as number, stT]];
    if (st.mirror) parts.push([st.mirror[0], st.mirror[1], st.mirror[2], stT]);
    for (const m of st.more || []) parts.push([m[0], m[1], m[2], [0, 1]]);
    let labelled = false;
    parts.forEach(([A, B, off, t], i) => {
      const a = j[A] as Pt | undefined,
        b = j[B] as Pt | undefined;
      if (!a || !b) return;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1;
      const n: Pt = [dy / len, -dx / len];
      const P = (u: number): Pt => [a[0] + dx * u + n[0] * off, a[1] + dy * u + n[1] * off];
      const p0 = P(t[0]),
        p1 = P(t[1]);
      el(
        'line',
        { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], class: `fg-an fg-an-${st.kind}`, 'stroke-width': st.w as number },
        g,
      );
      if (!labelled && i === 0) {
        labelled = true;
        const m = P((t[0] + t[1]) / 2);
        const side = off >= 0 ? 1 : -1;
        const lx = m[0] + n[0] * side * ((st.w as number) / 2 + 5),
          ly = m[1] + n[1] * side * ((st.w as number) / 2 + 5) + 3;
        label(
          g,
          lx,
          ly,
          n[0] * side >= 0.2 ? 'start' : n[0] * side <= -0.2 ? 'end' : 'middle',
          tr(st.name as Bilingual),
        );
      }
    });
  }
}

// Échelle qui garde tout le mouvement dans le cadre (vues corps entier posées au sol, sans zoom manuel)
export function figFit(fig: FigureSpec): { z: number; cx: number; cy: number } {
  const v = fig.view || 'side';
  if (fig.zoom && fig.anchor) return { z: fig.zoom, cx: fig.anchor.x, cy: fig.anchor.y };
  if (v !== 'side' && v !== 'front') return { z: 1, cx: 0, cy: 0 };
  const fr: readonly FigureParams[] = fig.frames && fig.frames.length ? fig.frames : [{}];
  const fr0: FigureParams = fr[0] ?? {};
  const pairs: (readonly [FigureParams, FigureParams])[] =
    fr.length > 1 ? fr.slice(0, -1).map((a, i): [FigureParams, FigureParams] => [a, fr[i + 1] ?? a]) : [[fr0, fr0]];
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity;
  for (const [A, B] of pairs)
    for (let k = 0; k <= 8; k++) {
      const j = pose(fig, interpParams(A, B, k / 8));
      for (const [n, p] of Object.entries(j)) {
        if (!Array.isArray(p) || typeof p[0] !== 'number') continue;
        const q = p as Pt;
        const m = n === 'head' ? 7 : 3;
        x0 = Math.min(x0, q[0] - m);
        x1 = Math.max(x1, q[0] + m);
        y0 = Math.min(y0, q[1] - m);
      }
    }
  const cx = 120,
    cy = 182;
  const z = Math.min(
    1,
    y0 < 2 ? (cy - 2) / (cy - y0) : 1,
    x0 < 2 ? (cx - 2) / (cx - x0) : 1,
    x1 > 238 ? (238 - cx) / (x1 - cx) : 1,
  );
  return { z: Math.round(z * 1000) / 1000, cx, cy };
}

export interface RenderOptions {
  readonly keys?: readonly { readonly j: string; readonly off?: readonly [number, number] }[];
  readonly showAnatomy?: boolean;
  readonly anatomy?: readonly string[];
  readonly at?: number | null;
  readonly static?: boolean;
}

/** Commandes d'un schéma animé. */
export interface FigureHandle {
  stop(): void;
  setAnatomy(on: boolean): void;
  setSpeed(f: number): void;
  setPaused(on: boolean): void;
  readonly animated: boolean;
}

export function renderFigure(svg: SVGSVGElement, fig: FigureSpec, opts: RenderOptions = {}): FigureHandle {
  const keys = opts.keys || [];
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 240 200');
  const frames: readonly FigureParams[] = fig.frames && fig.frames.length ? fig.frames : [{}];
  const f0: FigureParams = frames[0] ?? {};
  // agrandissement (mains) : tout le dessin est mis à l'échelle autour du point d'ancrage, traits compris
  const fit = figFit(fig);
  const root =
    fit.z !== 1
      ? el('g', { transform: `translate(${fit.cx},${fit.cy}) scale(${fit.z}) translate(${-fit.cx},${-fit.cy})` }, svg)
      : svg;
  const gProps = el('g', {}, root);
  const gGhost = el('g', {}, root);
  const gTrace = el('g', {}, root);
  const gBody = el('g', {}, root);
  const gAnat = el('g', { class: 'fg-anat' }, root);
  const gArc = el('g', {}, root);
  let showAnat = !!opts.showAnatomy;
  const gKeys = el('g', {}, root);
  drawProps(gProps, fig, pose(fig, f0));
  // fantômes : position de départ et position cible
  if (frames.length > 1) {
    drawBody(gGhost, fig, pose(fig, f0), 'fg-ghost');
    drawBody(gGhost, fig, pose(fig, frames[frames.length > 2 ? 1 : frames.length - 1] ?? f0), 'fg-ghost fg-ghost-end');
  }
  // trajectoire du segment distal (flèche)
  if (fig.trace && frames.length > 1) {
    const pts: Pt[] = [];
    const target = frames.length > 2 ? 1 : frames.length - 1;
    const fT = frames[target] ?? f0;
    for (let i = 0; i <= 16; i++) pts.push(pose(fig, interpParams(f0, fT, i / 16))[fig.trace] as Pt);
    if (pts[0]) {
      poly(gTrace, pts, 'fg-trace');
      const a = pts[pts.length - 2] as Pt,
        b = pts[pts.length - 1] as Pt;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h = (o: number): Pt => [b[0] - 7 * Math.cos(ang + o), b[1] - 7 * Math.sin(ang + o)];
      poly(gTrace, [h(0.5), b, h(-0.5)], 'fg-trace fg-arrow');
    }
  }
  let raf = 0,
    prevTs = 0,
    stopped = false,
    lastMs = 0,
    animated = false,
    speed = 1,
    paused = false;
  const period = (fig.period || 3.2) * 1000;
  const seq: readonly FigureParams[] =
    frames.length > 2 ? frames.concat([f0]) : frames.length === 2 ? [f0, frames[1] ?? f0, f0] : [f0, f0];

  function paramsAt(ms: number): FigureParams {
    const n = seq.length - 1;
    const u = ((ms % period) / period) * n;
    const i = Math.min(Math.floor(u), n - 1);
    let t = u - i;
    // petite pause en fin de mouvement
    t = Math.min(1, Math.max(0, (t - 0.12) / 0.76));
    return interpParams(seq[i] ?? f0, seq[i + 1] ?? f0, ease(t));
  }

  function draw(ms: number): void {
    gBody.innerHTML = '';
    gArc.innerHTML = '';
    gKeys.innerHTML = '';
    const j = pose(fig, paramsAt(ms));
    drawBody(gBody, fig, j, '');
    drawHeld(gBody, fig, j);
    gAnat.innerHTML = '';
    if (showAnat) drawAnat(gAnat, j, opts.anatomy);
    const arc = fig.arc;
    if (arc && j[arc[0] as string]) {
      const [c, a, b] = arc.map((k) => j[k] as Pt | undefined);
      if (c && a && b) {
        const r = arcPath(c, a, b, 15);
        el('path', { d: r.d, class: 'fg-arc' }, gArc);
        const tp: Pt = [c[0] + 26 * Math.cos(r.mid), c[1] + 26 * Math.sin(r.mid)];
        const t = el('text', { x: tp[0], y: tp[1] + 3, class: 'fg-arc-txt', 'text-anchor': 'middle' }, gArc);
        t.textContent = `${Math.round(r.deg)}°`;
      }
    }
    keys.forEach((k, i) => {
      const p = j[k.j] as Pt | undefined;
      if (!p) return;
      const off = k.off || [10, -10];
      el('circle', { cx: p[0] + off[0], cy: p[1] + off[1], r: 6.5, class: 'fg-key' }, gKeys);
      const t = el(
        'text',
        { x: p[0] + off[0], y: p[1] + off[1] + 3, class: 'fg-key-txt', 'text-anchor': 'middle' },
        gKeys,
      );
      t.textContent = String(i + 1);
    });
  }

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(ts: number): void {
    if (stopped) return;
    if (!prevTs) prevTs = ts;
    if (!paused) {
      lastMs += Math.min(100, ts - prevTs) * speed;
      draw(lastMs);
    }
    prevTs = ts;
    raf = requestAnimationFrame(loop);
  }
  if (!isNil(opts.at)) {
    lastMs = period * opts.at;
    draw(lastMs);
  } else if (opts.static || reduce || frames.length < 2) {
    lastMs = period * (frames.length > 1 ? 0.3 : 0);
    draw(lastMs);
  } else {
    animated = true;
    raf = requestAnimationFrame(loop);
  }
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    setAnatomy(on) {
      showAnat = !!on;
      if (!animated || paused) draw(lastMs);
    },
    // lecture de la démonstration : pause / ralenti (0,5×)
    setSpeed(f) {
      speed = f;
    },
    setPaused(on) {
      paused = !!on;
    },
    get animated() {
      return animated;
    },
  };
}
