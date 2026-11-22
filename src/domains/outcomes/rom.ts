/**
 * Amplitude articulaire (ROM) : logique pure (aucun accès au DOM). Reprise de www/js/rom.js (v1.15), testée par
 * tests/rom.test.mjs à travers le module de réexportation www/js/rom.js et par rom.test.ts.
 * Le catalogue et les calculs d'angle restent dans data/romtests.js (migré par la tranche T1) : chemin legacy en attendant.
 */
import { TESTS as ROM_TESTS } from '../../../www/js/data/romtests.js';

/** Un test du catalogue (champs utilisés ici ; le catalogue en porte d'autres). */
export interface RomTestInfo {
  readonly sided?: boolean;
  readonly dir?: number;
  readonly unit?: string;
  readonly deficit?: boolean;
  readonly normal: { readonly ref: number; readonly lo?: number; readonly hi?: number };
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
