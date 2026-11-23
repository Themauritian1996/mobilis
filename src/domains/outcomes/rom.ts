/**
 * Amplitude articulaire (ROM) : logique pure (aucun accès au DOM). Reprise de www/js/rom.js (v1.15), testée par
 * tests/rom.test.mjs à travers le module de réexportation www/js/rom.js et par rom.test.ts.
 * Le catalogue et les calculs d'angle restent dans data/romtests.js (migré par la tranche T1) : chemin legacy en attendant.
 */
import { t, tr } from '../../../www/js/i18n.js';
import {
  TESTS as ROM_TESTS,
  TEST_IDS,
  getTest,
  LM as ROM_LM,
  measure,
  planeRatio,
  facing,
  SUGGESTED as ROM_SUGGESTED,
  SUGGESTED_REGION as ROM_SUGGESTED_REGION,
} from '../../../www/js/data/romtests.js';

export { ROM_TESTS as TESTS, TEST_IDS, getTest };
const DAY = 86400000;

/** Un test du catalogue (champs utilisés ici ; le catalogue en porte d'autres). */
export interface RomTestInfo {
  readonly id: string;
  readonly name: L10n;
  readonly cam: L10n;
  readonly how: L10n;
  readonly note: L10n;
  readonly view: string;
  readonly region?: string;
  readonly scope?: string;
  readonly sided?: boolean;
  readonly dir?: number;
  readonly unit?: string;
  readonly deficit?: boolean;
  readonly lowConfidence?: boolean;
  readonly optional?: boolean;
  readonly needsHand?: boolean;
  readonly maxConf?: number;
  readonly minTravel?: number;
  readonly sch?: { readonly fix: number; readonly from: number; readonly to: number };
  readonly start?: RomStart;
  readonly normal: { readonly ref: number; readonly lo?: number; readonly hi?: number; readonly src?: string };
}

/** Texte bilingue du catalogue (résolu par `tr`). */
export interface L10n {
  readonly fr: string;
  readonly en: string;
}

/** Position de départ guidée d'un test. */
export interface RomStart {
  readonly part: readonly [string, string] | null;
  readonly mode: string;
  readonly lying?: boolean;
  readonly lo: number;
  readonly hi: number;
  readonly fixed: readonly string[];
  readonly instr: L10n;
  readonly go: L10n;
}

/** Une mesure du journal `romLog` du profil. */
export interface RomLogRow {
  readonly test: string;
  readonly side?: string | null;
  readonly deg: number;
  readonly ts: number;
  readonly method?: string;
}

export interface RomPlanItem {
  readonly test: string;
  readonly side: string | null;
}

const TESTS = ROM_TESTS as unknown as Record<string, RomTestInfo | undefined>;

const r1 = (x: number): number => Math.round(x * 10) / 10;
const sideOf = (r: { side?: string | null }): string | null => r.side ?? null;
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Plan de mesures → liste normalisée [{ test, side }]. Accepte 'sh_flex_L', 'sh_flex' (= les deux côtés), { test, side } ou { test } (= les deux côtés). */
export function planItems(plan: unknown): RomPlanItem[] {
  const raw: unknown[] = Array.isArray(plan)
    ? plan
    : isRecord(plan) && Array.isArray(plan['tests'])
      ? (plan['tests'] as unknown[])
      : [];
  const out: RomPlanItem[] = [];
  const seen = new Set<string>();
  const add = (test: string, side: string | null): void => {
    const T = TESTS[test];
    if (!T) return;
    const sides = !T.sided ? [null] : side === 'L' || side === 'R' ? [side] : ['L', 'R'];
    for (const s of sides) {
      const k = test + '_' + (s || '-');
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ test, side: s });
      }
    }
  };
  for (const it of raw) {
    if (typeof it === 'string') {
      const m = it.match(/^(.*)_([LR])$/);
      if (m && m[1] !== undefined && TESTS[m[1]]) add(m[1], m[2] ?? null);
      else add(it, null);
    } else if (isRecord(it) && it['test']) {
      add(String(it['test']), (it['side'] as string | null | undefined) || null);
    }
  }
  return out;
}
export const planEvery = (plan: unknown): number =>
  isRecord(plan) && Number.isFinite(Number(plan['every'])) ? Math.max(0, Number(plan['every'])) : 0;
export const itemKey = (test: string, side?: string | null): string => `${test}_${side || '-'}`;

/** Mesures d'un test (et d'un côté) dans le journal, triées par date. */
export function seriesOf(
  log: readonly RomLogRow[] | null | undefined,
  test: string,
  side?: string | null,
): RomLogRow[] {
  const T = TESTS[test];
  const s = T && T.sided ? (side ?? null) : null;
  return (log || [])
    .filter((r) => r && r.test === test && Number.isFinite(r.deg) && (!T?.sided || sideOf(r) === s))
    .sort((a, b) => a.ts - b.ts);
}

export interface RomTrend {
  n: number;
  baseline: number | null;
  last: number | null;
  prev: number | null;
  gain: number | null;
  pctNormal: number | null;
  sideDiff: number | null;
  lastTs: number | null;
  baselineTs: number | null;
}

/** Évolution d'un test : { n, baseline, last, prev, gain (degrés gagnés : positif = mieux), pctNormal, sideDiff (ce côté − l'autre, dernières valeurs), lastTs, baselineTs }. */
export function trend(log: readonly RomLogRow[] | null | undefined, test: string, side?: string | null): RomTrend {
  const T = TESTS[test];
  const rows = seriesOf(log, test, side);
  const out: RomTrend = {
    n: rows.length,
    baseline: null,
    last: null,
    prev: null,
    gain: null,
    pctNormal: null,
    sideDiff: null,
    lastTs: null,
    baselineTs: null,
  };
  const first = rows[0];
  const lastR = rows[rows.length - 1];
  if (!first || !lastR) return out;
  const dir = T?.dir || 1;
  out.baseline = first.deg;
  out.baselineTs = first.ts;
  out.last = lastR.deg;
  out.lastTs = lastR.ts;
  out.prev = rows.length > 1 ? (rows[rows.length - 2]?.deg ?? null) : null;
  out.gain = r1(dir * (lastR.deg - first.deg));
  out.pctNormal = T && !T.deficit && T.normal.ref > 0 ? Math.round((lastR.deg / T.normal.ref) * 100) : null;
  if (T?.sided && side) {
    const o = seriesOf(log, test, side === 'L' ? 'R' : 'L');
    const ol = o[o.length - 1];
    if (ol) out.sideDiff = r1(lastR.deg - ol.deg);
  }
  return out;
}

export interface RomSummaryRow {
  t: string;
  s: string | null;
  b: number;
  l: number;
  g: number | null;
  n: number;
  ts: number | null;
  p: [number, number][];
  m: string;
}

/** Petit résumé pour le clinicien (ajouté à progressSummary) : { rom: [{ t, s, b, l, g, n, ts, p: [[ts, deg]…8] }] }, vide s'il n'y a rien. */
export function summaryPart(prof: { romLog?: readonly RomLogRow[] } | null | undefined): { rom?: RomSummaryRow[] } {
  const log = prof?.romLog || [];
  if (!log.length) return {};
  const keys = new Map<string, RomPlanItem>();
  for (const r of log) {
    const T = TESTS[r.test];
    if (T) keys.set(itemKey(r.test, T.sided ? sideOf(r) : null), { test: r.test, side: T.sided ? sideOf(r) : null });
  }
  const rows: RomSummaryRow[] = [];
  for (const { test, side } of keys.values()) {
    const s = seriesOf(log, test, side);
    const tr = trend(log, test, side);
    const last = s[s.length - 1];
    if (!last) continue;
    rows.push({
      t: test,
      s: side,
      b: r1(tr.baseline ?? 0),
      l: r1(tr.last ?? 0),
      g: tr.gain,
      n: s.length,
      ts: tr.lastTs,
      p: s.slice(-8).map((x): [number, number] => [x.ts, r1(x.deg)]),
      m: last.method || 'camera',
    });
  }
  rows.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  return { rom: rows.slice(0, 24) };
}

/** Test du catalogue par identifiant (undefined si inconnu). */
export const testInfo = (id: string): RomTestInfo | undefined => TESTS[id];
/** Côtés mesurables d'un test : ['L','R'] ou [null]. */
export const sidesOfTest = (id: string): (string | null)[] => (TESTS[id]?.sided ? ['L', 'R'] : [null]);

export const romHash = (test: string, side?: string | null): string => `#/rom/${test}/${side || '-'}`;

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const median = (a: readonly number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? (s[(n - 1) / 2] ?? NaN) : ((s[n / 2 - 1] ?? NaN) + (s[n / 2] ?? NaN)) / 2;
};
const mean = (a: readonly number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sdOf = (a: readonly number[]): number => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** Part de confiance de la vue : rapport largeur d'épaules / tronc (≈ 0,5–0,9 de face, < 0,28 de profil). Inconnu → 0,85. */
export function planeScore(view: string, ratio?: number | null): number {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return 0.85;
  if (view === 'side') return ratio <= 0.28 ? 1 : ratio >= 0.5 ? 0.3 : 1 - ((ratio - 0.28) / 0.22) * 0.7;
  return ratio >= 0.45 ? 1 : ratio <= 0.25 ? 0.3 : 0.3 + ((ratio - 0.25) / 0.2) * 0.7;
}

export interface ConfidenceInput {
  vis?: number;
  ratio?: number | null;
  view?: string;
  sd?: number;
  maxConf?: number;
  q?: number;
}
/** Confiance 0–1 d'une mesure : visibilité des points (0,4 → 0 ; 0,9 → 1) × vue (profil / face correcte) × stabilité (écart-type pendant le maintien) × qualité 2D/3D × plafond du test. */
export function confidence({
  vis = 1,
  ratio = null,
  view = 'side',
  sd = 0,
  maxConf = 1,
  q = 1,
}: ConfidenceInput = {}): number {
  const v = clamp((vis - 0.4) / 0.5, 0, 1);
  const p = planeScore(view, ratio);
  const j = 1 - 0.6 * clamp((sd - 1) / 4, 0, 1);
  return Math.round(clamp(v * p * j * q * maxConf, 0, 1) * 100) / 100;
}
export const CONF_MIN = 0.5;
export const confLabel = (c: number): 'good' | 'fair' | 'low' => (c >= 0.75 ? 'good' : c >= CONF_MIN ? 'fair' : 'low');

/** Échantillon fourni au détecteur de maintien. */
export interface HoldSample {
  t: number;
  deg: number;
  vis?: number;
  ratio?: number | null;
  q?: number;
}
interface HoldEntry extends HoldSample {
  vis: number;
  sm?: number;
}
/** Maintien détecté. */
export interface HoldResult {
  deg: number;
  sd: number;
  n: number;
  vis: number;
  ratio: number | null;
  q: number;
  t0: number;
  t1: number;
  peak: number;
}
export interface HoldStep {
  state: 'lost' | 'rest' | 'moving' | 'holding' | 'fired';
  progress: number;
  deg: number | null;
  result?: HoldResult;
}
export interface HoldOptions {
  tol?: number;
  holdMs?: number;
  minVis?: number;
  dir?: number;
  minTravel?: number;
  gapMs?: number;
  minN?: number;
}

/** Détecteur de maintien. On alimente avec { t (ms), deg, vis, ratio?, q? } ; il rend { state, progress, deg, result? }.
 *  Un maintien = valeur stable à ± tol (3°) pendant ≥ holdMs (1,5 s), au moins minTravel degrés plus loin que la position de départ
 *  et près du maximum atteint (un dépassement bref ne compte pas). Résultat = médiane de la fenêtre stable.
 *  Après un résultat, le détecteur attend que le patient revienne (≥ rearm) avant d'en chercher un autre.
 *  dir = +1 : on cherche le maximum ; −1 : le minimum (déficits d'extension, distance doigts–sol). */
export class HoldDetector {
  tol: number;
  holdMs: number;
  minVis: number;
  dir: number;
  minTravel: number;
  gapMs: number;
  minN: number;
  results: HoldResult[] = [];
  buf: HoldEntry[] = [];
  start: number | null = null;
  ext: number | null = null;
  lastGood = -Infinity;
  armed = true;
  hold: number | null = null;
  lastDeg: number | null = null;
  constructor({
    tol = 3,
    holdMs = 1500,
    minVis = 0.5,
    dir = 1,
    minTravel = 15,
    gapMs = 600,
    minN = 6,
  }: HoldOptions = {}) {
    this.tol = tol;
    this.holdMs = holdMs;
    this.minVis = minVis;
    this.dir = dir;
    this.minTravel = minTravel;
    this.gapMs = gapMs;
    this.minN = minN;
    this.reset();
  }
  reset(): void {
    this.buf = [];
    this.start = null;
    this.ext = null;
    this.lastGood = -Infinity;
    this.armed = true;
    this.hold = null;
    this.lastDeg = null;
    this.results.length = 0;
  }
  /** Oublie la fenêtre en cours (garde la position de départ). */
  clearRun(): void {
    this.buf = [];
    this.ext = null;
  }
  push(s: HoldSample): HoldStep {
    const { t: now, deg, vis = 1 } = s;
    if (!Number.isFinite(deg) || vis < this.minVis) {
      if (now - this.lastGood > this.gapMs) this.clearRun();
      return { state: 'lost', progress: 0, deg: this.lastDeg };
    }
    this.lastGood = now;
    const cur: HoldEntry = { ...s, vis };
    this.buf.push(cur);
    while (this.buf.length && now - (this.buf[0]?.t ?? now) > 6000) this.buf.shift();
    const n = this.buf.length;
    const last3 = this.buf.slice(-3).map((x) => x.deg);
    const sm = median(last3);
    const newest = this.buf[n - 1];
    if (newest) newest.sm = sm;
    this.lastDeg = sm;
    const val = (x: HoldEntry | undefined): number => (x ? (x.sm ?? x.deg) : NaN);
    if (this.start === null && n >= 5) this.start = median(this.buf.slice(0, 5).map(val));
    if (!this.armed) {
      const hold = this.hold ?? 0;
      const dist = Math.max(8, 0.5 * Math.abs(hold - (this.start ?? hold)));
      if (Math.abs(sm - hold) >= dist) {
        this.armed = true;
        this.buf = this.buf.slice(-1);
        this.ext = null;
      } else return { state: 'rest', progress: 0, deg: sm };
    }
    const ext = this.ext === null ? sm : this.dir > 0 ? Math.max(this.ext, sm) : Math.min(this.ext, sm);
    this.ext = ext;
    // fenêtre stable : suffixe dont les valeurs lissées restent à ± tol de la médiane des dernières valeurs
    const ref = median(this.buf.slice(-5).map(val));
    let i = this.buf.length - 1;
    while (i > 0 && Math.abs(val(this.buf[i - 1]) - ref) <= this.tol) i--;
    const win = this.buf.slice(i);
    const w0 = win[0];
    const wl = win[win.length - 1];
    if (!w0 || !wl) return { state: 'moving', progress: 0, deg: sm };
    const dur = wl.t - w0.t;
    const progress = clamp(dur / this.holdMs, 0, 1);
    if (this.start === null) return { state: 'moving', progress: 0, deg: sm };
    const away = this.dir * (ref - this.start);
    const nearMax = this.dir * (ext - ref) <= Math.max(2 * this.tol, 0.15 * Math.abs(ext - this.start));
    const holding = away >= this.minTravel * 0.6 && nearMax;
    if (dur >= this.holdMs && win.length >= this.minN && away >= this.minTravel && nearMax) {
      const degs = win.map((x) => x.deg);
      const pick = (k: 'ratio' | 'q'): number[] =>
        win.map((x) => x[k]).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
      const ratios = pick('ratio');
      const qs = pick('q');
      const result: HoldResult = {
        deg: median(degs),
        sd: sdOf(degs),
        n: win.length,
        vis: mean(win.map((x) => x.vis)),
        ratio: ratios.length ? mean(ratios) : null,
        q: qs.length ? mean(qs) : 1,
        t0: w0.t,
        t1: wl.t,
        peak: ext,
      };
      this.results.push(result);
      this.armed = false;
      this.hold = result.deg;
      this.buf = [];
      return { state: 'fired', progress: 1, deg: sm, result };
    }
    return { state: holding && progress > 0.05 ? 'holding' : 'moving', progress: holding ? progress : 0, deg: sm };
  }
}
/** Version « lot » : rejoue un flux d'échantillons et rend le meilleur maintien (le plus loin dans le sens dir) ou null. */
export function findHold(samples: readonly HoldSample[], opts: HoldOptions = {}): HoldResult | null {
  const det = new HoldDetector(opts);
  for (const s of samples) det.push(s);
  const dir = opts.dir ?? 1;
  return det.results.reduce<HoldResult | null>((b, r) => (!b || dir * (r.deg - b.deg) > 0 ? r : b), null);
}
/** Meilleur essai parmi ceux dont la confiance est suffisante (le plus loin dans le sens dir) ; null s'il n'y en a aucun. */
export function bestTrial<X extends { conf: number; deg: number }>(
  trials: readonly (X | null | undefined)[] | null | undefined,
  { dir = 1, minConf = CONF_MIN }: { dir?: number; minConf?: number } = {},
): X | null {
  const ok = (trials || []).filter((x): x is X => !!x && x.conf >= minConf && Number.isFinite(x.deg));
  return ok.reduce<X | null>((b, x) => (!b || dir * (x.deg - b.deg) > 0 ? x : b), null);
}

export interface RomDue extends RomPlanItem {
  reason: 'baseline' | 'recurring';
  last: number | null;
  dueTs: number;
}
/** Mesures dues : plan { tests, every (semaines ; 0 = départ seulement) }, journal, date de début, maintenant → [{ test, side, reason: 'baseline'|'recurring', last (ts|null), dueTs }]. */
export function due(
  plan: unknown,
  log: readonly RomLogRow[] | null | undefined,
  startTs = 0,
  now: number = Date.now(),
): RomDue[] {
  const every = planEvery(plan);
  const out: RomDue[] = [];
  if (now < (startTs || 0)) return out;
  for (const it of planItems(plan)) {
    const rows = seriesOf(log, it.test, it.side);
    const lastRow = rows[rows.length - 1];
    const last = lastRow ? lastRow.ts : null;
    if (last === null) out.push({ ...it, reason: 'baseline', last: null, dueTs: startTs || now });
    else if (every > 0 && now >= last + every * 7 * DAY)
      out.push({ ...it, reason: 'recurring', last, dueTs: last + every * 7 * DAY });
  }
  return out;
}

/** Profil patient ← rx : { romPlan }. */
export function rxExtrasRom(rx: object | null | undefined): {
  romPlan: { tests: RomPlanItem[]; every: number } | null;
} {
  const rom = rx ? (rx as { rom?: unknown }).rom : undefined;
  const items = rom ? planItems(rom) : [];
  return { romPlan: items.length ? { tests: items, every: planEvery(rom) } : null };
}

/** Profil minimal lu pour les mesures dues. */
export interface RomProfile {
  romLog?: readonly RomLogRow[] | undefined;
  romPlan?: unknown;
  romStart?: number | undefined;
  joinedAt?: number | undefined;
  startDate?: number | undefined;
}
const startOf = (p: RomProfile | null | undefined): number => p?.romStart || p?.joinedAt || p?.startDate || 0;
/** Éléments dus pour ce profil (plan reçu du clinicien ou plan personnel). */
export const dueForProfile = (prof: RomProfile | null | undefined, now: number = Date.now()): RomDue[] =>
  due(prof?.romPlan, prof?.romLog, startOf(prof), now);

// ---------- Formats ----------
export const fmtVal = (deg: number | null | undefined, T?: { unit?: string } | null): string =>
  deg === null || deg === undefined || !Number.isFinite(deg)
    ? '–'
    : T && T.unit === '%'
      ? `${Math.round(deg)} %`
      : `${Math.round(deg)}°`;
export const fmtGain = (g: number | null | undefined, T?: { unit?: string } | null): string =>
  g === null || g === undefined
    ? '–'
    : `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(Math.round(g))}${T && T.unit === '%' ? ' %' : '°'}`;

// ---------- Hooks : éditeur de programme ----------
export const EVERY_OPTIONS = [0, 1, 2, 4, 6, 8, 12];
/** Jeu suggéré d'après la pathologie ou la région : [{ test, side }]. */
export function suggestFor({ pathology, region }: { pathology?: string; region?: string } = {}): RomPlanItem[] {
  const byPath = ROM_SUGGESTED as unknown as Record<string, readonly (readonly [string, string?])[] | undefined>;
  const byRegion = ROM_SUGGESTED_REGION as unknown as Record<
    string,
    readonly (readonly [string, string?])[] | undefined
  >;
  const set = (pathology ? byPath[pathology] : undefined) || (region ? byRegion[region] : undefined) || [];
  return planItems(
    set.flatMap(([test, sides]) => (sides ? sides.split('').map((s) => ({ test, side: s })) : [{ test }])),
  );
}

// =====================================================================================================================
// Position de départ guidée (logique pure, testée dans tests/rom.test.mjs)
// =====================================================================================================================
/** Couleur du côté (gauche : bleu, droite : orangé) : jamais la seule indication (le mot est toujours écrit). */
export const SIDE_COLOR = { L: '#3aa0ff', R: '#ff7a45' };
const sideKey = (sd: string | null | undefined): string => (sd === 'R' ? 'right' : 'left');
/** « droit » / « droite » / « gauche » (genre m / f) dans la langue de l'app. */
export const sideWord = (sd: string | null | undefined, g = 'm'): string =>
  t(`rom_${sideKey(sd)}${g === 'f' ? 'F' : 'M'}`);
/** Nom du sens (« droite » / « gauche »). */
export const dirWord = (sd: string | null | undefined): string => t(sd === 'R' ? 'rom_dirR' : 'rom_dirL');
/** Gros libellé du côté mesuré : { text: « Bras DROIT », side, color } ; null pour un test sans côté. */
export function sideBig(
  T: RomTestInfo | null | undefined,
  sd: string | null | undefined,
): { text: string; side: string; color: string } | null {
  const st = T && T.start;
  if (!T || !T.sided || !sd || !st || !st.part) return null;
  const part = st.part[0]; // le genre grammatical de la partie dépend de la langue : clé rom_pg_<partie> (« m » / « f »)
  const text =
    part === 'head'
      ? t('rom_bigHead', { d: dirWord(sd).toUpperCase() })
      : t('rom_bigPart', { p: t('rom_p_' + part), s: sideWord(sd, t('rom_pg_' + part)).toUpperCase() });
  return { text, side: sd, color: sd === 'R' ? SIDE_COLOR.R : SIDE_COLOR.L };
}

export interface Orientation {
  mode: 'none' | 'near' | 'front' | 'profile' | 'dir';
  side?: string | null;
  seen?: 'right' | 'left';
  scr?: 'right' | 'left';
  lying?: boolean;
}
/** Orientation du patient selon le test, le côté et le miroir.
 *  'near' : côté testé tourné vers le téléphone ; l'image brute le montre tourné vers la droite (côté D) ou la gauche (côté G) de l'image ;
 *           à l'écran, le miroir (caméra avant) inverse : seen = sens où il SE VOIT tourné.
 *  'front' : de face ; le côté D du patient s'affiche à droite de l'écran avec le miroir, à gauche sans (scr). */
export function orientation(
  T: RomTestInfo | null | undefined,
  sd: string | null | undefined,
  mirror?: boolean,
): Orientation {
  const st = T && T.start;
  if (!st) return { mode: 'none' };
  const m = !!mirror;
  if (st.mode === 'near' && sd) {
    const raw = sd === 'R' ? 1 : -1;
    return { mode: 'near', side: sd, seen: (m ? -raw : raw) > 0 ? 'right' : 'left', lying: !!st.lying };
  }
  if (st.mode === 'front' && sd) return { mode: 'front', side: sd, scr: (sd === 'R') === m ? 'right' : 'left' };
  if (st.mode === 'profile') return { mode: 'profile' };
  return { mode: 'dir', side: sd || null };
}
/** Phrase d'orientation dite et affichée, dans les termes du corps du patient (« Tourne ton côté droit vers le téléphone »). */
export function orientText(o: Orientation | null | undefined): string {
  if (!o) return '';
  if (o.mode === 'near') {
    const a = t('rom_orSide', { s: sideWord(o.side, 'm') });
    return o.lying ? a : `${a} ${t('rom_orSeen', { p: t(o.seen === 'right' ? 'rom_toScrR' : 'rom_toScrL') })}`;
  }
  if (o.mode === 'front')
    return t('rom_orFrontSide', { s: sideWord(o.side, 'm'), p: t(o.scr === 'right' ? 'rom_scrR' : 'rom_scrL') });
  if (o.mode === 'profile') return t('rom_orProfile');
  return t('rom_orFront');
}
const fill = (txt: string, sd?: string | null): string => String(txt || '').replaceAll('{side}', sd ? dirWord(sd) : '');
/** Consigne de position de départ / de mouvement du test, dans la langue de l'app. */
export const startInstr = (T: RomTestInfo): string => tr(T.start?.instr);
export const goInstr = (T: RomTestInfo, sd?: string | null): string => fill(tr(T.start?.go), sd);

/** Point de repère de la pose (coordonnées normalisées). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}
const LM = ROM_LM as unknown as Record<string, number | { L: number; R: number } | undefined>;
// Points d'un segment fixe : 'sh' = point du côté testé, 'sh.L' = point explicite
const lmIndex = (spec: string, sd?: string | null): number | null => {
  const [k, e] = spec.split('.');
  const v = k ? LM[k] : undefined;
  if (typeof v === 'number') return v;
  if (!v) return null;
  return v[(e || sd || 'L') as 'L' | 'R'];
};
const vis = (l: Landmark | null | undefined): number => (l ? (l.visibility ?? 1) : 0);
/** Angle (degrés d'écran, image brute) du segment censé rester fixe ; null si un point manque. */
export function segmentAngle(
  T: RomTestInfo | null | undefined,
  sd: string | null | undefined,
  f: { lm?: readonly Landmark[]; w: number; h: number } | null | undefined,
): number | null {
  const fx = T && T.start && T.start.fixed;
  if (!fx || !f || !f.lm) return null;
  const ia = lmIndex(fx[0] ?? '', sd);
  const ib = lmIndex(fx[1] ?? '', sd);
  const a = ia === null ? undefined : f.lm[ia];
  const b = ib === null ? undefined : f.lm[ib];
  if (!a || !b || vis(a) < 0.4 || vis(b) < 0.4) return null;
  return Math.atan2((b.y - a.y) * f.h, (b.x - a.x) * f.w) * (180 / Math.PI);
}

/** Échantillon pour la vérification de départ. */
export interface StartSample {
  deg: number | null;
  vis: number;
  ratio: number | null;
  facing: number;
  visL: number;
  visR: number;
  seg: number | null;
}
/** Échantillon pour la vérification de départ : valeur du test, rapport épaules / tronc, sens du regard (image brute), visibilité G / D, segment fixe. */
export function sampleOf(
  T: RomTestInfo,
  sd: string | null | undefined,
  lm: readonly Landmark[] | null | undefined,
  w: number,
  h: number,
  world: unknown = null,
): StartSample | null {
  if (!lm) return null;
  const f = { lm, w, h, world };
  const r = (measure as (id: string, fr: unknown, side?: string | null) => { deg: number; vis: number } | null)(
    T.id,
    f,
    sd,
  );
  const ix = (k: 'sh' | 'hip', a: 'L' | 'R'): number => {
    const v = LM[k];
    return typeof v === 'object' ? v[a] : -1;
  };
  const side = (a: 'L' | 'R'): number => (vis(lm[ix('sh', a)]) + vis(lm[ix('hip', a)])) / 2;
  return {
    deg: r ? r.deg : null,
    vis: r ? r.vis : 0,
    ratio: (planeRatio as (l: readonly Landmark[], w: number, h: number) => number | null)(lm, w, h),
    facing: (facing as (fr: unknown, side: string, prefer: string) => number)(
      f,
      sd || 'L',
      T.id === 'an_df' ? 'foot' : 'head',
    ),
    visL: side('L'),
    visR: side('R'),
    seg: segmentAngle(T, sd, f),
  };
}
export const START_TH = { SIDE_MAX: 0.45, FRONT_MIN: 0.35, VIS: 0.5, VIS_DIFF: 0.3 };
/** Côté du patient tourné vers la caméra : 'R' s'il regarde vers la droite de l'image brute, 'L' vers la gauche ; à défaut, le côté le mieux vu ; null si inconnu. */
export function nearSide(s: StartSample | null | undefined): 'L' | 'R' | null {
  if (!s) return null;
  if (s.facing > 0) return 'R';
  if (s.facing < 0) return 'L';
  if (Math.abs(s.visL - s.visR) >= START_TH.VIS_DIFF) return s.visR > s.visL ? 'R' : 'L';
  return null;
}

export interface StartCheck {
  ok: boolean;
  issues: string[];
  view: boolean;
  side: boolean;
  inRange: boolean;
  near: 'L' | 'R' | null;
  deg: number | null;
}
/** Vérifie la position de départ : { ok, issues, view, side, inRange, near }. issues (par priorité) : lost, turnSide, turnFront, wrongSide, startLow, startHigh. */
export function checkStart(
  T: RomTestInfo | null | undefined,
  sd: string | null | undefined,
  s: StartSample | null | undefined,
): StartCheck {
  const st = T && T.start;
  const out: StartCheck = {
    ok: false,
    issues: [],
    view: true,
    side: true,
    inRange: false,
    near: null,
    deg: s ? s.deg : null,
  };
  if (!T || !st || !s) {
    out.issues.push('lost');
    return out;
  }
  if (s.ratio !== null) {
    if (T.view === 'side' && s.ratio > START_TH.SIDE_MAX) {
      out.view = false;
      out.issues.push('turnSide');
    } else if (T.view === 'front' && s.ratio < START_TH.FRONT_MIN) {
      out.view = false;
      out.issues.push('turnFront');
    }
  }
  out.near = nearSide(s);
  if (out.view && st.mode === 'near' && sd && !st.lying && out.near && out.near !== sd) {
    out.side = false;
    out.issues.push('wrongSide');
  }
  if (!out.issues.length) {
    if (s.deg === null || !Number.isFinite(s.deg) || s.vis < START_TH.VIS) out.issues.push('lost');
    else if (s.deg < st.lo) out.issues.push('startLow');
    else if (s.deg > st.hi) out.issues.push('startHigh');
    else out.inRange = true;
  }
  out.ok = out.issues.length === 0;
  return out;
}

export interface GateStep {
  ready: boolean;
  still: boolean;
  progress: number;
}
/** Immobilité de la position de départ : valeur du test et segment fixe stables pendant holdMs. push(now, check, sample) → { ready, still, progress }. */
export class StartGate {
  holdMs: number;
  segTol: number;
  degTol: number;
  buf: { t: number; deg: number | null; seg: number | null }[] = [];
  constructor({ holdMs = 1200, segTol = 6, degTol = 8 }: { holdMs?: number; segTol?: number; degTol?: number } = {}) {
    this.holdMs = holdMs;
    this.segTol = segTol;
    this.degTol = degTol;
    this.reset();
  }
  reset(): void {
    this.buf = [];
  }
  push(now: number, chk: StartCheck | null | undefined, s: StartSample | null | undefined): GateStep {
    if (!chk || !chk.ok || !s) {
      this.buf = [];
      return { ready: false, still: false, progress: 0 };
    }
    this.buf.push({ t: now, deg: s.deg, seg: s.seg });
    while (this.buf.length > 1 && now - (this.buf[0]?.t ?? now) > this.holdMs) this.buf.shift();
    const rng = (a: number[]): number => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    const degs = this.buf.map((x) => x.deg ?? NaN);
    const s0 = this.buf.find((x) => x.seg !== null);
    const seg0 = s0?.seg ?? 0;
    const segs = s0 ? this.buf.filter((x) => x.seg !== null).map((x) => (((x.seg ?? 0) - seg0 + 540) % 360) - 180) : [];
    const still = rng(degs) <= this.degTol && rng(segs) <= this.segTol;
    if (!still) {
      const lastE = this.buf[this.buf.length - 1];
      this.buf = lastE ? [lastE] : [];
      return { ready: false, still: false, progress: 0 };
    }
    const span = now - (this.buf[0]?.t ?? now);
    return { ready: span >= this.holdMs * 0.95, still: true, progress: clamp(span / this.holdMs, 0, 1) };
  }
}

export interface StartCue {
  key: string;
  text: string;
  say: string | null;
  icon: string;
}
/** Consigne affichée / dite pour l'étape de départ : { key, text, say (null = pas de voix), icon }. */
export function startCue(
  T: RomTestInfo,
  sd: string | null | undefined,
  chk: StartCheck,
  gate: { still: boolean; ready: boolean },
  mirror?: boolean,
): StartCue {
  const iss = chk.issues[0];
  const o = orientation(T, sd, mirror);
  if (iss === 'lost') return { key: 'find', text: t('rom_cuFind'), say: null, icon: 'eye' };
  if (iss === 'turnSide') return { key: 'turnSide', text: t('rom_cuTurnSide'), say: t('rom_cuTurnSide'), icon: 'turn' };
  if (iss === 'turnFront')
    return { key: 'turnFront', text: t('rom_cuTurnFront'), say: t('rom_cuTurnFront'), icon: 'turn' };
  if (iss === 'wrongSide') {
    const x = orientText(o);
    return { key: 'side', text: x, say: x, icon: 'turn' };
  }
  if (iss === 'startLow' || iss === 'startHigh') {
    const x = startInstr(T);
    return { key: 'start', text: x, say: x, icon: 'eye' };
  }
  if (!gate.still) return { key: 'still', text: t('rom_cuStill'), say: t('rom_cuStill'), icon: 'eye' };
  if (gate.ready) {
    const g = goInstr(T, sd);
    return { key: 'go', text: t('rom_cuGo', { g }), say: t('rom_cuGo', { g }), icon: 'ok' };
  }
  return { key: 'ok', text: t('rom_cuOk'), say: null, icon: 'ok' };
}

/** Gestionnaire de voix : une consigne n'est dite que si elle CHANGE, jamais avant la fin de la précédente (durée estimée, ≥ minGap = 2,5 s) ;
 *  la même consigne n'est répétée qu'après repeatMs. `muted` : pas d'attente (la voix est coupée). `offer` → true = à dire maintenant. */
export class Voicer {
  minGap: number;
  repeatMs: number;
  muted: boolean;
  key: string | null = null;
  at = -Infinity;
  until = -Infinity;
  constructor({
    minGap = 2500,
    repeatMs = 9000,
    muted = false,
  }: { minGap?: number; repeatMs?: number; muted?: boolean } = {}) {
    this.minGap = minGap;
    this.repeatMs = repeatMs;
    this.muted = muted;
    this.reset();
  }
  reset(): void {
    this.key = null;
    this.at = -Infinity;
    this.until = -Infinity;
  }
  idle(now: number): boolean {
    return now >= this.until;
  }
  mark(key: string, text: string, now: number, gap?: number): void {
    this.key = key;
    this.at = now;
    this.until = now + (gap ?? (this.muted ? 0 : Math.max(this.minGap, Math.min(7000, String(text).length * 62))));
  }
  offer(key: string, text: string, now: number, { gap }: { gap?: number } = {}): boolean {
    if (!text || !this.idle(now)) return false;
    if (key === this.key && !(this.repeatMs && now - this.at >= this.repeatMs)) return false;
    this.mark(key, text, now, gap);
    return true;
  }
}
