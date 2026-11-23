/**
 * Volet « marche » — courbes moyennes ± ET sur le cycle 0–100 % : SVG fait main, léger (aucune bibliothèque),
 * accessible (`role="img"` + titre + description textuelle ; les couleurs viennent de classes CSS `.gc-*` de gait.css,
 * les séries se distinguent aussi par le tracé : pointillé pour B ou le côté droit). Fonctions pures.
 */
import { PHASES } from '../../../domains/gait/index.ts';
import { esc } from '../../components/html.ts';

export type SeriesClass = 's0' | 's1' | 's2' | 's3';

export interface ChartSeries {
  readonly id: string;
  readonly label: string;
  /** 101 valeurs (0–100 %) ; NaN = trou. */
  readonly mean: readonly number[];
  readonly sd?: readonly number[];
  readonly cls: SeriesClass;
  readonly dashed?: boolean;
}

export interface ChartBand {
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  readonly label: string;
}

export interface ChartSpec {
  readonly id: string;
  readonly title: string;
  readonly unit: string;
  readonly series: readonly ChartSeries[];
  readonly band?: ChartBand | null;
  /** Description textuelle (lecteurs d'écran) : valeurs clés par série. */
  readonly desc: string;
  readonly xLabel: string;
  readonly width?: number;
  readonly height?: number;
}

const W = 560;
const H = 280;
const M = { l: 44, r: 12, t: 22, b: 36 };

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Pas « agréable » (1, 2, 5 × 10^k) pour environ `n` graduations. */
export function niceStep(range: number, n = 5): number {
  const raw = range / n;
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Domaine vertical : séries ± ET et bande, élargi aux graduations. */
export function yDomain(spec: Pick<ChartSpec, 'series' | 'band'>): { lo: number; hi: number; step: number } {
  let lo = Infinity;
  let hi = -Infinity;
  const eat = (v: number): void => {
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  };
  for (const s of spec.series)
    s.mean.forEach((m, i) => {
      const e = s.sd?.[i] ?? 0;
      eat(m - (Number.isFinite(e) ? e : 0));
      eat(m + (Number.isFinite(e) ? e : 0));
    });
  spec.band?.lo.forEach(eat);
  spec.band?.hi.forEach(eat);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: -1, hi: 1, step: 1 };
  if (hi - lo < 4) {
    const c = (hi + lo) / 2;
    lo = c - 2;
    hi = c + 2;
  }
  const step = niceStep(hi - lo);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

/** Tracé « M x y L x y … » en coupant aux trous (NaN). */
export function linePath(values: readonly number[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${f1(x(i))} ${f1(y(v))}`;
    pen = true;
  });
  return d;
}

/** Polygone « bande » entre deux séries (segments continus uniquement). */
export function bandPath(
  lo: readonly number[],
  hi: readonly number[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let start = -1;
  const ok = (i: number): boolean => Number.isFinite(lo[i]) && Number.isFinite(hi[i]);
  const flush = (end: number): void => {
    if (start < 0) return;
    let up = '';
    let down = '';
    for (let i = start; i <= end; i++) up += `${i === start ? 'M' : 'L'}${f1(x(i))} ${f1(y(hi[i] as number))}`;
    for (let i = end; i >= start; i--) down += `L${f1(x(i))} ${f1(y(lo[i] as number))}`;
    d += `${up}${down}Z`;
    start = -1;
  };
  for (let i = 0; i < Math.min(lo.length, hi.length); i++) {
    if (ok(i)) {
      if (start < 0) start = i;
    } else flush(i - 1);
  }
  flush(Math.min(lo.length, hi.length) - 1);
  return d;
}

/** Courbe(s) moyenne(s) ± ET superposée(s) à la bande normale. */
export function curveChartSvg(spec: ChartSpec): string {
  const w = spec.width ?? W;
  const h = spec.height ?? H;
  const pw = w - M.l - M.r;
  const ph = h - M.t - M.b;
  const d = yDomain(spec);
  const x = (i: number): number => M.l + (i / 100) * pw;
  const y = (v: number): number => M.t + (1 - (v - d.lo) / (d.hi - d.lo)) * ph;
  const tid = `gc-t-${esc(spec.id)}`;
  const did = `gc-d-${esc(spec.id)}`;
  const parts: string[] = [];
  // Graduations verticales
  for (let v = d.lo; v <= d.hi + 1e-9; v += d.step) {
    const yy = y(v);
    parts.push(
      `<line class="gc-grid${Math.abs(v) < 1e-9 ? ' gc-zero' : ''}" x1="${M.l}" x2="${w - M.r}" y1="${f1(yy)}" y2="${f1(yy)}"/>`,
      `<text class="gc-tick" x="${M.l - 6}" y="${f1(yy + 4)}" text-anchor="end">${f1(v)}</text>`,
    );
  }
  // Phases de Perry (repères, décoratifs)
  const marks = PHASES.map((p) => {
    const mid = (p.startPct + p.endPct) / 2;
    return `<line class="gc-phase" x1="${f1(x(p.endPct))}" x2="${f1(x(p.endPct))}" y1="${M.t}" y2="${M.t + ph}"/><text class="gc-phase-t" x="${f1(x(mid))}" y="${M.t - 8}" text-anchor="middle">${esc(p.id)}</text>`;
  });
  parts.push(`<g aria-hidden="true">${marks.join('')}</g>`);
  for (const p of [0, 25, 50, 75, 100])
    parts.push(`<text class="gc-tick" x="${f1(x(p))}" y="${h - M.b + 16}" text-anchor="middle">${p}</text>`);
  parts.push(
    `<text class="gc-axis" x="${f1(M.l + pw / 2)}" y="${h - 4}" text-anchor="middle">${esc(spec.xLabel)}</text>`,
  );
  parts.push(
    `<text class="gc-axis" transform="rotate(-90)" x="${-f1(M.t + ph / 2)}" y="12" text-anchor="middle">${esc(spec.unit)}</text>`,
  );
  if (spec.band) parts.push(`<path class="gc-band" d="${bandPath(spec.band.lo, spec.band.hi, x, y)}"/>`);
  for (const s of spec.series) {
    if (s.sd) {
      const lo = s.mean.map((m, i) => m - (s.sd?.[i] ?? 0));
      const hi = s.mean.map((m, i) => m + (s.sd?.[i] ?? 0));
      parts.push(`<path class="gc-sd gc-${s.cls}" d="${bandPath(lo, hi, x, y)}"/>`);
    }
  }
  for (const s of spec.series)
    parts.push(`<path class="gc-line gc-${s.cls}${s.dashed ? ' gc-dash' : ''}" d="${linePath(s.mean, x, y)}"/>`);
  return `<svg class="gc-svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${tid} ${did}" preserveAspectRatio="xMidYMid meet"><title id="${tid}">${esc(spec.title)}</title><desc id="${did}">${esc(spec.desc)}</desc>${parts.join('')}</svg>`;
}

/** Légende HTML (couleur + tracé + libellé) d'un graphique. */
export function legendHtml(spec: Pick<ChartSpec, 'series' | 'band'>): string {
  const items = spec.series.map(
    (s) =>
      `<li><svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true"><path class="gc-line gc-${s.cls}${s.dashed ? ' gc-dash' : ''}" d="M0 5H28"/></svg><span>${esc(s.label)}</span></li>`,
  );
  if (spec.band)
    items.push(
      `<li><svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true"><rect class="gc-band" x="0" y="1" width="28" height="8"/></svg><span>${esc(spec.band.label)}</span></li>`,
    );
  return `<ul class="gc-legend">${items.join('')}</ul>`;
}
