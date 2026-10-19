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
const HAND_DEFAULT = { wrist: 0, mcp: 0, pip: 0, dip: 0, thumb: 20, forearmRot: 0 };
const FOOT_DEFAULT = { arch: 6, toes: 0, ankle: 0 };

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
  j.elbow = add(j.shoulder, dir(q.uarm, L.uarm));
  j.wrist = add(j.elbow, dir(q.farm, L.farm));
  j.knee = add(j.pelvis, dir(q.thigh, L.thigh));
  j.ankle = add(j.knee, dir(q.shank, L.shank));
  j.toe = add(j.ankle, dir(q.foot, L.foot));
  j.elbow2 = add(j.shoulder, dir(far.uarm, L.uarm));
  j.wrist2 = add(j.elbow2, dir(far.farm, L.farm));
  j.knee2 = add(j.pelvis, dir(far.thigh, L.thigh));
  j.ankle2 = add(j.knee2, dir(far.shank, L.shank));
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

function handPose(p, anchor) {
  const q = { ...HAND_DEFAULT, ...p };
  const j = {};
  j.elbow = [0, 0];
  j.wrist = [70, 0];
  const pa = 90 + q.wrist; // paume prolonge l'avant-bras (90 = horizontal vers la droite)
  j.mcp = add(j.wrist, dir(pa, 30));
  j.pip = add(j.mcp, dir(pa + q.mcp, 18));
  j.dip = add(j.pip, dir(pa + q.mcp + q.pip, 12));
  j.tip = add(j.dip, dir(pa + q.mcp + q.pip + q.dip, 9));
  j.thumbBase = add(j.wrist, dir(pa - 30, 10));
  j.thumbTip = add(j.thumbBase, dir(pa - q.thumb, 24));
  j.forearmRot = q.forearmRot;
  return place(j, anchor);
}

function footPose(p, anchor) {
  const q = { ...FOOT_DEFAULT, ...p };
  const j = {};
  j.ankle = [0, 0];
  j.knee = add(j.ankle, dir(q.ankle, 70));
  j.heel = [-14, 26];
  j.mtp = [52, 26];
  j.archTop = [20, 26 - q.arch - 8];
  j.toe = add(j.mtp, dir(90 - q.toes, 16));
  return place(j, anchor);
}

function place(j, anchor) {
  const a = anchor || { j: 'pelvis', x: 120, y: 100 };
  const ref = j[a.j] || [0, 0];
  const dx = a.x - ref[0], dy = a.y - ref[1];
  const out = {};
  for (const k in j) out[k] = Array.isArray(j[k]) ? [j[k][0] + dx, j[k][1] + dy] : j[k];
  return out;
}

export function pose(fig, params) {
  const v = fig.view || 'side';
  if (v === 'front') return frontPose(params, fig.anchor || { j: 'pelvis', x: 120, y: 98 });
  if (v === 'hand') return handPose(params, fig.anchor || { j: 'elbow', x: 40, y: 100 });
  if (v === 'foot') return footPose(params, fig.anchor || { j: 'ankle', x: 100, y: 120 });
  return sidePose(params, fig.anchor || { j: 'ankle', x: 120, y: 178 });
}

function interpParams(a, b, t) {
  const o = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const def = { ...SIDE_DEFAULT, ...FRONT_DEFAULT, ...HAND_DEFAULT, ...FOOT_DEFAULT };
  for (const k of keys) {
    const va = a[k] ?? b[k] ?? def[k] ?? 0;
    const vb = b[k] ?? a[k] ?? def[k] ?? 0;
    o[k] = lerp(va, vb, t);
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
  for (const p of props) {
    const [name, a = 0, b = 0] = Array.isArray(p) ? p : [p];
    if (name === 'wall') el('rect', { x: a || 196, y: 20, width: 10, height: 162, class: 'fg-prop' }, g);
    if (name === 'step') el('rect', { x: a || 90, y: 162, width: b || 60, height: 20, rx: 3, class: 'fg-prop' }, g);
    if (name === 'chair') {
      const x = a || 56, y = b || 142;
      el('rect', { x, y, width: 44, height: 6, rx: 2, class: 'fg-prop' }, g);
      el('rect', { x: x + 2, y: y + 6, width: 5, height: 182 - y - 6, class: 'fg-prop' }, g);
      el('rect', { x: x + 37, y: y + 6, width: 5, height: 182 - y - 6, class: 'fg-prop' }, g);
    }
    if (name === 'mat') el('rect', { x: 14, y: 178, width: 212, height: 5, rx: 2, class: 'fg-mat' }, g);
    if (name === 'table') el('rect', { x: a || 20, y: b || 108, width: 115, height: 10, rx: 3, class: 'fg-prop' }, g);
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
  } else if (v === 'hand') {
    line(g, j.elbow, j.wrist, `fg-trunk ${cls}`);
    poly(g, [j.wrist, j.mcp, j.pip, j.dip, j.tip], `fg-limb ${cls}`);
    poly(g, [j.wrist, j.thumbBase, j.thumbTip], `fg-limb fg-far ${cls}`);
    for (const k of ['wrist', 'mcp', 'pip', 'dip'])
      el('circle', { cx: j[k][0], cy: j[k][1], r: 2.6, class: `fg-joint ${cls}` }, g);
  } else if (v === 'foot') {
    line(g, j.ankle, j.knee, `fg-trunk ${cls}`);
    el('path', {
      d: `M${j.heel} Q${j.archTop[0]},${j.archTop[1]} ${j.mtp} L${j.toe} M${j.heel} L${j.ankle} L${j.mtp}`,
      class: `fg-limb ${cls}`, fill: 'none',
    }, g);
    for (const k of ['ankle', 'heel', 'mtp']) el('circle', { cx: j[k][0], cy: j[k][1], r: 2.6, class: `fg-joint ${cls}` }, g);
  }
}

function drawHeld(g, fig, j) {
  const held = fig.held || [];
  for (const h of held) {
    const [name, a, b] = Array.isArray(h) ? h : [h];
    if (name === 'dumbbell' && j[a || 'wrist']) {
      const p = j[a || 'wrist'];
      el('rect', { x: p[0] - 7, y: p[1] - 3, width: 14, height: 6, rx: 2, class: 'fg-held' }, g);
    }
    if (name === 'stick' && j[a] && j[b]) line(g, j[a], j[b], 'fg-held-line');
    if (name === 'band' && j[a]) line(g, j[a], [b?.[0] ?? 200, b?.[1] ?? j[a][1]], 'fg-band');
    if (name === 'ball' && j[a]) el('circle', { cx: j[a][0], cy: j[a][1], r: 6, class: 'fg-held' }, g);
    if (name === 'hammer' && j.mcp) {
      const ang = j.forearmRot || 0;
      const top = add(j.mcp, dir(ang, 34));
      line(g, j.mcp, top, 'fg-held-line');
      const hd = dir(ang + 90, 9);
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

export function renderFigure(svg, fig, opts = {}) {
  const keys = opts.keys || [];
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 240 200');
  const frames = fig.frames && fig.frames.length ? fig.frames : [{}];
  const gProps = el('g', {}, svg);
  const gGhost = el('g', {}, svg);
  const gTrace = el('g', {}, svg);
  const gBody = el('g', {}, svg);
  const gArc = el('g', {}, svg);
  const gKeys = el('g', {}, svg);
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
  let raf = 0, start = 0, stopped = false;
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
    if (!start) start = ts;
    draw(ts - start);
    raf = requestAnimationFrame(loop);
  }
  if (opts.static || reduce || frames.length < 2) draw(period * (frames.length > 1 ? 0.3 : 0));
  else raf = requestAnimationFrame(loop);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}
