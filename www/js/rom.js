// Mesure d'amplitude articulaire par caméra (goniométrie 2D / 3D) : logique pure (testée dans tests/rom.test.mjs),
// flux de mesure (#/rom/<test>/<côté>), historique (#/amplitude) et crochets pour l'accueil, l'éditeur de programme et la fiche patient.
// Le catalogue et les calculs d'angle sont dans data/romtests.js. La vidéo ne quitte jamais le téléphone.
//
// Précision : voir la `note` de chaque test. Ordre de grandeur : ± 5° (coude, genou), ± 8–10° (hanche, poignet), ± 10–15° (rotation externe
// d'épaule, rotation cervicale). Ce n'est pas un goniomètre : sert à suivre l'évolution d'un même patient, avec la même installation.
import { t, tr, locale } from './i18n.js';
import { TESTS, TEST_IDS, getTest, sidesOf, measure, planeRatio, SUGGESTED, SUGGESTED_REGION } from './data/romtests.js';
import { state, go, profile, updateProfile, syncProgress } from './state.js';
import * as store from './store.js';
import { loadPose, drawSkeleton } from './pose.js';
import { loadHands, detectHands, pickHand, drawHand } from './hand.js';
import { canvasSize, fitRect, projectLandmarks, LandmarkSmoother, SubjectGuard, Pacer } from './overlay.js';
import { assessPlacement, PlacementGate, scopeOf, guideRect, subjectBox, issueIcon, ICON_SVG } from './placement.js';

export { TESTS, TEST_IDS, getTest };
const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sdOf = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const RULER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg>';

// =====================================================================================================================
// Pure logic
// =====================================================================================================================

/** Plan de mesures → liste normalisée [{ test, side }]. Accepte 'sh_flex_L', 'sh_flex' (= les deux côtés), { test, side } ou { test } (= les deux côtés). */
export function planItems(plan) {
  const raw = Array.isArray(plan) ? plan : plan && Array.isArray(plan.tests) ? plan.tests : [];
  const out = [], seen = new Set();
  const add = (test, side) => {
    const T = TESTS[test]; if (!T) return;
    const sides = !T.sided ? [null] : side === 'L' || side === 'R' ? [side] : ['L', 'R'];
    for (const s of sides) { const k = test + '_' + (s || '-'); if (!seen.has(k)) { seen.add(k); out.push({ test, side: s }); } }
  };
  for (const it of raw) {
    if (typeof it === 'string') { const m = it.match(/^(.*)_([LR])$/); if (m && TESTS[m[1]]) add(m[1], m[2]); else add(it, null); }
    else if (it && it.test) add(it.test, it.side || null);
  }
  return out;
}
export const planEvery = (plan) => (plan && Number.isFinite(+plan.every) ? Math.max(0, +plan.every) : 0);
export const itemKey = (test, side) => `${test}_${side || '-'}`;
export const romHash = (test, side) => `#/rom/${test}/${side || '-'}`;
const sideOf = (r) => r.side || null;

/** Part de confiance de la vue : rapport largeur d'épaules / tronc (≈ 0,5–0,9 de face, < 0,28 de profil). Inconnu → 0,85. */
export function planeScore(view, ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 0.85;
  if (view === 'side') return ratio <= 0.28 ? 1 : ratio >= 0.5 ? 0.3 : 1 - ((ratio - 0.28) / 0.22) * 0.7;
  return ratio >= 0.45 ? 1 : ratio <= 0.25 ? 0.3 : 0.3 + ((ratio - 0.25) / 0.2) * 0.7;
}
/** Confiance 0–1 d'une mesure : visibilité des points (0,4 → 0 ; 0,9 → 1) × vue (profil / face correcte) × stabilité (écart-type pendant le maintien) × qualité 2D/3D × plafond du test. */
export function confidence({ vis = 1, ratio = null, view = 'side', sd = 0, maxConf = 1, q = 1 } = {}) {
  const v = clamp((vis - 0.4) / 0.5, 0, 1), p = planeScore(view, ratio), j = 1 - 0.6 * clamp((sd - 1) / 4, 0, 1);
  return Math.round(clamp(v * p * j * q * maxConf, 0, 1) * 100) / 100;
}
export const CONF_MIN = 0.5;
export const confLabel = (c) => (c >= 0.75 ? 'good' : c >= CONF_MIN ? 'fair' : 'low');

/** Détecteur de maintien. On alimente avec { t (ms), deg, vis, ratio?, q? } ; il rend { state, progress, deg, result? }.
 *  Un maintien = valeur stable à ± tol (3°) pendant ≥ holdMs (1,5 s), au moins minTravel degrés plus loin que la position de départ
 *  et près du maximum atteint (un dépassement bref ne compte pas). Résultat = médiane de la fenêtre stable.
 *  Après un résultat, le détecteur attend que le patient revienne (≥ rearm) avant d'en chercher un autre.
 *  dir = +1 : on cherche le maximum ; −1 : le minimum (déficits d'extension, distance doigts–sol). */
export class HoldDetector {
  constructor({ tol = 3, holdMs = 1500, minVis = 0.5, dir = 1, minTravel = 15, gapMs = 600, minN = 6 } = {}) {
    Object.assign(this, { tol, holdMs, minVis, dir, minTravel, gapMs, minN }); this.results = []; this.reset();
  }
  reset() { this.buf = []; this.start = null; this.ext = null; this.lastGood = -Infinity; this.armed = true; this.hold = null; this.lastDeg = null; this.results.length = 0; }
  /** Oublie la fenêtre en cours (garde la position de départ). */
  clearRun() { this.buf = []; this.ext = null; }
  push(s) {
    const { t: now, deg, vis = 1 } = s;
    if (!Number.isFinite(deg) || vis < this.minVis) {
      if (now - this.lastGood > this.gapMs) this.clearRun();
      return { state: 'lost', progress: 0, deg: this.lastDeg };
    }
    this.lastGood = now;
    this.buf.push({ ...s, vis });
    while (this.buf.length && now - this.buf[0].t > 6000) this.buf.shift();
    const n = this.buf.length, last3 = this.buf.slice(-3).map((x) => x.deg);
    const sm = median(last3); this.buf[n - 1].sm = sm; this.lastDeg = sm;
    if (this.start == null && n >= 5) this.start = median(this.buf.slice(0, 5).map((x) => x.sm ?? x.deg));
    if (!this.armed) {
      const dist = Math.max(8, 0.5 * Math.abs(this.hold - (this.start ?? this.hold)));
      if (Math.abs(sm - this.hold) >= dist) { this.armed = true; this.buf = this.buf.slice(-1); this.ext = null; }
      else return { state: 'rest', progress: 0, deg: sm };
    }
    this.ext = this.ext == null ? sm : this.dir > 0 ? Math.max(this.ext, sm) : Math.min(this.ext, sm);
    // fenêtre stable : suffixe dont les valeurs lissées restent à ± tol de la médiane des dernières valeurs
    const ref = median(this.buf.slice(-5).map((x) => x.sm ?? x.deg));
    let i = this.buf.length - 1;
    while (i > 0 && Math.abs((this.buf[i - 1].sm ?? this.buf[i - 1].deg) - ref) <= this.tol) i--;
    const win = this.buf.slice(i), dur = win[win.length - 1].t - win[0].t, progress = clamp(dur / this.holdMs, 0, 1);
    if (this.start == null) return { state: 'moving', progress: 0, deg: sm };
    const away = this.dir * (ref - this.start), nearMax = this.dir * (this.ext - ref) <= Math.max(2 * this.tol, 0.15 * Math.abs(this.ext - this.start));
    const holding = away >= this.minTravel * 0.6 && nearMax;
    if (dur >= this.holdMs && win.length >= this.minN && away >= this.minTravel && nearMax) {
      const degs = win.map((x) => x.deg), pick = (k) => win.map((x) => x[k]).filter((v) => v != null && Number.isFinite(v));
      const result = { deg: median(degs), sd: sdOf(degs), n: win.length, vis: mean(win.map((x) => x.vis)), ratio: pick('ratio').length ? mean(pick('ratio')) : null, q: pick('q').length ? mean(pick('q')) : 1, t0: win[0].t, t1: win[win.length - 1].t, peak: this.ext };
      this.results.push(result); this.armed = false; this.hold = result.deg; this.buf = [];
      return { state: 'fired', progress: 1, deg: sm, result };
    }
    return { state: holding && progress > 0.05 ? 'holding' : 'moving', progress: holding ? progress : 0, deg: sm };
  }
}
/** Version « lot » : rejoue un flux d'échantillons et rend le meilleur maintien (le plus loin dans le sens dir) ou null. */
export function findHold(samples, opts = {}) {
  const det = new HoldDetector(opts);
  for (const s of samples) det.push(s);
  const dir = opts.dir ?? 1;
  return det.results.reduce((b, r) => (!b || dir * (r.deg - b.deg) > 0 ? r : b), null);
}
/** Meilleur essai parmi ceux dont la confiance est suffisante (le plus loin dans le sens dir) ; null s'il n'y en a aucun. */
export function bestTrial(trials, { dir = 1, minConf = CONF_MIN } = {}) {
  const ok = (trials || []).filter((x) => x && x.conf >= minConf && Number.isFinite(x.deg));
  return ok.reduce((b, x) => (!b || dir * (x.deg - b.deg) > 0 ? x : b), null);
}

/** Mesures d'un test (et d'un côté) dans le journal, triées par date. */
export function seriesOf(log, test, side) {
  const T = TESTS[test], s = T && T.sided ? side : null;
  return (log || []).filter((r) => r && r.test === test && Number.isFinite(r.deg) && (!T?.sided || sideOf(r) === s)).sort((a, b) => a.ts - b.ts);
}
/** Évolution d'un test : { n, baseline, last, prev, gain (degrés gagnés : positif = mieux), pctNormal, sideDiff (ce côté − l'autre, dernières valeurs), lastTs, baselineTs }. */
export function trend(log, test, side) {
  const T = TESTS[test], rows = seriesOf(log, test, side);
  const out = { n: rows.length, baseline: null, last: null, prev: null, gain: null, pctNormal: null, sideDiff: null, lastTs: null, baselineTs: null };
  if (!rows.length) return out;
  const dir = T?.dir || 1, first = rows[0], lastR = rows[rows.length - 1];
  out.baseline = first.deg; out.baselineTs = first.ts; out.last = lastR.deg; out.lastTs = lastR.ts;
  out.prev = rows.length > 1 ? rows[rows.length - 2].deg : null;
  out.gain = r1(dir * (lastR.deg - first.deg));
  out.pctNormal = T && !T.deficit && T.normal.ref > 0 ? Math.round((lastR.deg / T.normal.ref) * 100) : null;
  if (T?.sided && side) { const o = seriesOf(log, test, side === 'L' ? 'R' : 'L'); if (o.length) out.sideDiff = r1(lastR.deg - o[o.length - 1].deg); }
  return out;
}

/** Mesures dues : plan { tests, every (semaines ; 0 = départ seulement) }, journal, date de début, maintenant → [{ test, side, reason: 'baseline'|'recurring', last (ts|null), dueTs }]. */
export function due(plan, log, startTs = 0, now = Date.now()) {
  const every = planEvery(plan), out = [];
  if (now < (startTs || 0)) return out;
  for (const it of planItems(plan)) {
    const rows = seriesOf(log, it.test, it.side), last = rows.length ? rows[rows.length - 1].ts : null;
    if (last == null) out.push({ ...it, reason: 'baseline', last: null, dueTs: startTs || now });
    else if (every > 0 && now >= last + every * 7 * DAY) out.push({ ...it, reason: 'recurring', last, dueTs: last + every * 7 * DAY });
  }
  return out;
}
const startOf = (p) => p?.romStart || p?.joinedAt || p?.startDate || 0;

/** Petit résumé pour le clinicien (ajouté à progressSummary) : { rom: [{ t, s, b, l, g, n, ts, p: [[ts, deg]…8] }] }, vide s'il n'y a rien. */
export function summaryPart(prof) {
  const log = prof?.romLog || [];
  if (!log.length) return {};
  const keys = new Map();
  for (const r of log) { const T = TESTS[r.test]; if (T) keys.set(itemKey(r.test, T.sided ? sideOf(r) : null), { test: r.test, side: T.sided ? sideOf(r) : null }); }
  const rows = [];
  for (const { test, side } of keys.values()) {
    const s = seriesOf(log, test, side), tr_ = trend(log, test, side);
    if (!s.length) continue;
    rows.push({ t: test, s: side, b: r1(tr_.baseline), l: r1(tr_.last), g: tr_.gain, n: s.length, ts: tr_.lastTs, p: s.slice(-8).map((x) => [x.ts, r1(x.deg)]), m: s[s.length - 1].method || 'camera' });
  }
  rows.sort((a, b) => b.ts - a.ts);
  return { rom: rows.slice(0, 24) };
}
/** Profil patient ← rx : { romPlan }. */
export function rxExtrasRom(rx) {
  const items = rx && rx.rom ? planItems(rx.rom) : [];
  return { romPlan: items.length ? { tests: items, every: planEvery(rx.rom) } : null };
}

// ---------- Formats ----------
export const fmtVal = (deg, T) => (deg == null || !Number.isFinite(deg) ? '–' : T && T.unit === '%' ? `${Math.round(deg)} %` : `${Math.round(deg)}°`);
export const fmtGain = (g, T) => (g == null ? '–' : `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(Math.round(g))}${T && T.unit === '%' ? ' %' : '°'}`);
const dateS = (ts) => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const testName = (id) => (TESTS[id] ? tr(TESTS[id].name) : id);
const sideName = (s) => (s === 'L' ? t('sideLeft') : s === 'R' ? t('sideRight') : '');
const label = (test, side) => `${testName(test)}${side ? ' · ' + sideName(side) : ''}`;
const everyLabel = (n) => (n ? t('rom_everyN', { n }) : t('rom_baselineOnly'));

// ---------- Graphiques (SVG en ligne) ----------
/** Courbe d'un test, les deux côtés (G : trait plein + cercles ; D : pointillés + carrés), bande de normalité. */
export function romChartSvg(testId, log, { w = 320, h = 160 } = {}) {
  const T = TESTS[testId]; if (!T) return '';
  const sides = sidesOf(testId), ser = sides.map((s) => ({ s, rows: seriesOf(log, testId, s) })).filter((x) => x.rows.length);
  if (!ser.length) return '';
  const all = ser.flatMap((x) => x.rows), t0 = Math.min(...all.map((r) => r.ts)), t1 = Math.max(...all.map((r) => r.ts));
  const maxD = Math.max(...all.map((r) => r.deg), T.normal.hi ?? 0, T.normal.ref ?? 0), yMax = Math.max(10, Math.ceil((maxD * 1.08) / 10) * 10);
  const minD = Math.min(0, ...all.map((r) => r.deg)), yMin = minD < 0 ? Math.floor(minD / 10) * 10 : 0;
  const L = 34, R = 10, Tp = 10, B = 24, iw = w - L - R, ih = h - Tp - B;
  const X = (ts) => (t1 === t0 ? L + iw / 2 : L + ((ts - t0) / (t1 - t0)) * iw), Y = (v) => Tp + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const band = T.normal.lo != null ? `<rect x="${L}" y="${Y(Math.max(T.normal.hi ?? yMax, T.normal.lo))}" width="${iw}" height="${Math.max(2, Y(T.normal.lo) - Y(Math.max(T.normal.hi ?? yMax, T.normal.lo)))}" class="rom-band"/>` : '';
  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax].map((v) => `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="rom-grid"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" class="rom-tx">${Math.round(v)}</text>`).join('');
  const lines = ser.map(({ s, rows }) => {
    const cls = s === 'R' ? 'rom-r' : 'rom-l';
    const pts = rows.map((r) => `${X(r.ts).toFixed(1)},${Y(r.deg).toFixed(1)}`);
    const mk = rows.map((r) => (s === 'R' ? `<rect x="${(X(r.ts) - 3.5).toFixed(1)}" y="${(Y(r.deg) - 3.5).toFixed(1)}" width="7" height="7" class="${cls} rom-pt ${r.method === 'manual' ? 'man' : ''}"/>` : `<circle cx="${X(r.ts).toFixed(1)}" cy="${Y(r.deg).toFixed(1)}" r="4" class="${cls} rom-pt ${r.method === 'manual' ? 'man' : ''}"/>`)).join('');
    return `<polyline points="${pts.join(' ')}" class="${cls} rom-ln" fill="none"/>${mk}`;
  }).join('');
  const alt = ser.map(({ s, rows }) => `${s ? sideName(s) + ': ' : ''}${rows.map((r) => Math.round(r.deg)).join(', ')}`).join(' / ');
  return `<svg class="rom-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(testName(testId))} — ${esc(alt)}">${band}${ticks}${lines}<text x="${L}" y="${h - 6}" class="rom-tx">${esc(dateS(t0))}</text><text x="${w - R}" y="${h - 6}" text-anchor="end" class="rom-tx">${esc(dateS(t1))}</text></svg>`;
}
const spark = (pts, w = 72, h = 24) => {
  if (!pts || pts.length < 2) return '';
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v) => 2 + ((v - x0) / (x1 - x0 || 1)) * (w - 4), Y = (v) => h - 3 - ((v - y0) / (y1 - y0 || 1)) * (h - 6);
  return `<svg class="rom-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/></svg>`;
};

// Schéma de la consigne : deux segments (un fixe, un mobile) et l'arc parcouru ; angles d'écran en degrés (0 = droite, 90 = bas)
function schematic(T) {
  const s = T.sch || { fix: 90, from: 90, to: -90 }, c = { x: 60, y: 60 }, L = 40, pt = (a, l = L) => ({ x: c.x + l * Math.cos((a * Math.PI) / 180), y: c.y + l * Math.sin((a * Math.PI) / 180) });
  const f = pt(s.fix), a = pt(s.from), b = pt(s.to), r = 26, A = pt(s.from, r), B = pt(s.to, r);
  const sweep = (((s.to - s.from) % 360) + 360) % 360, large = sweep > 180 ? 1 : 0;
  const arc = `M${A.x.toFixed(1)} ${A.y.toFixed(1)} A${r} ${r} 0 ${large} 1 ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
  const arc2 = sweep > 180 ? `M${A.x.toFixed(1)} ${A.y.toFixed(1)} A${r} ${r} 0 0 0 ${B.x.toFixed(1)} ${B.y.toFixed(1)}` : arc;
  return `<svg class="rom-sch" viewBox="0 0 120 120" role="img" aria-label="${esc(t('rom_schematic'))}"><line x1="${c.x}" y1="${c.y}" x2="${f.x.toFixed(1)}" y2="${f.y.toFixed(1)}" class="sch-fix"/><line x1="${c.x}" y1="${c.y}" x2="${a.x.toFixed(1)}" y2="${a.y.toFixed(1)}" class="sch-from"/><line x1="${c.x}" y1="${c.y}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="sch-to"/><path d="${arc2}" class="sch-arc" fill="none"/><circle cx="${c.x}" cy="${c.y}" r="4" class="sch-pv"/></svg>`;
}

// =====================================================================================================================
// Hooks : éditeur de programme (clinicien)
// =====================================================================================================================
export const EVERY_OPTIONS = [0, 1, 2, 4, 6, 8, 12];
/** Jeu suggéré d'après la pathologie ou la région : [{ test, side }]. */
export function suggestFor({ pathology, region } = {}) {
  const set = SUGGESTED[pathology] || SUGGESTED_REGION[region] || [];
  return planItems(set.flatMap(([test, sides]) => (sides ? sides.split('').map((s) => ({ test, side: s })) : [{ test }])));
}
export function rxSectionRom(rx) {
  const plan = rx && rx.rom ? planItems(rx.rom) : [], every = rx && rx.rom ? planEvery(rx.rom) : 4;
  const on = new Set(plan.map((p) => itemKey(p.test, p.side)));
  const rows = TEST_IDS.map((id) => {
    const T = TESTS[id];
    const pills = sidesOf(id).map((s) => `<button type="button" class="pill ${on.has(itemKey(id, s)) ? 'on' : ''}" data-rom-t="${id}" data-rom-s="${s || ''}" aria-pressed="${on.has(itemKey(id, s))}">${s ? esc(sideName(s)) : esc(t('rom_yes'))}</button>`).join('');
    return `<div class="toggle rom-row"><span><b>${esc(tr(T.name))}</b>${T.lowConfidence ? ` <small class="muted">· ${esc(t('rom_lowConfTag'))}</small>` : ''}${T.optional ? ` <small class="muted">· ${esc(t('rom_optional'))}</small>` : ''}</span><span class="row rom-pills">${pills}</span></div>`;
  }).join('');
  const html = `<h2>${esc(t('rom_secTitle'))}</h2><div class="card" data-rom-sec data-path="${esc(rx?.pathology || '')}" data-region="${esc(rx?.region || '')}">
    <p class="muted small" style="margin:0 0 10px">${esc(t('rom_secD'))}</p>
    <div class="row wrap" style="margin-bottom:10px"><button type="button" class="btn sm ghost" data-rom-sug>${RULER} ${esc(t('rom_suggest'))}</button><button type="button" class="btn sm ghost" data-rom-none>${esc(t('rom_none'))}</button></div>
    <div class="list">${rows}</div>
    <label class="field" style="margin-top:12px"><span>${esc(t('rom_freq'))}</span><select class="input" data-rom-every>${EVERY_OPTIONS.map((n) => `<option value="${n}" ${n === every ? 'selected' : ''}>${esc(everyLabel(n))}</option>`).join('')}</select></label>
    <small class="muted" style="display:block;margin-top:6px">${esc(t('rom_secNote'))}</small></div>`;
  const setOn = (root, items) => {
    const keys = new Set(items.map((p) => itemKey(p.test, p.side)));
    root.querySelectorAll('[data-rom-t]').forEach((b) => { const k = itemKey(b.dataset.romT, b.dataset.romS || null), v = keys.has(k); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); });
  };
  return {
    html,
    bind(root) {
      const sec = root.querySelector('[data-rom-sec]'); if (!sec) return;
      sec.querySelectorAll('[data-rom-t]').forEach((b) => { b.onclick = () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); }; });
      const sug = sec.querySelector('[data-rom-sug]'), none = sec.querySelector('[data-rom-none]');
      if (sug) sug.onclick = () => { const items = suggestFor({ pathology: sec.dataset.path, region: sec.dataset.region }); setOn(sec, items.length ? items : suggestFor({ pathology: 'frozen' })); };
      if (none) none.onclick = () => setOn(sec, []);
    },
    /** → { rom: { tests: [{ test, side }], every } | null } */
    read(root) {
      const sec = root.querySelector('[data-rom-sec]'); if (!sec) return { rom: rx?.rom || null };
      const tests = [...sec.querySelectorAll('[data-rom-t].on')].map((b) => ({ test: b.dataset.romT, side: b.dataset.romS || null }));
      if (!tests.length) return { rom: null };
      const sel = sec.querySelector('[data-rom-every]');
      return { rom: { tests, every: sel ? +sel.value || 0 : 4 } };
    },
  };
}

// =====================================================================================================================
// Hooks : accueil patient, fiche clinicien
// =====================================================================================================================
/** Éléments dus pour ce profil (plan reçu du clinicien ou plan personnel). */
export const dueForProfile = (prof, now = Date.now()) => due(prof?.romPlan, prof?.romLog, startOf(prof), now);
export function homeCardRom(prof, now = Date.now()) {
  const items = dueForProfile(prof, now);
  if (!items.length) return '';
  const it = items[0], more = items.length - 1;
  return `<div class="card rom-card"><div class="row between" style="gap:12px"><div class="row" style="gap:12px;min-width:0"><span class="rom-ic">${RULER}</span><div style="min-width:0"><b>${esc(t('rom_cardTitle'))}</b><br><small class="muted">${esc(label(it.test, it.side))}${more > 0 ? ' · ' + esc(t('rom_cardMore', { n: more })) : ''}</small></div></div>
    <button class="btn sm" data-rom-go="${romHash(it.test, it.side)}">${esc(t('rom_start'))}</button></div></div>`;
}
export function bindHomeCardRom(root, goFn = go) {
  root.querySelectorAll('[data-rom-go]').forEach((b) => { b.onclick = () => goFn(b.dataset.romGo); });
}
/** Fiche patient (clinicien) : tableau départ → dernier, gain, % de la norme, écart entre côtés, mini-courbe. `part` = summaryPart(profil). */
export function clinicPanelRom(part) {
  const rows = part && part.rom;
  if (!rows || !rows.length) return `<div class="card muted small">${esc(t('rom_noneYet'))}</div>`;
  const bySide = {}; for (const r of rows) bySide[itemKey(r.t, r.s)] = r;
  const body = rows.map((r) => {
    const T = TESTS[r.t]; if (!T) return '';
    const pct = !T.deficit && T.normal.ref > 0 ? Math.round((r.l / T.normal.ref) * 100) : null;
    const o = r.s ? bySide[itemKey(r.t, r.s === 'L' ? 'R' : 'L')] : null, diff = o ? r1(r.l - o.l) : null;
    return `<tr><td><b>${esc(testName(r.t))}</b>${r.s ? `<br><small class="muted">${esc(sideName(r.s))}</small>` : ''}</td><td class="tnum">${fmtVal(r.b, T)} → <b>${fmtVal(r.l, T)}</b>${r.m === 'manual' ? ` <small class="muted">(${esc(t('rom_manualShort'))})</small>` : ''}</td>
      <td class="tnum ${r.g > 0 ? 'rom-up' : r.g < 0 ? 'rom-down' : ''}">${fmtGain(r.g, T)}</td><td class="tnum">${pct != null ? pct + ' %' : '–'}${diff != null ? `<br><small class="muted">${esc(t('rom_vsOther'))} ${fmtGain(diff, T)}</small>` : ''}</td><td>${spark(r.p)}</td></tr>`;
  }).join('');
  return `<div class="card rom-panel"><div class="rom-scroll"><table class="rom-table"><thead><tr><th>${esc(t('rom_test'))}</th><th>${esc(t('rom_baselineLast'))}</th><th>${esc(t('rom_gain'))}</th><th>${esc(t('rom_pctNormal'))}</th><th></th></tr></thead><tbody>${body}</tbody></table></div><small class="muted" style="display:block;margin-top:8px">${esc(t('rom_panelNote'))}</small></div>`;
}

// =====================================================================================================================
// Historique patient : #/amplitude
// =====================================================================================================================
function statLine(tr_, T) {
  return `<div class="rom-stats"><div><small>${esc(t('rom_last'))}</small><b>${fmtVal(tr_.last, T)}</b></div><div><small>${esc(t('rom_baseline'))}</small><b>${fmtVal(tr_.baseline, T)}</b></div><div><small>${esc(t('rom_gain'))}</small><b class="${tr_.gain > 0 ? 'rom-up' : tr_.gain < 0 ? 'rom-down' : ''}">${fmtGain(tr_.gain, T)}</b></div>${tr_.pctNormal != null ? `<div><small>${esc(t('rom_pctNormal'))}</small><b>${tr_.pctNormal} %</b></div>` : ''}</div>`;
}
export async function viewRomHistory($app) {
  const ui = await import('./ui.js');
  if (!/^#\/amplitude/.test(location.hash)) return;
  const prof = profile() || {}, log = prof.romLog || [], plan = planItems(prof.romPlan);
  const dueNow = dueForProfile(prof), planTests = [...new Set(plan.map((p) => p.test))];
  const withData = TEST_IDS.filter((id) => log.some((r) => r.test === id));
  const shown = [...new Set([...planTests, ...withData])];
  const startBtns = (id) => sidesOf(id).map((s) => `<button class="btn sm ghost" data-rom-go="${romHash(id, s)}">${RULER} ${esc(s ? sideName(s) : t('rom_measure'))}</button>`).join('');
  const card = (id) => {
    const T = TESTS[id], sides = sidesOf(id), has = log.some((r) => r.test === id);
    const stats = sides.map((s) => { const tr_ = trend(log, id, s); return tr_.n ? `${s ? `<div class="rom-side">${esc(sideName(s))}</div>` : ''}${statLine(tr_, T)}` : ''; }).join('');
    return `<div class="card rom-test"><div class="row between"><b>${esc(tr(T.name))}</b><span class="chip sm">${esc(`${t('rom_normal')} ${T.deficit ? '≈ 0' : T.normal.ref}${T.unit === '%' ? ' %' : '°'}`)}</span></div>
      ${has ? `${romChartSvg(id, log)}<div class="legend rom-legend">${sides.length > 1 ? `<span><i class="rom-key l"></i>${esc(t('sideLeft'))}</span><span><i class="rom-key r"></i>${esc(t('sideRight'))}</span>` : ''}<span><i class="rom-key band"></i>${esc(t('rom_normalBand'))}</span></div>${stats}` : `<p class="muted small" style="margin:8px 0">${esc(t('rom_noDataTest'))}</p>`}
      <div class="row wrap" style="margin-top:10px">${startBtns(id)}</div></div>`;
  };
  const others = TEST_IDS.filter((id) => !shown.includes(id));
  $app.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-rom-back aria-label="${esc(t('back'))}">${ui.icon('back', 20)}</button><h1>${esc(t('rom_histTitle'))}</h1></div>
    ${prof.romPlan ? `<div class="banner"><div><b>${esc(t('rom_yourPlan'))}</b><br><small>${esc(everyLabel(planEvery(prof.romPlan)))} · ${plan.length} ${esc(t('rom_measures'))}</small></div></div>` : ''}
    ${dueNow.length ? `<h2>${esc(t('rom_toDo'))}</h2><div class="list">${dueNow.map((d) => `<button class="toggle" data-rom-go="${romHash(d.test, d.side)}"><span><b>${esc(label(d.test, d.side))}</b><br><small class="muted">${esc(t(d.reason === 'baseline' ? 'rom_dueBaseline' : 'rom_dueAgain'))}</small></span>${RULER}</button>`).join('')}</div>` : ''}
    ${shown.length ? shown.map(card).join('') : `<div class="card muted" style="margin-top:12px">${esc(t('rom_noneYetPatient'))}</div>`}
    ${others.length ? `<h2>${esc(t('rom_moreTests'))}</h2>${others.map(card).join('')}` : ''}
    <p class="muted small" style="margin:14px 2px">${esc(t('rom_disclaimer'))}</p></section>${ui.nav('progress', state.data?.profile?.role === 'clinician' && state.data?.profile?.pathology ? 'patient' : state.data?.profile?.role)}`;
  $app.querySelector('[data-rom-back]').onclick = () => (history.length > 1 ? history.back() : go('#/progress'));
  bindHomeCardRom($app, go);
}

// =====================================================================================================================
// Mesure : #/rom/<test>/<côté>
// =====================================================================================================================
const FRAME_MAX = 960, HZ = 20, RING = 276.5, PLACE_MAX_MS = 25000, TRIALS = 3;

/** viewRom($app, testId, side, cleanup?) — side : 'L' | 'R' | '-' (test sans côté). `cleanup` : tableau de fonctions appelées à la sortie (optionnel : l'écran se ferme aussi tout seul quand il quitte le DOM). */
export async function viewRom($app, testId, side, cleanup) {
  const T = getTest(testId);
  if (!T) return go('#/amplitude');
  const sd = T.sided ? (side === 'R' ? 'R' : 'L') : null;
  const ui = await import('./ui.js');
  if (!location.hash.startsWith('#/rom/')) return; // l'utilisateur est déjà parti
  const { icon, toast } = ui;
  const prof = profile() || {};
  const S = { stage: 'intro', stream: null, raf: 0, active: false, facing: store.settings().camera, mirror: true, trials: [], det: null, tilt: null, place: null, luma: null, lumaT: 0, handPrev: null, cur: null, hand: false, closed: false, saved: false };
  const root = document.createElement('div');
  root.className = 'train rom';
  root.innerHTML = `<div class="stage"><video playsinline muted hidden poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><canvas class="overlay"></canvas>
    <div class="hud-top"><button class="icon-btn" data-r="close" aria-label="${esc(t('close'))}">${icon('close', 20)}</button><div class="hud-title"><b>${esc(tr(T.name))}</b><small>${esc(sd ? sideName(sd) + ' · ' : '')}${esc(t(T.view === 'side' ? 'rom_viewSide' : 'rom_viewFront'))}</small></div>
      <div class="hud-btns"><button class="icon-btn" data-r="flip" aria-label="${esc(t('camSwitch'))}">${icon('flip', 20)}</button></div></div>
    <div class="counter rom-live" hidden><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.18)" stroke-width="5" fill="none"/><circle id="rring" cx="50" cy="50" r="44" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><div class="val"><div><b id="rdeg">–</b><small id="rlbl"></small></div></div></div>
    <div class="cue" hidden><span></span></div>
    <div class="place" hidden role="status" aria-live="polite"><div class="place-ico"></div><div class="place-txt"></div><div class="place-bar"><i></i></div><div class="place-btns"><button class="btn sm ghost" data-r="place-skip">${esc(t('pl_skip'))}</button></div></div>
    <div class="center-msg" hidden></div>
    <div class="setup"></div></div>
    <div class="bottom"><button class="btn ghost" data-r="manual">${esc(t('rom_manual'))}</button><button class="btn" data-r="finish" hidden>${esc(t('rom_finish'))}</button></div>`;
  document.body.appendChild(root);
  $app.innerHTML = '';
  const $ = (s) => root.querySelector(s);
  const video = $('video'), canvas = $('canvas.overlay'), g = canvas.getContext('2d');
  const frame = document.createElement('canvas'), fctx = frame.getContext('2d', { alpha: false }), lumaCv = document.createElement('canvas');
  const V = { W: 0, H: 0, fw: 0, fh: 0 };
  const smooth = new LandmarkSmoother(), hsmooth = new LandmarkSmoother(), guard = new SubjectGuard();
  let lmk = null, wake = null;

  // ----- fermeture (caméra arrêtée, écouteurs retirés) -----
  function close() {
    if (S.closed) return; S.closed = true; S.active = false;
    cancelAnimationFrame(S.raf); clearTimeout(S.place?.timer);
    try { if (S.onOri) window.removeEventListener('deviceorientation', S.onOri); } catch (_) {}
    try { document.removeEventListener('visibilitychange', onVis); } catch (_) {}
    try { wake && wake.release(); } catch (_) {}
    if (S.stream) S.stream.getTracks().forEach((tk) => tk.stop());
    S.stream = null; try { video.srcObject = null; } catch (_) {}
    root.remove();
  }
  const leave = () => { close(); if (history.length > 1) history.back(); else go('#/amplitude'); };
  if (Array.isArray(cleanup)) cleanup.push(close);
  const onVis = () => { if (document.visibilityState === 'visible') keepAwake(); };
  document.addEventListener('visibilitychange', onVis);
  async function keepAwake() { try { if (navigator.wakeLock && document.visibilityState === 'visible' && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (_) {} }

  // ----- affichage -----
  const showCue = (txt, kind = '') => { const c = $('.cue'); c.hidden = !txt; const s = c.querySelector('span'); s.textContent = txt || ''; s.className = kind; };
  const center = (html) => { const c = $('.center-msg'); c.innerHTML = html || ''; c.hidden = !html; };
  const setup = (html) => { const s = $('.setup'); s.innerHTML = html || ''; s.hidden = !html; };
  function sizeCanvas() { const { W, H } = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1); if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; } V.W = W; V.H = H; }
  function grab() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;
    const k = Math.min(1, FRAME_MAX / Math.max(vw, vh)), fw = Math.round(vw * k), fh = Math.round(vh * k);
    if (frame.width !== fw || frame.height !== fh) { frame.width = fw; frame.height = fh; }
    fctx.drawImage(video, 0, 0, fw, fh); V.fw = fw; V.fh = fh; return true;
  }
  function paintFrame() {
    sizeCanvas(); const { W, H } = V;
    g.setTransform(1, 0, 0, 1, 0, 0); g.setLineDash([]); g.clearRect(0, 0, W, H);
    if (store.settings().selfView === false || !V.fw) return;
    const r = fitRect(V.fw, V.fh, W, H, 'cover');
    g.save(); if (S.mirror) { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(frame, r.ox, r.oy, r.w, r.h); g.restore();
  }
  const project = (lm) => projectLandmarks(lm, V.fw, V.fh, V.W, V.H, 'cover');
  const toScreen = (p) => { const q = projectLandmarks([{ x: p.x / V.fw, y: p.y / V.fh }], V.fw, V.fh, V.W, V.H, 'cover')[0]; return { x: (S.mirror ? 1 - q.x : q.x) * V.W, y: q.y * V.H }; };
  function drawArc(d, deg) {
    if (!d) return;
    const c = toScreen(d.c), a = toScreen(d.a), b = toScreen(d.b), k = Math.max(1, V.W / 400), rad = Math.min(V.W, V.H) * 0.11;
    const a1 = Math.atan2(a.y - c.y, a.x - c.x), a2 = Math.atan2(b.y - c.y, b.x - c.x);
    let df = a2 - a1; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.lineCap = 'round';
    g.setLineDash([8 * k, 8 * k]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2.5 * k; g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(a.x, a.y); g.stroke();
    g.setLineDash([]); g.strokeStyle = '#ffb020'; g.lineWidth = 4 * k; g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(b.x, b.y); g.stroke();
    g.beginPath(); g.arc(c.x, c.y, rad, a1, a1 + df, df < 0); g.stroke();
    const am = a1 + df / 2; g.fillStyle = '#fff'; g.font = `700 ${Math.round(16 * k)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4 * k; const tx = c.x + Math.cos(am) * (rad + 22 * k), ty = c.y + Math.sin(am) * (rad + 22 * k), txt = fmtVal(deg, T);
    g.strokeText(txt, tx, ty); g.fillText(txt, tx, ty); g.restore();
  }
  function drawGuide(ok) {
    const r = guideRect('body', T.view, T.scope), k = Math.max(1, V.W / 400), X = r.x * V.W, Y = r.y * V.H, w = r.w * V.W, h = r.h * V.H;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.lineWidth = 3 * k; g.setLineDash([10 * k, 8 * k]); g.strokeStyle = ok ? '#3ccf7b' : '#ffb020';
    g.beginPath(); if (g.roundRect) g.roundRect(X, Y, w, h, Math.min(w, h) * 0.12); else g.rect(X, Y, w, h); g.stroke(); g.restore();
  }
  function sampleLuma(box) {
    try {
      if (!V.fw) return null;
      const w = 64, h = Math.max(8, Math.round((V.fh / V.fw) * 64)); lumaCv.width = w; lumaCv.height = h;
      const c = lumaCv.getContext('2d', { willReadFrequently: true }); c.drawImage(frame, 0, 0, w, h);
      const d = c.getImageData(0, 0, w, h).data, b = box ? { x0: Math.max(0, box.x0 - 0.04), x1: Math.min(1, box.x1 + 0.04), y0: Math.max(0, box.y0 - 0.04), y1: Math.min(1, box.y1 + 0.04) } : { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 };
      let sa = 0, na = 0, sc = 0, nc = 0, se = 0, ne = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], u = (x + 0.5) / w, v = (y + 0.5) / h;
        sa += l; na++;
        if (u >= b.x0 && u <= b.x1 && v >= b.y0 && v <= b.y1) { sc += l; nc++; } else if (u < 0.15 || u > 0.85 || v < 0.15 || v > 0.85) { se += l; ne++; }
      }
      const m = sa / na; return { mean: m, center: nc ? sc / nc : m, edges: ne ? se / ne : m };
    } catch (_) { return null; }
  }

  // ----- caméra -----
  async function openCam() {
    S.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: S.facing, width: { ideal: 960 }, height: { ideal: 720 } } });
    video.srcObject = S.stream; await video.play(); video.hidden = false;
    let fm = null; try { fm = S.stream.getVideoTracks()[0]?.getSettings?.().facingMode || null; } catch (_) {}
    S.mirror = (fm === 'user' || fm === 'environment' ? fm : S.facing) === 'user';
    video.classList.toggle('mirror', S.mirror); video.classList.toggle('off', store.settings().selfView === false);
    smooth.reset(); hsmooth.reset(); guard.reset();
  }
  function stopCam() { if (S.stream) S.stream.getTracks().forEach((tk) => tk.stop()); S.stream = null; video.srcObject = null; video.hidden = true; V.fw = 0; g.clearRect(0, 0, canvas.width, canvas.height); }
  $('[data-r="flip"]').onclick = async () => { S.facing = S.facing === 'user' ? 'environment' : 'user'; store.saveSettings({ camera: S.facing }); if (S.stream) { stopCam(); try { await openCam(); } catch (e) { toast(t('mirrorErr'), 4000); } } };
  $('[data-r="close"]').onclick = leave;

  // ----- écran d'introduction -----
  const last = () => trend(prof.romLog, T.id, sd);
  function introHtml() {
    const tr_ = last();
    return `<div class="rom-intro"><div class="row between" style="align-items:flex-start;gap:12px"><div><h2 style="margin:0 0 4px">${esc(tr(T.name))}</h2><div class="row wrap" style="gap:6px">${sd ? `<span class="chip">${esc(sideName(sd))}</span>` : ''}<span class="chip">${esc(t(T.view === 'side' ? 'rom_viewSide' : 'rom_viewFront'))}</span>${T.lowConfidence ? `<span class="chip neg">${esc(t('rom_lowConfTag'))}</span>` : ''}</div></div>${schematic(T)}</div>
      <ol class="rom-steps"><li><b>${esc(t('rom_stepCam'))}</b> ${esc(tr(T.cam))}</li><li><b>${esc(t('rom_stepPos'))}</b> ${esc(tr(T.pos))}</li><li><b>${esc(t('rom_stepMove'))}</b> ${esc(tr(T.how))}</li></ol>
      <p class="muted small" style="margin:6px 0">${esc(t('rom_trialsInfo', { n: TRIALS }))}${tr_.n ? ' · ' + esc(t('rom_lastWas')) + ' ' + fmtVal(tr_.last, T) + ' (' + esc(dateS(tr_.lastTs)) + ')' : ''}</p>
      <details class="rom-more"><summary>${esc(t('rom_limits'))}</summary><p class="small">${esc(tr(T.note))}</p><p class="small muted">${esc(t('rom_normal'))} : ${esc(T.normal.src)}</p></details>
      <button class="btn" data-r="go">${icon('cam', 18)} ${esc(t('rom_startCam'))}</button></div>`;
  }
  function showIntro() { S.stage = 'intro'; $('.counter').hidden = true; $('[data-r="finish"]').hidden = true; $('[data-r="manual"]').hidden = false; showCue(''); setup(introHtml()); $('[data-r="go"]').onclick = startCamera; }

  async function startCamera() {
    setup(''); center(`<div><div class="spinner"></div>${esc(t('loadingModel'))}</div>`);
    try {
      if (!S.stream) await openCam();
      lmk = await loadPose();
      if (T.needsHand) { try { await loadHands(); S.hand = true; } catch (e) { console.warn('hands', e); S.hand = false; } }
    } catch (e) {
      console.error(e); center(''); stopCam();
      toast(e && e.name === 'NotAllowedError' ? t('camDenied') : t('modelErr'), 4500);
      return showIntro();
    }
    center(''); keepAwake(); startPlacement(); S.active = true; S.pace = new Pacer(HZ); S.raf = requestAnimationFrame(loop);
  }

  // ----- placement -----
  function startPlacement() {
    S.stage = 'place'; setup(''); $('.counter').hidden = true; S.luma = null; S.lumaT = 0;
    S.place = { gate: new PlacementGate(), t0: performance.now(), shown: null, timer: null };
    try { if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function' && !S.onOri) { S.onOri = (e) => { if (e.beta != null && e.gamma != null) S.tilt = { beta: e.beta, gamma: e.gamma }; }; window.addEventListener('deviceorientation', S.onOri); } } catch (_) {}
    S.place.timer = setTimeout(() => { if (S.stage === 'place') { toast(t('pl_timeout'), 3500); endPlacement(false); } }, PLACE_MAX_MS);
    renderPlace(null, 'wait');
  }
  function renderPlace(issue, kind) {
    const box = $('.place'), key = issue ? issue.key : null, txt = kind === 'ok' ? t('pl_perfect') : key ? (t('pl_' + key) !== 'pl_' + key ? t('pl_' + key) : key) : t('pl_checking');
    box.hidden = false; box.dataset.state = kind;
    const sig = key + kind; if (S.place && S.place.shown !== sig) { S.place.shown = sig; $('.place-ico').innerHTML = ICON_SVG[kind === 'ok' ? 'ok' : key ? issueIcon(issue) : 'eye']; $('.place-txt').textContent = txt; }
  }
  function endPlacement(ok) {
    clearTimeout(S.place?.timer); if (S.stage !== 'place') return;
    if (ok) { renderPlace(null, 'ok'); setTimeout(() => { $('.place').hidden = true; }, 900); } else $('.place').hidden = true;
    beginTrial();
  }
  $('[data-r="place-skip"]').onclick = () => endPlacement(false);
  function placeStep(now, lm, hand) {
    const P = S.place;
    if (now - S.lumaT > 300) { S.lumaT = now; S.luma = sampleLuma(lm ? subjectBox(lm, T.scope) : null); }
    const a = assessPlacement({ kind: 'body', plane: T.view, side: sd, scope: T.scope, lm, frameW: V.fw, frameH: V.fh, mirror: S.mirror, luma: S.luma, tilt: S.tilt });
    if (T.needsHand && S.hand && lm && !hand) { a.ok = false; a.issues = [...a.issues, { key: 'noHand' }]; }
    const r = P.gate.push(a, now);
    drawGuide(a.ok); $('.place-bar i').style.width = `${Math.round(r.progress * 100)}%`;
    if (r.stable) return endPlacement(true);
    renderPlace(r.issue, r.issue ? 'bad' : 'wait');
  }

  // ----- essais -----
  function beginTrial() {
    S.stage = 'measure'; S.cur = null;
    S.det = new HoldDetector({ dir: T.dir, minTravel: T.minTravel, tol: 3, holdMs: 1500 });
    $('.counter').hidden = false; $('[data-r="finish"]').hidden = !S.trials.length; $('[data-r="manual"]').hidden = true;
    $('#rlbl').textContent = t('rom_trialN', { n: S.trials.length + 1, m: TRIALS });
    showCue(t(S.trials.length ? 'rom_nextTrial' : 'rom_goMax'), '');
  }
  function onFired(res) {
    const conf = confidence({ vis: res.vis, ratio: res.ratio, view: T.view, sd: res.sd, maxConf: T.maxConf, q: res.q });
    S.trials.push({ deg: r1(res.deg), conf, sd: r1(res.sd), peak: r1(res.peak) });
    try { if (store.settings().vibrate !== false) navigator.vibrate?.(conf >= CONF_MIN ? 40 : [30, 50, 30]); } catch (_) {}
    showCue(conf >= CONF_MIN ? `${fmtVal(res.deg, T)} ✓` : t('rom_lowTrial'), conf >= CONF_MIN ? 'good' : 'bad');
    $('[data-r="finish"]').hidden = false;
    setTimeout(() => showCue(S.stage === 'measure' ? t('rom_returnRest') : ''), 1400);
    if (S.trials.length >= TRIALS) setTimeout(() => { if (S.stage === 'measure') showResult(); }, 900);
    else $('#rlbl').textContent = t('rom_trialN', { n: S.trials.length + 1, m: TRIALS });
  }
  $('[data-r="finish"]').onclick = () => { if (S.stage === 'measure') showResult(); };

  // ----- boucle d'analyse -----
  function loop() {
    if (!S.active || S.closed) return;
    if (!root.isConnected) return close();
    S.raf = requestAnimationFrame(loop);
    if (S.stage === 'result') return;
    const now = performance.now();
    if (!S.pace.due(now) || !grab()) return;
    let lm = null, world = null, hand = null;
    try {
      const res = lmk.detectForVideo(frame, now);
      lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null; world = res && res.worldLandmarks && res.worldLandmarks[0] ? res.worldLandmarks[0] : null;
      if (T.needsHand && S.hand) hand = pickHand(detectHands(frame, now), sd, S.handPrev); S.handPrev = hand;
    } catch (e) { console.warn('detect', e); }
    S.pace.done(now, performance.now());
    const gd = guard.check(lm, now, V.fw / V.fh); lm = gd.lm;
    paintFrame();
    if (lm) drawSkeleton(g, project(smooth.apply(lm, now)), V.W, V.H, new Set(), S.mirror, true); else smooth.reset();
    if (hand) drawHand(g, project(hsmooth.apply(hand.lm, now)), V.W, V.H, S.mirror, { keep: true }); else hsmooth.reset();
    if (S.stage === 'place') return placeStep(now, lm, hand);
    if (S.stage !== 'measure' || gd.jumped) return;
    const f = lm ? { lm, w: V.fw, h: V.fh, world, hand: hand ? { lm: hand.lm, world: hand.world } : null } : null;
    const r = f ? measure(T.id, f, sd) : null;
    if (!r) { S.det.push({ t: now, deg: NaN, vis: 0 }); $('#rdeg').textContent = '–'; return; }
    const st = S.det.push({ t: now, deg: r.deg, vis: r.vis, ratio: planeRatio(lm, V.fw, V.fh), q: r.q ?? 1 });
    S.cur = r.deg; drawArc(r.draw, r.deg);
    $('#rdeg').textContent = String(Math.round(r.deg));
    $('#rring').style.strokeDashoffset = RING * (1 - (st.progress || 0));
    if (st.state === 'fired') onFired(st.result);
  }

  // ----- résultat -----
  function showResult() {
    S.stage = 'result'; $('.counter').hidden = true; $('.place').hidden = true; showCue(''); $('[data-r="finish"]').hidden = true; $('[data-r="manual"]').hidden = true; g.clearRect(0, 0, canvas.width, canvas.height);
    const best = bestTrial(S.trials, { dir: T.dir }), prev = trend(prof.romLog, T.id, sd);
    const list = S.trials.map((x, i) => `<li class="${best === x ? 'best' : ''}">${i + 1}. <b>${fmtVal(x.deg, T)}</b> <small class="muted">· ${esc(t('rom_conf_' + confLabel(x.conf)))} (${Math.round(x.conf * 100)} %)</small></li>`).join('');
    if (!best) {
      setup(`<div class="rom-res"><h2 style="margin:0 0 6px">${esc(t('rom_unreliable'))}</h2><p class="muted small">${esc(t('rom_unreliableD'))}</p><ul class="rom-trials">${list}</ul>
        <div class="row wrap" style="margin-top:12px"><button class="btn grow" data-r="redo">${esc(t('rom_redo'))}</button><button class="btn ghost grow" data-r="man2">${esc(t('rom_manual'))}</button></div></div>`);
      $('[data-r="redo"]').onclick = redo; $('[data-r="man2"]').onclick = showManual; return;
    }
    const dir = T.dir || 1, vsBase = prev.baseline != null ? r1(dir * (best.deg - prev.baseline)) : null, vsPrev = prev.last != null ? r1(dir * (best.deg - prev.last)) : null;
    const pct = !T.deficit && T.normal.ref > 0 ? Math.round((best.deg / T.normal.ref) * 100) : null;
    const opp = sd ? seriesOf(prof.romLog, T.id, sd === 'L' ? 'R' : 'L') : [], oppLast = opp.length ? opp[opp.length - 1].deg : null;
    setup(`<div class="rom-res"><small class="muted">${esc(tr(T.name))}${sd ? ' · ' + esc(sideName(sd)) : ''}</small>
      <div class="rom-big">${fmtVal(best.deg, T)}</div><div class="row wrap" style="gap:6px"><span class="chip ${best.conf >= 0.75 ? 'pos' : ''}">${esc(t('rom_confidence'))} ${esc(t('rom_conf_' + confLabel(best.conf)))} (${Math.round(best.conf * 100)} %)</span>${T.lowConfidence ? `<span class="chip neg">${esc(t('rom_lowConfTag'))}</span>` : ''}</div>
      <div class="rom-stats"><div><small>${esc(t('rom_normal'))}</small><b>${T.deficit ? '≈ 0' : T.normal.ref}${T.unit === '%' ? ' %' : '°'}</b></div>${pct != null ? `<div><small>${esc(t('rom_pctNormal'))}</small><b>${pct} %</b></div>` : ''}<div><small>${esc(t('rom_previous'))}</small><b>${fmtVal(prev.last, T)}</b></div><div><small>${esc(t('rom_baseline'))}</small><b>${fmtVal(prev.baseline, T)}</b></div>
        <div><small>${esc(t('rom_vsBaseline'))}</small><b class="${vsBase > 0 ? 'rom-up' : vsBase < 0 ? 'rom-down' : ''}">${fmtGain(vsBase, T)}</b></div>${vsPrev != null ? `<div><small>${esc(t('rom_vsPrevious'))}</small><b class="${vsPrev > 0 ? 'rom-up' : vsPrev < 0 ? 'rom-down' : ''}">${fmtGain(vsPrev, T)}</b></div>` : ''}${oppLast != null ? `<div><small>${esc(t('rom_otherSide'))}</small><b>${fmtVal(oppLast, T)}</b></div>` : ''}</div>
      <ul class="rom-trials">${list}</ul>
      <div class="row wrap" style="margin-top:10px"><button class="btn grow" data-r="save">${icon('check', 18)} ${esc(t('rom_save'))}</button></div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm ghost grow" data-r="redo">${esc(t('rom_redo'))}</button><button class="btn sm ghost grow" data-r="man2">${esc(t('rom_manual'))}</button></div></div>`);
    $('[data-r="save"]').onclick = () => save({ deg: best.deg, conf: best.conf, method: 'camera' });
    $('[data-r="redo"]').onclick = redo; $('[data-r="man2"]').onclick = showManual;
  }
  function redo() { S.trials = []; setup(''); if (S.stream && lmk) { S.active = true; beginTrial(); } else showIntro(); }

  // ----- saisie manuelle (goniomètre du clinicien) -----
  function showManual() {
    S.stage = 'manual'; $('.counter').hidden = true; $('.place').hidden = true; showCue(''); $('[data-r="finish"]').hidden = true; $('[data-r="manual"]').hidden = true; center('');
    setup(`<div class="rom-res"><h2 style="margin:0 0 6px">${esc(t('rom_manualTitle'))}</h2><p class="muted small">${esc(t('rom_manualD'))}</p>
      <label class="field"><span>${esc(tr(T.name))}${sd ? ' · ' + esc(sideName(sd)) : ''} (${T.unit === '%' ? '%' : '°'})</span><input class="input" id="mval" type="number" inputmode="decimal" min="-30" max="200" step="1" autofocus></label>
      <div class="row wrap"><button class="btn grow" data-r="msave">${esc(t('rom_save'))}</button><button class="btn ghost grow" data-r="mback">${esc(t('back'))}</button></div></div>`);
    $('[data-r="msave"]').onclick = () => { const v = parseFloat($('#mval').value); if (!Number.isFinite(v) || v < -30 || v > 200) return toast(t('rom_badValue')); save({ deg: r1(v), conf: 1, method: 'manual' }); };
    $('[data-r="mback"]').onclick = () => { if (S.trials.length) showResult(); else showIntro(); };
  }
  $('[data-r="manual"]').onclick = showManual;

  async function save(m) {
    if (S.saved) return; S.saved = true;
    const entry = { test: T.id, side: sd, ts: Date.now(), deg: m.deg, conf: m.conf, method: m.method };
    try { await updateProfile({ romLog: [...(profile()?.romLog || []), entry] }); try { syncProgress(); } catch (_) {} toast(t('rom_saved')); } catch (e) { console.error(e); S.saved = false; return toast(t('rom_saveErr')); }
    close(); go('#/amplitude');
  }

  showIntro();
}
