// Graphiques SVG de l'écran « Progrès » (reprise de www/js/app.js) : courbes hebdomadaires / journal et barres d'assiduité.

/** Série d'une courbe : `get` extrait la valeur d'une ligne (null / undefined = point absent). */
export interface ChartSeries<R> {
  get: (row: R) => number | null | undefined;
  color: string;
}

export interface LineChartOptions<R> {
  max?: number;
  h?: number;
  label?: (row: R) => string | number;
}

/** Une semaine d'assiduité (sorties de `program.weeklyStats`). */
export interface WeekBar {
  week: number | string;
  sessions: number;
  planned: number;
}

export function lineChart<R>(
  rows: R[],
  series: ChartSeries<R>[],
  {
    max = 10,
    h = 150,
    label = (r: R) => 'S' + String((r as { week?: number | string }).week),
  }: LineChartOptions<R> = {},
): string {
  const W = 320,
    H = h,
    pad = 26,
    n = rows.length;
  const x = (i: number) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i * (W - pad - 12)) / (n - 1));
  const y = (v: number) => H - 20 - (v / max) * (H - 36);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (const gv of [0, max / 2, max])
    s += `<line class="ax${gv === 0 ? ' base' : ''}" x1="${pad}" x2="${W - 8}" y1="${y(gv)}" y2="${y(gv)}"/><text x="4" y="${y(gv) + 3}">${gv}</text>`;
  const every = Math.ceil(n / 8);
  rows.forEach((r, i) => {
    if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${label(r)}</text>`;
  });
  for (const se of series) {
    const pts: [number, number][] = [];
    rows.forEach((r, i) => {
      const v = se.get(r);
      if (v !== null && v !== undefined) pts.push([x(i), v]);
    });
    if (pts.length > 1)
      s += `<polyline points="${pts.map((p) => `${p[0]},${y(p[1])}`).join(' ')}" fill="none" stroke="${se.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(
      (p, i) =>
        (s += `<circle cx="${p[0]}" cy="${y(p[1])}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${i === pts.length - 1 ? se.color : 'var(--surface)'}" stroke="${se.color}" stroke-width="2"/>`),
    );
  }
  return s + '</svg>';
}

export function barChart(rows: WeekBar[]): string {
  const W = 320,
    H = 120,
    pad = 18,
    n = Math.max(1, rows.length),
    bw = Math.max(2, Math.min(26, (W - pad * 2) / n - (n > 20 ? 2 : 8))),
    every = Math.ceil(n / 10);
  const max = Math.max(...rows.map((r) => Math.max(r.sessions, r.planned)), 1);
  const y = (v: number) => H - 20 - (v / max) * (H - 32);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img"><line class="ax base" x1="${pad}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => {
    const cx = pad + ((i + 0.5) * (W - pad * 2)) / n;
    s += `<rect x="${cx - bw / 2}" y="${y(r.planned)}" width="${bw}" height="${y(0) - y(r.planned)}" rx="5" fill="var(--surface-2)"/>`;
    if (r.sessions)
      s += `<rect x="${cx - bw / 2}" y="${y(Math.min(r.sessions, max))}" width="${bw}" height="${y(0) - y(Math.min(r.sessions, max))}" rx="5" fill="${r.sessions >= r.planned ? 'var(--pos)' : 'var(--brand)'}"/>`;
    if (i % every === 0 || i === n - 1) s += `<text x="${cx}" y="${H - 4}" text-anchor="middle">S${r.week}</text>`;
  });
  return s + '</svg>';
}
