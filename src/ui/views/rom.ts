// Mesure d'amplitude articulaire par caméra (goniométrie 2D / 3D) : flux de mesure (#/rom/<test>/<côté>), historique
// (#/amplitude) et crochets pour l'accueil, l'éditeur de programme et la fiche patient (reprise de www/js/rom.js, v1.15).
// La logique pure (plan, tendance, détecteur de maintien, position de départ) est dans domains/outcomes/rom.ts.
// Le catalogue et les calculs d'angle sont dans data/romtests.js. La vidéo ne quitte jamais le téléphone.
//
// Précision : voir la `note` de chaque test. Ordre de grandeur : ± 5° (coude, genou), ± 8–10° (hanche, poignet), ± 10–15° (rotation externe
// d'épaule, rotation cervicale). Ce n'est pas un goniomètre : sert à suivre l'évolution d'un même patient, avec la même installation.
import { t, tp, locale, aiLangInfo } from '../../../www/js/i18n.js';
import { tr } from '../components/l10n.ts';
import { measure, planeRatio, jointIdx } from '../../../www/js/data/romtests.js';
import type * as Coach from '../../../www/js/coach.js';
import * as store from '../../../www/js/store.js';
import { loadPose, drawSkeleton } from '../../../www/js/pose.js';
import { loadHands, detectHands, pickHand, drawHand } from '../../../www/js/hand.js';
import {
  canvasSize,
  fitRect,
  projectLandmarks,
  LandmarkSmoother,
  SubjectGuard,
  Pacer,
} from '../../../www/js/overlay.js';
import {
  assessPlacement,
  PlacementGate,
  guideRect,
  subjectBox,
  issueIcon,
  ICON_SVG,
} from '../../../www/js/placement.js';
import {
  type RomDue,
  type RomLogRow,
  type RomSummaryRow,
  type RomTestInfo,
  type RomTrend,
  type StartCheck,
  type StartSample,
  EVERY_OPTIONS,
  HoldDetector,
  StartGate,
  TEST_IDS,
  Voicer,
  bestTrial,
  checkStart,
  confLabel,
  confidence,
  CONF_MIN,
  dueForProfile,
  fmtGain,
  fmtVal,
  goInstr,
  itemKey,
  orientation,
  orientText,
  planEvery,
  planItems,
  romHash,
  sampleOf,
  seriesOf,
  sideBig,
  sidesOfTest,
  startCue,
  startInstr,
  suggestFor,
  testInfo,
  trend,
} from '../../domains/outcomes/rom.ts';
import { state, go, profile, updateProfile, syncProgress } from '../app-state.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { nav } from '../components/nav.ts';
import { type Host, hostOf, isNil, roundTo } from '../util.ts';

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const r1 = (x: number): number => roundTo(x, 1);
const RULER =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg>';

// ---------- Formats ----------
const dateS = (ts: number): string => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const testName = (id: string): string => {
  const T = testInfo(id);
  return T ? tr(T.name) : id;
};
const sideName = (s: string | null | undefined): string =>
  s === 'L' ? t('sideLeft') : s === 'R' ? t('sideRight') : '';
const label = (test: string, side: string | null | undefined): string =>
  `${testName(test)}${side ? ' · ' + sideName(side) : ''}`;
const everyLabel = (n: number): string =>
  n === 1 ? t('rom_every1') : n ? t('rom_everyN', { n }) : t('rom_baselineOnly');
const sign = (x: number | null | undefined, cls = ''): string =>
  x !== null && x !== undefined && x > 0 ? 'rom-up' : x !== null && x !== undefined && x < 0 ? 'rom-down' : cls;

// ---------- Graphiques (SVG en ligne) ----------
/** Courbe d'un test, les deux côtés (G : trait plein + cercles ; D : pointillés + carrés), bande de normalité. */
export function romChartSvg(
  testId: string,
  log: readonly RomLogRow[] | null | undefined,
  { w = 320, h = 160 }: { w?: number; h?: number } = {},
): string {
  const T = testInfo(testId);
  if (!T) return '';
  const sides = sidesOfTest(testId);
  const ser = sides.map((s) => ({ s, rows: seriesOf(log, testId, s) })).filter((x) => x.rows.length);
  if (!ser.length) return '';
  const all = ser.flatMap((x) => x.rows);
  const t0 = Math.min(...all.map((r) => r.ts));
  const t1 = Math.max(...all.map((r) => r.ts));
  const maxD = Math.max(...all.map((r) => r.deg), T.normal.hi ?? 0, T.normal.ref);
  const yMax = Math.max(10, Math.ceil((maxD * 1.08) / 10) * 10);
  const minD = Math.min(0, ...all.map((r) => r.deg));
  const yMin = minD < 0 ? Math.floor(minD / 10) * 10 : 0;
  const L = 34;
  const R = 10;
  const Tp = 10;
  const B = 24;
  const iw = w - L - R;
  const ih = h - Tp - B;
  const X = (ts: number): number => (t1 === t0 ? L + iw / 2 : L + ((ts - t0) / (t1 - t0)) * iw);
  const Y = (v: number): number => Tp + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const lo = T.normal.lo;
  const band =
    lo !== undefined
      ? `<rect x="${L}" y="${Y(Math.max(T.normal.hi ?? yMax, lo))}" width="${iw}" height="${Math.max(2, Y(lo) - Y(Math.max(T.normal.hi ?? yMax, lo)))}" class="rom-band"/>`
      : '';
  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax]
    .map(
      (v) =>
        `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="rom-grid"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" class="rom-tx">${Math.round(v)}</text>`,
    )
    .join('');
  const lines = ser
    .map(({ s, rows }) => {
      const cls = s === 'R' ? 'rom-r' : 'rom-l';
      const pts = rows.map((r) => `${X(r.ts).toFixed(1)},${Y(r.deg).toFixed(1)}`);
      const mk = rows
        .map((r) =>
          s === 'R'
            ? `<rect x="${(X(r.ts) - 3.5).toFixed(1)}" y="${(Y(r.deg) - 3.5).toFixed(1)}" width="7" height="7" class="${cls} rom-pt ${r.method === 'manual' ? 'man' : ''}"/>`
            : `<circle cx="${X(r.ts).toFixed(1)}" cy="${Y(r.deg).toFixed(1)}" r="4" class="${cls} rom-pt ${r.method === 'manual' ? 'man' : ''}"/>`,
        )
        .join('');
      return `<polyline points="${pts.join(' ')}" class="${cls} rom-ln" fill="none"/>${mk}`;
    })
    .join('');
  const alt = ser
    .map(({ s, rows }) => `${s ? sideName(s) + ': ' : ''}${rows.map((r) => Math.round(r.deg)).join(', ')}`)
    .join(' / ');
  return `<svg class="rom-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(testName(testId))} — ${esc(alt)}">${band}${ticks}${lines}<text x="${L}" y="${h - 6}" class="rom-tx">${esc(dateS(t0))}</text><text x="${w - R}" y="${h - 6}" text-anchor="end" class="rom-tx">${esc(dateS(t1))}</text></svg>`;
}
const spark = (pts: readonly (readonly [number, number])[] | null | undefined, w = 72, h = 24): string => {
  if (!pts || pts.length < 2) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const X = (v: number): number => 2 + ((v - x0) / (x1 - x0 || 1)) * (w - 4);
  const Y = (v: number): number => h - 3 - ((v - y0) / (y1 - y0 || 1)) * (h - 6);
  return `<svg class="rom-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/></svg>`;
};

// Schéma de la consigne : deux segments (un fixe, un mobile) et l'arc parcouru ; angles d'écran en degrés (0 = droite, 90 = bas)
function schematic(T: RomTestInfo): string {
  const s = T.sch || { fix: 90, from: 90, to: -90 };
  const c = { x: 60, y: 60 };
  const L = 40;
  const pt = (a: number, l = L): { x: number; y: number } => ({
    x: c.x + l * Math.cos((a * Math.PI) / 180),
    y: c.y + l * Math.sin((a * Math.PI) / 180),
  });
  const f = pt(s.fix);
  const a = pt(s.from);
  const b = pt(s.to);
  const r = 26;
  const A = pt(s.from, r);
  const B = pt(s.to, r);
  const sweep = (((s.to - s.from) % 360) + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  const arc = `M${A.x.toFixed(1)} ${A.y.toFixed(1)} A${r} ${r} 0 ${large} 1 ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
  const arc2 =
    sweep > 180 ? `M${A.x.toFixed(1)} ${A.y.toFixed(1)} A${r} ${r} 0 0 0 ${B.x.toFixed(1)} ${B.y.toFixed(1)}` : arc;
  return `<svg class="rom-sch" viewBox="0 0 120 120" role="img" aria-label="${esc(t('rom_schematic'))}"><line x1="${c.x}" y1="${c.y}" x2="${f.x.toFixed(1)}" y2="${f.y.toFixed(1)}" class="sch-fix"/><line x1="${c.x}" y1="${c.y}" x2="${a.x.toFixed(1)}" y2="${a.y.toFixed(1)}" class="sch-from"/><line x1="${c.x}" y1="${c.y}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="sch-to"/><path d="${arc2}" class="sch-arc" fill="none"/><circle cx="${c.x}" cy="${c.y}" r="4" class="sch-pv"/></svg>`;
}

// =====================================================================================================================
// Hooks : éditeur de programme (clinicien)
// =====================================================================================================================
export interface RomRx {
  rom?: unknown;
  pathology?: string | null | undefined;
  region?: string | null | undefined;
}
export interface RomSection {
  html: string;
  bind(root: ParentNode): void;
  /** → { rom: { tests: [{ test, side }], every } | null } */
  read(root: ParentNode): { rom: unknown };
}
export function rxSectionRom(rx?: RomRx | null): RomSection {
  const plan = rx && rx.rom ? planItems(rx.rom) : [];
  const every = rx && rx.rom ? planEvery(rx.rom) : 4;
  const on = new Set(plan.map((p) => itemKey(p.test, p.side)));
  const rows = TEST_IDS.map((id: string) => {
    const T = testInfo(id);
    if (!T) return '';
    const pills = sidesOfTest(id)
      .map(
        (s) =>
          `<button type="button" class="pill ${on.has(itemKey(id, s)) ? 'on' : ''}" data-rom-t="${id}" data-rom-s="${s || ''}" aria-pressed="${on.has(itemKey(id, s))}">${s ? esc(sideName(s)) : esc(t('rom_yes'))}</button>`,
      )
      .join('');
    return `<div class="toggle rom-row"><span><b>${esc(tr(T.name))}</b>${T.lowConfidence ? ` <small class="muted">· ${esc(t('rom_lowConfTag'))}</small>` : ''}${T.optional ? ` <small class="muted">· ${esc(t('rom_optional'))}</small>` : ''}</span><span class="row rom-pills">${pills}</span></div>`;
  }).join('');
  const html = `<h2>${esc(t('rom_secTitle'))}</h2><div class="card" data-rom-sec data-path="${esc(rx?.pathology || '')}" data-region="${esc(rx?.region || '')}">
    <p class="muted small" style="margin:0 0 10px">${esc(t('rom_secD'))}</p>
    <div class="row wrap" style="margin-bottom:10px"><button type="button" class="btn sm ghost" data-rom-sug>${RULER} ${esc(t('rom_suggest'))}</button><button type="button" class="btn sm ghost" data-rom-none>${esc(t('rom_none'))}</button></div>
    <div class="list">${rows}</div>
    <label class="field" style="margin-top:12px"><span>${esc(t('rom_freq'))}</span><select class="input" data-rom-every>${EVERY_OPTIONS.map((n) => `<option value="${n}" ${n === every ? 'selected' : ''}>${esc(everyLabel(n))}</option>`).join('')}</select></label>
    <small class="muted" style="display:block;margin-top:6px">${esc(t('rom_secNote'))}</small></div>`;
  const setOn = (root: ParentNode, items: readonly { test: string; side: string | null }[]): void => {
    const keys = new Set(items.map((p) => itemKey(p.test, p.side)));
    root.querySelectorAll<HTMLElement>('[data-rom-t]').forEach((b) => {
      const k = itemKey(b.dataset['romT'] ?? '', b.dataset['romS'] || null);
      const v = keys.has(k);
      b.classList.toggle('on', v);
      b.setAttribute('aria-pressed', String(v));
    });
  };
  return {
    html,
    bind(root) {
      const sec = root.querySelector<HTMLElement>('[data-rom-sec]');
      if (!sec) return;
      sec.querySelectorAll<HTMLElement>('[data-rom-t]').forEach((b) => {
        b.onclick = () => {
          const v = !b.classList.contains('on');
          b.classList.toggle('on', v);
          b.setAttribute('aria-pressed', String(v));
        };
      });
      const sug = sec.querySelector<HTMLElement>('[data-rom-sug]');
      const none = sec.querySelector<HTMLElement>('[data-rom-none]');
      if (sug)
        sug.onclick = () => {
          const items = suggestFor({ pathology: sec.dataset['path'] ?? '', region: sec.dataset['region'] ?? '' });
          setOn(sec, items.length ? items : suggestFor({ pathology: 'frozen' }));
        };
      if (none) none.onclick = () => setOn(sec, []);
    },
    read(root) {
      const sec = root.querySelector<HTMLElement>('[data-rom-sec]');
      if (!sec) return { rom: rx?.rom || null };
      const tests = [...sec.querySelectorAll<HTMLElement>('[data-rom-t].on')].map((b) => ({
        test: b.dataset['romT'] ?? '',
        side: b.dataset['romS'] || null,
      }));
      if (!tests.length) return { rom: null };
      const sel = sec.querySelector<HTMLSelectElement>('[data-rom-every]');
      return { rom: { tests, every: sel ? +sel.value || 0 : 4 } };
    },
  };
}

// =====================================================================================================================
// Hooks : accueil patient, fiche clinicien
// =====================================================================================================================
export function homeCardRom(prof: Parameters<typeof dueForProfile>[0], now: number = Date.now()): string {
  const items: RomDue[] = dueForProfile(prof, now);
  const it = items[0];
  if (!it) return '';
  const more = items.length - 1;
  return `<div class="card rom-card"><div class="row between" style="gap:12px"><div class="row" style="gap:12px;min-width:0"><span class="rom-ic">${RULER}</span><div style="min-width:0"><b>${esc(t('rom_cardTitle'))}</b><br><small class="muted">${esc(label(it.test, it.side))}${more > 0 ? ' · ' + esc(tp('rom_cardMore', more)) : ''}</small></div></div>
    <button class="btn sm" data-rom-go="${romHash(it.test, it.side)}">${esc(t('rom_start'))}</button></div></div>`;
}
export function bindHomeCardRom(root: ParentNode, goFn: (hash: string) => unknown = go): void {
  root.querySelectorAll<HTMLElement>('[data-rom-go]').forEach((b) => {
    b.onclick = () => {
      goFn(b.dataset['romGo'] ?? '');
    };
  });
}
/** Fiche patient (clinicien) : tableau départ → dernier, gain, % de la norme, écart entre côtés, mini-courbe. `part` = summaryPart(profil). */
export function clinicPanelRom(part: { rom?: readonly RomSummaryRow[] } | null | undefined): string {
  const rows = part && part.rom;
  if (!rows || !rows.length) return `<div class="card muted small">${esc(t('rom_noneYet'))}</div>`;
  const bySide: Record<string, RomSummaryRow | undefined> = {};
  for (const r of rows) bySide[itemKey(r.t, r.s)] = r;
  const body = rows
    .map((r) => {
      const T = testInfo(r.t);
      if (!T) return '';
      const pct = !T.deficit && T.normal.ref > 0 ? Math.round((r.l / T.normal.ref) * 100) : null;
      const o = r.s ? bySide[itemKey(r.t, r.s === 'L' ? 'R' : 'L')] : null;
      const diff = o ? r1(r.l - o.l) : null;
      return `<tr><td><b>${esc(testName(r.t))}</b>${r.s ? `<br><small class="muted">${esc(sideName(r.s))}</small>` : ''}</td><td class="tnum">${fmtVal(r.b, T)} → <b>${fmtVal(r.l, T)}</b>${r.m === 'manual' ? ` <small class="muted">(${esc(t('rom_manualShort'))})</small>` : ''}</td>
      <td class="tnum ${sign(r.g)}">${fmtGain(r.g, T)}</td><td class="tnum">${pct !== null ? pct + ' %' : '–'}${diff !== null ? `<br><small class="muted">${esc(t('rom_vsOther'))} ${fmtGain(diff, T)}</small>` : ''}</td><td>${spark(r.p)}</td></tr>`;
    })
    .join('');
  return `<div class="card rom-panel"><div class="rom-scroll"><table class="rom-table"><thead><tr><th>${esc(t('rom_test'))}</th><th>${esc(t('rom_baselineLast'))}</th><th>${esc(t('rom_gain'))}</th><th>${esc(t('rom_pctNormal'))}</th><th></th></tr></thead><tbody>${body}</tbody></table></div><small class="muted" style="display:block;margin-top:8px">${esc(t('rom_panelNote'))}</small></div>`;
}

// =====================================================================================================================
// Historique patient : #/amplitude
// =====================================================================================================================
function statLine(tr_: RomTrend, T: RomTestInfo): string {
  return `<div class="rom-stats"><div><small>${esc(t('rom_last'))}</small><b>${fmtVal(tr_.last, T)}</b></div><div><small>${esc(t('rom_baseline'))}</small><b>${fmtVal(tr_.baseline, T)}</b></div><div><small>${esc(t('rom_gain'))}</small><b class="${sign(tr_.gain)}">${fmtGain(tr_.gain, T)}</b></div>${tr_.pctNormal !== null ? `<div><small>${esc(t('rom_pctNormal'))}</small><b>${tr_.pctNormal} %</b></div>` : ''}</div>`;
}
/** Journal des mesures d'amplitude du profil. */
const romLogOf = (prof: { romLog?: unknown } | undefined): readonly RomLogRow[] =>
  (prof?.romLog as RomLogRow[] | undefined) || [];

export async function viewRomHistory($app: Host): Promise<void> {
  const root = hostOf($app);
  if (!/^#\/amplitude/.test(location.hash)) return;
  const prof = profile() || {};
  const log: readonly RomLogRow[] = romLogOf(prof);
  const plan = planItems(prof['romPlan']);
  const dueNow = dueForProfile({ ...prof, romPlan: prof['romPlan'] } as Parameters<typeof dueForProfile>[0]);
  const planTests = [...new Set(plan.map((p) => p.test))];
  const withData = TEST_IDS.filter((id: string) => log.some((r) => r.test === id));
  const shown = [...new Set([...planTests, ...withData])];
  const startBtns = (id: string): string =>
    sidesOfTest(id)
      .map(
        (s) =>
          `<button class="btn sm ghost" data-rom-go="${romHash(id, s)}">${RULER} ${esc(s ? sideName(s) : t('rom_measure'))}</button>`,
      )
      .join('');
  const card = (id: string): string => {
    const T = testInfo(id);
    if (!T) return '';
    const sides = sidesOfTest(id);
    const has = log.some((r) => r.test === id);
    const stats = sides
      .map((s) => {
        const tr_ = trend(log, id, s);
        return tr_.n ? `${s ? `<div class="rom-side">${esc(sideName(s))}</div>` : ''}${statLine(tr_, T)}` : '';
      })
      .join('');
    return `<div class="card rom-test"><div class="row between"><b>${esc(tr(T.name))}</b><span class="chip sm">${esc(`${t('rom_normal')} ${T.deficit ? '≈ 0' : T.normal.ref}${T.unit === '%' ? ' %' : '°'}`)}</span></div>
      ${has ? `${romChartSvg(id, log)}<div class="legend rom-legend">${sides.length > 1 ? `<span><i class="rom-key l"></i>${esc(t('sideLeft'))}</span><span><i class="rom-key r"></i>${esc(t('sideRight'))}</span>` : ''}<span><i class="rom-key band"></i>${esc(t('rom_normalBand'))}</span></div>${stats}` : `<p class="muted small" style="margin:8px 0">${esc(t('rom_noDataTest'))}</p>`}
      <div class="row wrap" style="margin-top:10px">${startBtns(id)}</div></div>`;
  };
  const others = TEST_IDS.filter((id: string) => !shown.includes(id));
  const role = state.data?.profile?.role;
  root.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-rom-back aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(t('rom_histTitle'))}</h1></div>
    ${prof['romPlan'] ? `<div class="banner"><div><b>${esc(t('rom_yourPlan'))}</b><br><small>${esc(everyLabel(planEvery(prof['romPlan'])))} · ${plan.length} ${esc(t('rom_measures'))}</small></div></div>` : ''}
    ${dueNow.length ? `<h2>${esc(t('rom_toDo'))}</h2><div class="list">${dueNow.map((d) => `<div class="toggle"><span><b>${esc(label(d.test, d.side))}</b><br><small class="muted">${esc(t(d.reason === 'baseline' ? 'rom_dueBaseline' : 'rom_dueAgain'))}</small></span><button class="btn sm" data-rom-go="${romHash(d.test, d.side)}">${esc(t('rom_start'))}</button></div>`).join('')}</div>` : ''}
    ${shown.length ? shown.map(card).join('') : `<div class="card muted" style="margin-top:12px">${esc(t('rom_noneYetPatient'))}</div>`}
    ${others.length ? `<h2>${esc(t('rom_moreTests'))}</h2>${others.map(card).join('')}` : ''}
    <p class="muted small" style="margin:14px 2px">${esc(t('rom_disclaimer'))}</p></section>${nav('progress', role === 'clinician' && state.data?.profile?.pathology ? 'patient' : role)}`;
  const back = root.querySelector<HTMLElement>('[data-rom-back]');
  if (back)
    back.onclick = () => {
      if (history.length > 1) history.back();
      else go('#/progress');
    };
  bindHomeCardRom(root, go);
}

// =====================================================================================================================
// Mesure : #/rom/<test>/<côté>
// =====================================================================================================================
const FRAME_MAX = 960;
const HZ = 20;
const RING = 276.5;
const PLACE_MAX_MS = 25000;
const START_MAX_MS = 45000;
const TRIALS = 3;
const spokenVal = (deg: number, T: RomTestInfo | null | undefined): string =>
  t(T && T.unit === '%' ? 'rom_pctSpoken' : 'rom_degSpoken', { n: Math.round(deg) });

interface Trial {
  deg: number;
  conf: number;
  sd: number;
  peak: number;
}
type Timer = ReturnType<typeof setTimeout> | undefined;
interface RomState {
  stage: string;
  stream: MediaStream | null;
  raf: number;
  active: boolean;
  facing: string;
  mirror: boolean;
  trials: Trial[];
  det: HoldDetector | null;
  tilt: { beta: number; gamma: number } | null;
  place: { gate: InstanceType<typeof PlacementGate>; t0: number; shown: string | null; timer: Timer } | null;
  luma: { mean: number; center: number; edges: number } | null;
  lumaT: number;
  handPrev: { lm: readonly LandmarkLike[]; world: unknown } | null;
  cur: number | null;
  hand: boolean;
  closed: boolean;
  camGen: number;
  saved: boolean;
  start: {
    gate: StartGate;
    t0: number;
    introSaid: boolean;
    aiN: number;
    aiBusy: boolean;
    last: unknown;
    lm: readonly LandmarkLike[] | null;
    shown: string | null;
    timer: Timer;
  } | null;
  cd: { a: boolean; b: boolean };
  onOri?: (e: DeviceOrientationEvent) => void;
  pace?: InstanceType<typeof Pacer>;
}
interface LandmarkLike {
  x: number;
  y: number;
  visibility?: number;
}
type CoachModule = typeof Coach;

/** viewRom($app, testId, side, cleanup?) — side : 'L' | 'R' | '-' (test sans côté). `cleanup` : tableau de fonctions appelées à la sortie (optionnel : l'écran se ferme aussi tout seul quand il quitte le DOM). */
export async function viewRom(
  $app: Host,
  testId: string,
  side?: string | null,
  cleanup?: (() => void)[],
): Promise<void> {
  const found = testInfo(testId);
  if (!found) {
    go('#/amplitude');
    return;
  }
  const T: RomTestInfo = found;
  const sd = T.sided ? (side === 'R' ? 'R' : 'L') : null;
  const host = hostOf($app);
  if (!location.hash.startsWith('#/rom/')) return; // l'utilisateur est déjà parti
  let coach: CoachModule | null = null;
  try {
    coach = await import('../../../www/js/coach.js');
  } catch {
    coach = null;
  }
  if (!location.hash.startsWith('#/rom/')) return;
  const prof = profile() || {};
  const S: RomState = {
    stage: 'intro',
    stream: null,
    raf: 0,
    active: false,
    facing: store.settings().camera,
    mirror: true,
    trials: [],
    det: null,
    tilt: null,
    place: null,
    luma: null,
    lumaT: 0,
    handPrev: null,
    cur: null,
    hand: false,
    closed: false,
    camGen: 0,
    saved: false,
    start: null,
    cd: { a: false, b: false },
  };
  const muted = store.settings().voice === 'off';
  const voicer = new Voicer({ muted });
  const say = (txt: string | null | undefined, o?: { interrupt?: boolean }): void => {
    try {
      if (coach && txt) coach.speak(txt, o);
    } catch {
      /* la voix est facultative */
    }
  };
  const big = sideBig(T, sd);
  const root = document.createElement('div');
  root.className = 'train rom';
  root.innerHTML = `<div class="stage"><video playsinline muted hidden poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><canvas class="overlay"></canvas>
    <div class="hud-top"><button class="icon-btn" data-r="close" aria-label="${esc(t('close'))}">${icon('close', 20)}</button><div class="hud-title"><b>${esc(tr(T.name))}</b><small>${esc(sd ? sideName(sd) + ' · ' : '')}${esc(t(T.view === 'side' ? 'rom_viewSide' : 'rom_viewFront'))}</small></div>
      <div class="hud-btns"><button class="icon-btn" data-r="flip" aria-label="${esc(t('camSwitch'))}">${icon('flip', 20)}</button></div></div>
    <div class="rom-sidebig" hidden></div>
    <div class="counter rom-live" hidden><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.18)" stroke-width="5" fill="none"/><circle id="rring" cx="50" cy="50" r="44" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><div class="val"><div><b id="rdeg">–</b><small id="rlbl"></small></div></div></div>
    <div class="cue" hidden><span></span></div>
    <div class="place" hidden role="status" aria-live="polite"><div class="place-ico"></div><div class="place-txt"></div><div class="place-bar"><i></i></div><div class="place-btns"><button class="btn sm ghost" data-r="place-skip">${esc(t('pl_skip'))}</button></div></div>
    <div class="place rstart" hidden role="status" aria-live="polite"><div class="place-ico"></div><div class="place-txt"></div><div class="rstart-chk"></div><div class="place-ai" hidden></div><div class="place-bar"><i></i></div><div class="place-btns"><button class="btn sm ghost" data-r="start-skip">${esc(t('rom_ready'))}</button></div></div>
    <div class="center-msg" hidden></div>
    <div class="setup"></div></div>
    <div class="bottom"><button class="btn ghost" data-r="manual">${esc(t('rom_manual'))}</button><button class="btn" data-r="finish" hidden>${esc(t('rom_finish'))}</button></div>`;
  document.body.appendChild(root);
  host.innerHTML = '';
  const $ = <E extends HTMLElement = HTMLElement>(s: string): E => root.querySelector<E>(s) as E;
  const video = $<HTMLVideoElement>('video');
  const canvas = $<HTMLCanvasElement>('canvas.overlay');
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const frame = document.createElement('canvas');
  const fctx = frame.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const lumaCv = document.createElement('canvas');
  const V = { W: 0, H: 0, fw: 0, fh: 0 };
  const smooth = new LandmarkSmoother();
  const hsmooth = new LandmarkSmoother();
  const guard = new SubjectGuard();
  let lmk: Awaited<ReturnType<typeof loadPose>> | null = null;
  let wake: WakeLockSentinel | null = null;

  // ----- fermeture (caméra arrêtée, écouteurs retirés) -----
  function close(): void {
    if (S.closed) return;
    S.closed = true;
    S.active = false;
    S.camGen++;
    cancelAnimationFrame(S.raf);
    clearTimeout(S.place?.timer);
    clearTimeout(S.start?.timer);
    try {
      if (S.onOri) window.removeEventListener('deviceorientation', S.onOri);
    } catch {
      /* déjà retiré */
    }
    try {
      document.removeEventListener('visibilitychange', onVis);
    } catch {
      /* déjà retiré */
    }
    try {
      if (wake) void wake.release();
    } catch {
      /* déjà relâché */
    }
    if (S.stream) S.stream.getTracks().forEach((tk) => tk.stop());
    S.stream = null;
    try {
      video.srcObject = null;
    } catch {
      /* élément détaché */
    }
    root.remove();
  }
  const leave = (): void => {
    close();
    if (history.length > 1) history.back();
    else go('#/amplitude');
  };
  if (Array.isArray(cleanup)) cleanup.push(close);
  const onVis = (): void => {
    if (document.visibilityState === 'visible') void keepAwake();
  };
  document.addEventListener('visibilitychange', onVis);
  async function keepAwake(): Promise<void> {
    try {
      if (document.visibilityState === 'visible' && !wake) {
        const w = await navigator.wakeLock.request('screen');
        wake = w;
        w.addEventListener('release', () => {
          wake = null;
        });
      }
    } catch {
      /* écran de veille non disponible */
    }
  }

  // ----- affichage -----
  const showCue = (txt: string | null | undefined, kind = ''): void => {
    const c = $('.cue');
    c.hidden = !txt;
    const s = c.querySelector('span');
    if (!s) return;
    s.textContent = txt || '';
    s.className = kind;
  };
  const center = (html?: string): void => {
    const c = $('.center-msg');
    c.innerHTML = html || '';
    c.hidden = !html;
  };
  const setup = (html?: string): void => {
    const s = $('.setup');
    s.innerHTML = html || '';
    s.hidden = !html;
  };
  const orient = (): string => orientText(orientation(T, sd, S.mirror));
  /** Gros libellé du côté mesuré + orientation (complet) ou pastille (compact, pendant la mesure). */
  function paintSide(mode: string): void {
    const el = $('.rom-sidebig');
    const o = orient();
    if (!big && !(mode === 'full' && o)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = 'rom-sidebig' + (mode === 'compact' ? ' compact' : '') + (big ? '' : ' plain');
    el.style.setProperty('--sc', big ? big.color : '#fff');
    if (big) el.dataset['side'] = big.side;
    el.innerHTML =
      (big ? `<b>${esc(big.text)}</b>` : '') +
      (mode === 'compact' || mode === 'label' || !o ? '' : `<span>${esc(o)}</span>`);
  }
  function sizeCanvas(): void {
    const { W, H } = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    V.W = W;
    V.H = H;
  }
  function grab(): boolean {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;
    const k = Math.min(1, FRAME_MAX / Math.max(vw, vh));
    const fw = Math.round(vw * k);
    const fh = Math.round(vh * k);
    if (frame.width !== fw || frame.height !== fh) {
      frame.width = fw;
      frame.height = fh;
    }
    fctx.drawImage(video, 0, 0, fw, fh);
    V.fw = fw;
    V.fh = fh;
    return true;
  }
  function paintFrame(): void {
    sizeCanvas();
    const { W, H } = V;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setLineDash([]);
    g.clearRect(0, 0, W, H);
    if (store.settings().selfView === false || !V.fw) return;
    const r = fitRect(V.fw, V.fh, W, H, 'cover');
    g.save();
    if (S.mirror) {
      g.translate(W, 0);
      g.scale(-1, 1);
    }
    g.drawImage(frame, r.ox, r.oy, r.w, r.h);
    g.restore();
  }
  const project = (lm: readonly LandmarkLike[]): ReturnType<typeof projectLandmarks> =>
    projectLandmarks(lm, V.fw, V.fh, V.W, V.H, 'cover');
  const toScreen = (p: { x: number; y: number }): { x: number; y: number } => {
    const q = projectLandmarks([{ x: p.x / V.fw, y: p.y / V.fh }], V.fw, V.fh, V.W, V.H, 'cover')[0];
    return { x: (S.mirror ? 1 - (q?.x ?? 0) : (q?.x ?? 0)) * V.W, y: (q?.y ?? 0) * V.H };
  };
  interface ArcDraw {
    c: { x: number; y: number };
    a: { x: number; y: number };
    b: { x: number; y: number };
  }
  function drawArc(d: ArcDraw | null | undefined, deg: number): void {
    if (!d) return;
    const c = toScreen(d.c);
    const a = toScreen(d.a);
    const b = toScreen(d.b);
    const k = Math.max(1, V.W / 400);
    const rad = Math.min(V.W, V.H) * 0.11;
    const a1 = Math.atan2(a.y - c.y, a.x - c.x);
    const a2 = Math.atan2(b.y - c.y, b.x - c.x);
    let df = a2 - a1;
    while (df > Math.PI) df -= 2 * Math.PI;
    while (df < -Math.PI) df += 2 * Math.PI;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineCap = 'round';
    g.setLineDash([8 * k, 8 * k]);
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 2.5 * k;
    g.beginPath();
    g.moveTo(c.x, c.y);
    g.lineTo(a.x, a.y);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#ffb020';
    g.lineWidth = 4 * k;
    g.beginPath();
    g.moveTo(c.x, c.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.beginPath();
    g.arc(c.x, c.y, rad, a1, a1 + df, df < 0);
    g.stroke();
    const am = a1 + df / 2;
    g.fillStyle = '#fff';
    g.font = `700 ${Math.round(16 * k)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.lineWidth = 4 * k;
    const tx = c.x + Math.cos(am) * (rad + 22 * k);
    const ty = c.y + Math.sin(am) * (rad + 22 * k);
    const txt = fmtVal(deg, T);
    g.strokeText(txt, tx, ty);
    g.fillText(txt, tx, ty);
    g.restore();
  }
  function drawGuide(ok: boolean): void {
    const r = guideRect('body', T.view, T.scope);
    const k = Math.max(1, V.W / 400);
    const X = r.x * V.W;
    const Y = r.y * V.H;
    const w = r.w * V.W;
    const h = r.h * V.H;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineWidth = 3 * k;
    g.setLineDash([10 * k, 8 * k]);
    g.strokeStyle = ok ? '#3ccf7b' : '#ffb020';
    g.beginPath();
    if (typeof g.roundRect === 'function') g.roundRect(X, Y, w, h, Math.min(w, h) * 0.12);
    else g.rect(X, Y, w, h);
    g.stroke();
    g.restore();
  }
  interface Box {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }
  function sampleLuma(box: Box | null): { mean: number; center: number; edges: number } | null {
    try {
      if (!V.fw) return null;
      const w = 64;
      const h = Math.max(8, Math.round((V.fh / V.fw) * 64));
      lumaCv.width = w;
      lumaCv.height = h;
      const c = lumaCv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      c.drawImage(frame, 0, 0, w, h);
      const d = c.getImageData(0, 0, w, h).data;
      const b = box
        ? {
            x0: Math.max(0, box.x0 - 0.04),
            x1: Math.min(1, box.x1 + 0.04),
            y0: Math.max(0, box.y0 - 0.04),
            y1: Math.min(1, box.y1 + 0.04),
          }
        : { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 };
      let sa = 0;
      let na = 0;
      let sc = 0;
      let nc = 0;
      let se = 0;
      let ne = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const l = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
          const u = (x + 0.5) / w;
          const v = (y + 0.5) / h;
          sa += l;
          na++;
          if (u >= b.x0 && u <= b.x1 && v >= b.y0 && v <= b.y1) {
            sc += l;
            nc++;
          } else if (u < 0.15 || u > 0.85 || v < 0.15 || v > 0.85) {
            se += l;
            ne++;
          }
        }
      const m = sa / na;
      return { mean: m, center: nc ? sc / nc : m, edges: ne ? se / ne : m };
    } catch {
      return null;
    }
  }

  // ----- caméra -----
  // false : l'écran a été fermé (ou la caméra arrêtée) pendant l'ouverture → le flux est coupé tout de suite (jamais de caméra restée allumée)
  async function openCam(): Promise<boolean> {
    const gen = S.camGen;
    const dead = (): boolean => S.closed || gen !== S.camGen;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: S.facing, width: { ideal: 960 }, height: { ideal: 720 } },
    });
    if (dead()) {
      stream.getTracks().forEach((tk) => tk.stop());
      return false;
    }
    S.stream = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      if (dead()) {
        stream.getTracks().forEach((tk) => tk.stop());
        if (S.stream === stream) S.stream = null;
        return false;
      }
      throw e;
    }
    if (dead()) {
      stream.getTracks().forEach((tk) => tk.stop());
      if (S.stream === stream) S.stream = null;
      return false;
    }
    video.hidden = false;
    let fm: string | null;
    try {
      fm = S.stream.getVideoTracks()[0]?.getSettings?.().facingMode || null;
    } catch {
      fm = null;
    }
    S.mirror = (fm === 'user' || fm === 'environment' ? fm : S.facing) === 'user';
    video.classList.toggle('mirror', S.mirror);
    video.classList.toggle('off', store.settings().selfView === false);
    smooth.reset();
    hsmooth.reset();
    guard.reset();
    return true;
  }
  function stopCam(): void {
    S.camGen++;
    if (S.stream) S.stream.getTracks().forEach((tk) => tk.stop());
    S.stream = null;
    video.srcObject = null;
    video.hidden = true;
    V.fw = 0;
    g.clearRect(0, 0, canvas.width, canvas.height);
  }
  $('[data-r="flip"]').onclick = async () => {
    S.facing = S.facing === 'user' ? 'environment' : 'user';
    store.saveSettings({ camera: S.facing });
    if (S.stream) {
      stopCam();
      try {
        await openCam();
      } catch {
        if (S.closed) return;
        toast(t('mirrorErr'), 4000);
      }
    }
    if (!$('.rom-sidebig').hidden) paintSide($('.rom-sidebig').classList.contains('compact') ? 'compact' : 'full');
  };
  $('[data-r="close"]').onclick = leave;

  // ----- écran d'introduction -----
  const last = (): RomTrend => trend(romLogOf(prof), T.id, sd);
  function introHtml(): string {
    const tr_ = last();
    return `<div class="rom-intro"><div class="row between" style="align-items:flex-start;gap:12px"><div><h2 style="margin:0 0 4px">${esc(tr(T.name))}</h2><div class="row wrap" style="gap:6px">${big ? `<span class="rom-sidechip" style="--sc:${big.color}">${esc(big.text)}</span>` : ''}<span class="chip">${esc(t(T.view === 'side' ? 'rom_viewSide' : 'rom_viewFront'))}</span>${T.lowConfidence ? `<span class="chip neg">${esc(t('rom_lowConfTag'))}</span>` : ''}</div></div>${schematic(T)}</div>
      <ol class="rom-steps"><li><b>${esc(t('rom_stepCam'))}</b> ${esc(tr(T.cam))}</li><li><b>${esc(t('rom_stepPos'))}</b> ${orient() ? `<strong class="rom-or">${esc(orient())}</strong> ` : ''}${esc(startInstr(T))}</li><li><b>${esc(t('rom_stepMove'))}</b> ${esc(tr(T.how))}</li></ol>
      <p class="muted small" style="margin:6px 0">${esc(t('rom_trialsInfo', { n: TRIALS }))}${tr_.n ? ' · ' + esc(t('rom_lastWas')) + ' ' + fmtVal(tr_.last, T) + ' (' + esc(dateS(tr_.lastTs ?? 0)) + ')' : ''}</p>
      <details class="rom-more"><summary>${esc(t('rom_limits'))}</summary><p class="small">${esc(tr(T.note))}</p><p class="small muted">${esc(t('rom_normal'))} : ${esc(T.normal.src)}</p></details>
      <button class="btn" data-r="go">${icon('cam', 18)} ${esc(t('rom_startCam'))}</button></div>`;
  }
  function showIntro(): void {
    S.stage = 'intro';
    clearTimeout(S.start?.timer);
    $('.rstart').hidden = true;
    $('.rom-sidebig').hidden = true;
    $('.counter').hidden = true;
    $('[data-r="finish"]').hidden = true;
    $('[data-r="manual"]').hidden = false;
    showCue('');
    setup(introHtml());
    $('[data-r="go"]').onclick = () => void startCamera();
  }

  async function startCamera(): Promise<void> {
    setup('');
    center(`<div><div class="spinner"></div>${esc(t('loadingModel'))}</div>`);
    try {
      if (!S.stream && !(await openCam())) {
        if (!S.closed) {
          center('');
          showIntro();
        }
        return;
      }
      lmk = await loadPose();
      if (T.needsHand) {
        try {
          await loadHands();
          S.hand = true;
        } catch (e) {
          console.warn('hands', e);
          S.hand = false;
        }
      }
      if (S.closed) return;
    } catch (e) {
      if (S.closed) return;
      console.error(e);
      center('');
      stopCam();
      toast(e instanceof Error && e.name === 'NotAllowedError' ? t('camDenied') : t('modelErr'), 4500);
      showIntro();
      return;
    }
    center('');
    void keepAwake();
    paintSide('full');
    startPlacement();
    S.active = true;
    S.pace = new Pacer(HZ);
    S.raf = requestAnimationFrame(loop);
  }

  // ----- placement -----
  function startPlacement(): void {
    S.stage = 'place';
    setup('');
    $('.counter').hidden = true;
    S.luma = null;
    S.lumaT = 0;
    S.place = { gate: new PlacementGate(), t0: performance.now(), shown: null, timer: undefined };
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: unknown };
      if ('DeviceOrientationEvent' in window && typeof DOE.requestPermission !== 'function' && !S.onOri) {
        S.onOri = (e) => {
          if (!isNil(e.beta) && !isNil(e.gamma)) S.tilt = { beta: e.beta, gamma: e.gamma };
        };
        window.addEventListener('deviceorientation', S.onOri);
      }
    } catch {
      /* capteur d'inclinaison indisponible */
    }
    S.place.timer = setTimeout(() => {
      if (S.stage === 'place') {
        toast(t('pl_timeout'), 3500);
        endPlacement(false);
      }
    }, PLACE_MAX_MS);
    renderPlace(null, 'wait');
  }
  interface PlaceIssue {
    key: string;
  }
  function renderPlace(issue: PlaceIssue | null, kind: string): void {
    const box = $('.place');
    const key = issue ? issue.key : null;
    const txt =
      kind === 'ok'
        ? t('pl_perfect')
        : key
          ? t('pl_' + key) !== 'pl_' + key
            ? t('pl_' + key)
            : key
          : t('pl_checking');
    box.hidden = false;
    box.dataset['state'] = kind;
    const sig = key + kind;
    if (S.place && S.place.shown !== sig) {
      S.place.shown = sig;
      const icons = ICON_SVG as unknown as Record<string, string>;
      $('.place-ico').innerHTML = icons[kind === 'ok' ? 'ok' : key ? issueIcon(issue) : 'eye'] ?? '';
      $('.place-txt').textContent = txt;
    }
  }
  function endPlacement(ok: boolean): void {
    clearTimeout(S.place?.timer);
    if (S.stage !== 'place') return;
    if (ok) {
      renderPlace(null, 'ok');
      setTimeout(() => {
        $('.place').hidden = true;
      }, 900);
    } else $('.place').hidden = true;
    beginStart();
  }
  $('[data-r="place-skip"]').onclick = () => endPlacement(false);
  function placeStep(now: number, lm: readonly LandmarkLike[] | null, hand: unknown): void {
    const P = S.place;
    if (!P) return;
    if (now - S.lumaT > 300) {
      S.lumaT = now;
      S.luma = sampleLuma(lm ? subjectBox(lm, T.scope) : null);
    }
    const a = assessPlacement({
      kind: 'body',
      plane: T.view as 'side' | 'front',
      side: sd,
      scope: T.scope as string,
      lm,
      frameW: V.fw,
      frameH: V.fh,
      mirror: S.mirror,
      luma: S.luma,
      tilt: S.tilt,
    });
    if (T.needsHand && S.hand && lm && !hand) {
      a.ok = false;
      a.issues = [...a.issues, { key: 'noHand' }];
    }
    const r = P.gate.push(a, now);
    drawGuide(a.ok);
    $('.place-bar i').style.width = `${Math.round(r.progress * 100)}%`;
    if (r.stable) {
      endPlacement(true);
      return;
    }
    renderPlace(r.issue, r.issue ? 'bad' : 'wait');
  }

  // ----- position de départ (voix + vérification par la pose) -----
  const chip = (ok: boolean, txt: string, pending: boolean): string =>
    `<span class="rchip ${pending ? '' : ok ? 'ok' : 'no'}"><i aria-hidden="true">${pending ? '·' : ok ? '✓' : '✗'}</i>${esc(txt)}</span>`;
  function beginStart(): void {
    S.stage = 'start';
    S.cur = null;
    S.cd = { a: false, b: false };
    $('.counter').hidden = true;
    $('[data-r="finish"]').hidden = !S.trials.length;
    $('[data-r="manual"]').hidden = false;
    showCue('');
    voicer.reset();
    clearTimeout(S.start?.timer);
    S.start = {
      gate: new StartGate(),
      t0: performance.now(),
      introSaid: false,
      aiN: 0,
      aiBusy: false,
      last: null,
      lm: null,
      shown: null,
      timer: undefined,
    };
    S.start.timer = setTimeout(() => {
      if (S.stage === 'start') {
        toast(t('pl_timeout'), 3500);
        endStart(false);
      }
    }, START_MAX_MS);
    paintSide('label');
    $('.place').hidden = true; // la carte de départ porte déjà la phrase d'orientation
    const box = $('.rstart');
    box.hidden = false;
    box.dataset['state'] = 'wait';
    $('.rstart .place-ai').hidden = true;
    $('.rstart .place-bar i').style.width = '0%';
    renderStart({ key: 'intro', text: startInstr(T), icon: 'eye' }, null, null);
  }
  function renderStart(
    cue: { key: string; text: string; icon: string },
    chk: StartCheck | null,
    r: { still: boolean; progress: number } | null,
  ): void {
    const box = $('.rstart');
    const sig = cue.key + '|' + cue.text;
    box.dataset['state'] =
      cue.key === 'go' || cue.key === 'ok' ? 'ok' : cue.key === 'intro' || cue.key === 'find' ? 'wait' : 'bad';
    if (S.start && S.start.shown !== sig) {
      S.start.shown = sig;
      const icons = ICON_SVG as unknown as Record<string, string | undefined>;
      $('.rstart .place-ico').innerHTML = icons[cue.icon] || icons['eye'] || '';
      $('.rstart .place-txt').textContent = cue.text;
    }
    const pend = !chk || chk.issues[0] === 'lost';
    $('.rstart .rstart-chk').innerHTML =
      chip(
        chk ? chk.view && chk.side : false,
        chk && !chk.side ? orient() : t(T.view === 'side' ? 'rom_viewSide' : 'rom_viewFront'),
        pend,
      ) +
      chip(
        chk ? chk.inRange : false,
        t('rom_chkStart') + (chk && chk.deg !== null && Number.isFinite(chk.deg) ? ` ${fmtVal(chk.deg, T)}` : ''),
        pend || !(chk && chk.view && chk.side),
      ) +
      chip(r ? r.still && r.progress > 0 : false, t('rom_chkStill'), pend || !(chk && chk.ok));
    $('.rstart .place-bar i').style.width = `${Math.round(((r && r.progress) || 0) * 100)}%`;
  }
  function endStart(ready: boolean): void {
    if (S.stage !== 'start') return;
    clearTimeout(S.start?.timer);
    $('.rstart').hidden = true;
    if (!ready) {
      const gt = t('rom_cuGo', { g: goInstr(T, sd) });
      voicer.mark('go', gt, performance.now());
      say(gt, { interrupt: true });
    }
    beginTrial();
  }
  $('[data-r="start-skip"]').onclick = () => endStart(false);
  function startStep(now: number, lm: readonly LandmarkLike[] | null): void {
    const A = S.start;
    if (!A) return;
    const s: StartSample | null = lm
      ? sampleOf(T, sd, lm as unknown as Parameters<typeof sampleOf>[2], V.fw, V.fh)
      : null;
    const chk = checkStart(T, sd, s);
    const r = A.gate.push(now, chk, s);
    A.lm = lm;
    drawGuide(chk.ok);
    const cue = startCue(T, sd, chk, r, S.mirror);
    renderStart(cue, chk, r);
    // voix : d'abord le côté + l'orientation, puis seulement quand la consigne change
    if (!A.introSaid) {
      const intro = `${big ? big.text + '. ' : ''}${orient()}`.trim();
      const x = `${intro} ${startInstr(T)}`.trim();
      if (voicer.offer('intro', x, now)) {
        A.introSaid = true;
        say(x, { interrupt: true });
      }
    } else if (cue.say && voicer.offer(cue.key, cue.say, now)) {
      say(cue.say, { interrupt: true });
      if (cue.key === 'go') {
        endStart(true);
        return;
      }
    }
    if (r.ready && muted) {
      endStart(true);
      return;
    }
    if (
      store.aiKey() &&
      store.imageConsent() &&
      navigator.onLine !== false &&
      !A.aiBusy &&
      A.aiN < 3 &&
      !r.ready &&
      now - A.t0 > 6000 + A.aiN * 14000 &&
      voicer.idle(now)
    )
      void startAdvice(chk, s);
  }
  // Conseil IA facultatif (clé personnelle ou partagée) : une image annotée + les mesures locales → 2 phrases courtes, dites et affichées
  function annotated(lm: readonly LandmarkLike[] | null, w = 512): string | null {
    try {
      const c = document.createElement('canvas');
      const k = w / V.fw;
      c.width = w;
      c.height = Math.round(V.fh * k);
      const cg = c.getContext('2d') as CanvasRenderingContext2D;
      cg.drawImage(frame, 0, 0, c.width, c.height);
      if (lm) {
        const js = jointIdx(T.id, sd || 'L') as number[];
        cg.fillStyle = '#ffb020';
        cg.strokeStyle = '#000';
        cg.lineWidth = 2;
        for (const i of js) {
          const p = lm[i];
          if (p && (p.visibility ?? 1) >= 0.3) {
            cg.beginPath();
            cg.arc(p.x * c.width, p.y * c.height, 6, 0, 7);
            cg.fill();
            cg.stroke();
          }
        }
      }
      return c.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
    } catch {
      return null;
    }
  }
  async function startAdvice(chk: StartCheck, s: StartSample | null): Promise<void> {
    const A = S.start;
    if (!coach || !A) return;
    A.aiBusy = true;
    A.aiN++;
    try {
      const img = annotated(A.lm);
      if (!img) return;
      const lab = aiLangInfo()?.label;
      const sys = `You guide a patient into the correct STARTING position before a camera range-of-motion measurement. Answer in ${lab}, informal register (in French use "tu"), maximum 2 short spoken sentences, no greeting, no markdown. The image is the raw camera view, NOT mirrored: the patient's right side appears on the left of the image when they face the camera. Talk only about the starting posture and which side faces the phone. Never contradict the local measurements given.`;
      const text =
        `Test: ${T.name.en}${sd ? `, patient's ${sd === 'R' ? 'RIGHT' : 'LEFT'} side` : ''}. Wanted view: ${T.view === 'side' ? 'side-on (profile)' : 'facing the phone'}. Wanted start position: ${T.start?.instr.en}\n` +
        `Local measurements (reliable): issues=[${chk.issues.join(', ') || 'none'}]; start value=${s && s.deg !== null && Number.isFinite(s.deg) ? Math.round(s.deg) : '?'}${T.unit} (accepted ${T.start?.lo} to ${T.start?.hi}); side facing the camera=${chk.near === 'R' ? 'right' : chk.near === 'L' ? 'left' : 'unknown'}; shoulder/trunk ratio=${s && s.ratio !== null ? s.ratio.toFixed(2) : '?'}.`;
      const r = await coach.gemini({
        key: store.aiKey(),
        sys,
        parts: [{ text }, { inline_data: { mime_type: 'image/jpeg', data: img } }],
        maxTokens: 90,
        timeout: 8000,
      });
      if (!r || S.stage !== 'start' || S.start !== A) return;
      const el = $('.rstart .place-ai');
      el.textContent = r;
      el.hidden = false;
      const now = performance.now();
      if (voicer.idle(now)) {
        voicer.mark('ai' + A.aiN, r, now);
        coach.speakAI(r, { interrupt: true });
      }
    } catch {
      /* silencieux : les consignes locales continuent */
    } finally {
      A.aiBusy = false;
    }
  }

  // ----- essais -----
  function beginTrial(): void {
    S.stage = 'measure';
    S.cur = null;
    S.cd = { a: false, b: false };
    S.det = new HoldDetector({ dir: T.dir ?? 1, minTravel: T.minTravel ?? 15, tol: 3, holdMs: 1500 });
    $('.counter').hidden = false;
    $('[data-r="finish"]').hidden = !S.trials.length;
    $('[data-r="manual"]').hidden = true;
    $('.place').hidden = true;
    $('#rlbl').textContent = t('rom_trialN', { n: S.trials.length + 1, m: TRIALS });
    paintSide('compact');
    showCue(
      `${t('rom_trialOf', { n: S.trials.length + 1, m: TRIALS })} · ${t(S.trials.length ? 'rom_nextTrial' : 'rom_goMax')}`,
      '',
    );
  }
  function onFired(res: NonNullable<ReturnType<HoldDetector['push']>['result']>): void {
    const conf = confidence({
      vis: res.vis,
      ratio: res.ratio,
      view: T.view ?? 'side',
      sd: res.sd,
      maxConf: T.maxConf ?? 1,
      q: res.q,
    });
    S.trials.push({ deg: r1(res.deg), conf, sd: r1(res.sd), peak: r1(res.peak) });
    try {
      if (store.settings().vibrate !== false) navigator.vibrate(conf >= CONF_MIN ? 40 : [30, 50, 30]);
    } catch {
      /* vibration indisponible */
    }
    showCue(conf >= CONF_MIN ? `${fmtVal(res.deg, T)} ✓` : t('rom_lowTrial'), conf >= CONF_MIN ? 'good' : 'bad');
    $('[data-r="finish"]').hidden = false;
    const more = S.trials.length < TRIALS;
    const n = S.trials.length;
    const spoken =
      (conf >= CONF_MIN ? t('rom_cuNote', { v: spokenVal(res.deg, T) }) : t('rom_lowTrial')) +
      (more ? ' ' + t('rom_cuNext', { n: n + 1, m: TRIALS }) : '');
    voicer.mark('res' + n, spoken, performance.now());
    say(spoken, { interrupt: true });
    setTimeout(
      () =>
        showCue(
          S.stage === 'measure'
            ? more
              ? `${t('rom_trialOf', { n: n + 1, m: TRIALS })} · ${t('rom_returnRest')}`
              : t('rom_returnRest')
            : '',
        ),
      1400,
    );
    if (!more)
      setTimeout(() => {
        if (S.stage === 'measure') showResult();
      }, 1800);
    else $('#rlbl').textContent = t('rom_trialN', { n: n + 1, m: TRIALS });
  }
  $('[data-r="finish"]').onclick = () => {
    if (S.stage === 'measure') showResult();
  };

  // ----- boucle d'analyse -----
  function loop(): void {
    if (!S.active || S.closed) return;
    if (!root.isConnected) {
      close();
      return;
    }
    S.raf = requestAnimationFrame(loop);
    if (S.stage === 'result') return;
    const now = performance.now();
    if (!S.pace || !S.pace.due(now) || !grab()) return;
    let lm: readonly LandmarkLike[] | null = null;
    let world: unknown = null;
    let hand: { lm: readonly LandmarkLike[]; world: unknown } | null = null;
    try {
      const res = lmk?.detectForVideo(frame, now);
      lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
      const wl = (res as { worldLandmarks?: unknown[][] } | undefined)?.worldLandmarks;
      world = wl?.[0] ? wl[0] : null;
      if (T.needsHand && S.hand)
        hand = pickHand(detectHands(frame, now), sd, S.handPrev as Parameters<typeof pickHand>[2]);
      S.handPrev = hand;
    } catch (e) {
      console.warn('detect', e);
    }
    S.pace.done(now, performance.now());
    const gd = guard.check(lm, now, V.fw / V.fh);
    lm = gd.lm ?? null;
    paintFrame();
    if (lm) drawSkeleton(g, project(smooth.apply(lm, now)), V.W, V.H, new Set(), S.mirror, true);
    else smooth.reset();
    if (hand) drawHand(g, project(hsmooth.apply(hand.lm, now)), V.W, V.H, S.mirror, { keep: true });
    else hsmooth.reset();
    if (S.stage === 'place') {
      placeStep(now, lm, hand);
      return;
    }
    if (S.stage === 'start') {
      if (!gd.jumped) startStep(now, lm);
      return;
    }
    if (S.stage !== 'measure' || gd.jumped || !S.det) return;
    const f = lm ? { lm, w: V.fw, h: V.fh, world, hand: hand ? { lm: hand.lm, world: hand.world } : null } : null;
    const r = f
      ? (
          measure as (
            id: string,
            fr: unknown,
            sd: string | null,
          ) => { deg: number; vis: number; q?: number; draw?: ArcDraw } | null
        )(T.id ?? '', f, sd)
      : null;
    if (!r || !lm) {
      S.det.push({ t: now, deg: NaN, vis: 0 });
      $('#rdeg').textContent = '–';
      return;
    }
    const st = S.det.push({ t: now, deg: r.deg, vis: r.vis, ratio: planeRatio(lm, V.fw, V.fh), q: r.q ?? 1 });
    S.cur = r.deg;
    drawArc(r.draw, r.deg);
    $('#rdeg').textContent = String(Math.round(r.deg));
    $('#rring').style.strokeDashoffset = String(RING * (1 - (st.progress || 0)));
    // décompte vocal du maintien : « 2… 1… » puis « c'est noté » (dit avec le résultat)
    if (st.state === 'holding') {
      const n = S.trials.length + 1;
      if (!S.cd.a && st.progress >= 0.05) {
        S.cd.a = true;
        if (voicer.offer(`cd2-${n}`, '2', now, { gap: 300 }) && coach) coach.countAloud(2);
      } else if (!S.cd.b && st.progress >= 0.5) {
        S.cd.b = true;
        if (voicer.offer(`cd1-${n}`, '1', now, { gap: 300 }) && coach) coach.countAloud(1);
      }
    } else if (st.state !== 'fired') S.cd = { a: false, b: false };
    if (st.state === 'fired' && st.result) onFired(st.result);
  }

  // ----- résultat -----
  function showResult(): void {
    S.stage = 'result';
    clearTimeout(S.start?.timer);
    $('.counter').hidden = true;
    $('.place').hidden = true;
    $('.rstart').hidden = true;
    $('.rom-sidebig').hidden = true;
    showCue('');
    $('[data-r="finish"]').hidden = true;
    $('[data-r="manual"]').hidden = true;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const best = bestTrial(S.trials, { dir: T.dir ?? 1 });
    const prev = trend(romLogOf(prof), T.id ?? '', sd);
    const list = S.trials
      .map(
        (x, i) =>
          `<li class="${best === x ? 'best' : ''}">${i + 1}. <b>${fmtVal(x.deg, T)}</b> <small class="muted">· ${esc(t('rom_conf_' + confLabel(x.conf)))} (${Math.round(x.conf * 100)} %)</small></li>`,
      )
      .join('');
    if (!best) {
      say(t('rom_unreliable'), { interrupt: true });
      setup(`<div class="rom-res"><h2 style="margin:0 0 6px">${esc(t('rom_unreliable'))}</h2><p class="muted small">${esc(t('rom_unreliableD'))}</p><ul class="rom-trials">${list}</ul>
        <div class="row wrap" style="margin-top:12px"><button class="btn grow" data-r="redo">${esc(t('rom_redo'))}</button><button class="btn ghost grow" data-r="man2">${esc(t('rom_manual'))}</button></div></div>`);
      $('[data-r="redo"]').onclick = redo;
      $('[data-r="man2"]').onclick = showManual;
      return;
    }
    say(t('rom_cuDone', { v: spokenVal(best.deg, T) }), { interrupt: true });
    const dir = T.dir || 1;
    const vsBase = prev.baseline !== null ? r1(dir * (best.deg - prev.baseline)) : null;
    const vsPrev = prev.last !== null ? r1(dir * (best.deg - prev.last)) : null;
    const pct = T && !T.deficit && T.normal.ref > 0 ? Math.round((best.deg / T.normal.ref) * 100) : null;
    const opp = sd ? seriesOf(romLogOf(prof), T.id ?? '', sd === 'L' ? 'R' : 'L') : [];
    const oppRow = opp[opp.length - 1];
    const oppLast = oppRow ? oppRow.deg : null;
    setup(`<div class="rom-res"><small class="muted">${esc(tr(T.name))}${sd ? ' · ' + esc(sideName(sd)) : ''}</small>
      <div class="rom-big">${fmtVal(best.deg, T)}</div><div class="row wrap" style="gap:6px"><span class="chip ${best.conf >= 0.75 ? 'pos' : ''}">${esc(t('rom_confidence'))} ${esc(t('rom_conf_' + confLabel(best.conf)))} (${Math.round(best.conf * 100)} %)</span>${T.lowConfidence ? `<span class="chip neg">${esc(t('rom_lowConfTag'))}</span>` : ''}</div>
      <div class="rom-stats"><div><small>${esc(t('rom_normal'))}</small><b>${T.deficit ? '≈ 0' : T.normal.ref}${T.unit === '%' ? ' %' : '°'}</b></div>${pct !== null ? `<div><small>${esc(t('rom_pctNormal'))}</small><b>${pct} %</b></div>` : ''}<div><small>${esc(t('rom_previous'))}</small><b>${fmtVal(prev.last, T)}</b></div><div><small>${esc(t('rom_baseline'))}</small><b>${fmtVal(prev.baseline, T)}</b></div>
        <div><small>${esc(t('rom_vsBaseline'))}</small><b class="${sign(vsBase)}">${fmtGain(vsBase, T)}</b></div>${vsPrev !== null ? `<div><small>${esc(t('rom_vsPrevious'))}</small><b class="${sign(vsPrev)}">${fmtGain(vsPrev, T)}</b></div>` : ''}${oppLast !== null ? `<div><small>${esc(t('rom_otherSide'))}</small><b>${fmtVal(oppLast, T)}</b></div>` : ''}</div>
      <ul class="rom-trials">${list}</ul>
      <div class="row wrap" style="margin-top:10px"><button class="btn grow" data-r="save">${icon('check', 18)} ${esc(t('rom_save'))}</button></div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm ghost grow" data-r="redo">${esc(t('rom_redo'))}</button><button class="btn sm ghost grow" data-r="man2">${esc(t('rom_manual'))}</button></div></div>`);
    $('[data-r="save"]').onclick = () => void save({ deg: best.deg, conf: best.conf, method: 'camera' });
    $('[data-r="redo"]').onclick = redo;
    $('[data-r="man2"]').onclick = showManual;
  }
  function redo(): void {
    S.trials = [];
    setup('');
    if (S.stream && lmk) {
      S.active = true;
      beginStart();
    } else showIntro();
  }

  // ----- saisie manuelle (goniomètre du clinicien) -----
  function showManual(): void {
    S.stage = 'manual';
    clearTimeout(S.start?.timer);
    $('.counter').hidden = true;
    $('.place').hidden = true;
    $('.rstart').hidden = true;
    $('.rom-sidebig').hidden = true;
    showCue('');
    $('[data-r="finish"]').hidden = true;
    $('[data-r="manual"]').hidden = true;
    center('');
    setup(`<div class="rom-res"><h2 style="margin:0 0 6px">${esc(t('rom_manualTitle'))}</h2><p class="muted small">${esc(t('rom_manualD'))}</p>
      <label class="field"><span>${esc(tr(T.name))}${sd ? ' · ' + esc(sideName(sd)) : ''} (${T.unit === '%' ? '%' : '°'})</span><input class="input" id="mval" type="number" inputmode="decimal" min="-30" max="200" step="1" autofocus></label>
      <div class="row wrap"><button class="btn grow" data-r="msave">${esc(t('rom_save'))}</button><button class="btn ghost grow" data-r="mback">${esc(t('back'))}</button></div></div>`);
    $('[data-r="msave"]').onclick = () => {
      const v = parseFloat($<HTMLInputElement>('#mval').value);
      if (!Number.isFinite(v) || v < -30 || v > 200) {
        toast(t('rom_badValue'));
        return;
      }
      void save({ deg: r1(v), conf: 1, method: 'manual' });
    };
    $('[data-r="mback"]').onclick = () => {
      if (S.trials.length) showResult();
      else showIntro();
    };
  }
  $('[data-r="manual"]').onclick = showManual;

  async function save(m: { deg: number; conf: number; method: string }): Promise<void> {
    if (S.saved) return;
    S.saved = true;
    const entry = { test: T.id ?? '', side: sd, ts: Date.now(), deg: m.deg, conf: m.conf, method: m.method };
    try {
      await updateProfile({ romLog: [...(profile()?.romLog || []), entry] });
      try {
        void syncProgress();
      } catch {
        /* la synchronisation est facultative */
      }
      toast(t('rom_saved'));
    } catch (e) {
      console.error(e);
      S.saved = false;
      toast(t('rom_saveErr'));
      return;
    }
    close();
    go('#/amplitude');
  }

  showIntro();
}
