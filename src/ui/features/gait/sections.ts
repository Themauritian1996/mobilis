/**
 * Volet « marche » — sections HTML des résultats (qualité, spatio-temporel, déterminants, articulations × phases,
 * courbes, défauts, estimations). Chaque fonction reçoit des données déjà mises en forme par present.ts et renvoie
 * du HTML échappé ; la langue vient de ui.ts.
 */
import { PHASES, type GaitAnalysis } from '../../../domains/gait/index.ts';
import { esc } from '../../components/html.ts';
import { curveChartSvg, legendHtml, type ChartSeries, type ChartSpec } from './charts.ts';
import {
  JOINT_ORDER,
  SERIES_CLASS,
  captureConfidence,
  curveExtremes,
  fmtNum,
  fmtSigned,
  statusClass,
  viewQuality,
  type DeltaRow,
  type DeterminantView,
  type EstimateView,
  type FindingView,
  type JointChartData,
  type JointPhaseTable,
  type MetricCell,
  type OverlayChart,
  type SpatioRow,
  type StatusChange,
} from './present.ts';
import {
  confidenceChip,
  estimateTag,
  loc,
  metricLabel,
  refsHtml,
  sideLabel,
  statusChip,
  statusLabel,
  suggestionNote,
  t,
  viewLabel,
} from './ui.ts';

const sec = (id: string, title: string, body: string, extra = ''): string =>
  `<section class="gc-sec" aria-labelledby="gc-h-${id}"${extra}><h2 id="gc-h-${id}">${esc(title)}</h2>${body}</section>`;

// ---------------------------------------------------------------------------------------------------- Qualité
export function qualitySection(analyses: readonly GaitAnalysis[]): string {
  const views = analyses.map(viewQuality);
  const conf = captureConfidence(views);
  const reasons = conf.reasons
    .map((r) => {
      const [k, v] = r.split(':') as [string, string | undefined];
      return `<li>${esc(t(`cr_${k}`))}${v ? ` — ${esc(t(`view_${v}`))}` : ''}</li>`;
    })
    .join('');
  const cards = views
    .map(
      (v) => `<article class="gc-qcard${v.ok ? '' : ' bad'}"><h3>${esc(viewLabel(v.view))}</h3>
      <dl class="gc-kv">
      <div><dt>${esc(t('q_fps'))}</dt><dd class="gc-fps-${v.fpsLevel}">${fmtNum(v.fps, 0, loc())} ${esc(t('unit_fps'))}</dd></div>
      <div><dt>${esc(t('q_frames'))}</dt><dd>${v.frames}</dd></div>
      <div><dt>${esc(t('q_usable'))}</dt><dd>${v.usablePct} %</dd></div>
      <div><dt>${esc(t('q_feet'))}</dt><dd>${esc(t('side_L'))} ${v.footVisibilityPct.L} % · ${esc(t('side_R'))} ${v.footVisibilityPct.R} %</dd></div>
      <div><dt>${esc(t('q_interp'))}</dt><dd>${v.interpolatedPct} %</dd></div>
      <div><dt>${esc(t('q_cycles'))}</dt><dd>${esc(t('side_L'))} ${v.cycles.L} · ${esc(t('side_R'))} ${v.cycles.R}</dd></div>
      <div><dt>${esc(t('q_scale'))}</dt><dd>${esc(t(`scale_${v.scaleMethod}`))} · ± ${fmtNum(v.scaleUncertaintyPct, 1, loc())} %</dd></div></dl>
      ${v.warnings.length ? `<details><summary>${esc(t('q_warnings', { n: v.warnings.length }))}</summary><ul>${v.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}</article>`,
    )
    .join('');
  return sec(
    'quality',
    t('sec_quality'),
    `<p class="row wrap" style="gap:8px"><span>${esc(t('q_confidence'))}</span> ${confidenceChip(conf.level)}</p>
    ${reasons ? `<ul class="small gc-reasons">${reasons}</ul>` : ''}
    <div class="gc-qgrid">${cards}</div>
    <details class="small"><summary>${esc(t('q_ruleTitle'))}</summary><p>${esc(t('q_rule'))}</p></details>`,
  );
}

// ---------------------------------------------------------------------------------------------------- Spatio-temporel
function cellHtml(c: MetricCell | undefined, showNorm: boolean): string {
  if (!c) return '<td class="num">–</td>';
  const sd = c.sd !== null ? ` <small class="muted">± ${fmtNum(c.sd, 2, loc())}</small>` : '';
  const est = c.estimate ? ` ${estimateTag()}` : '';
  const norm =
    showNorm && c.normText
      ? `<div class="gc-norm small muted">${esc(t('norm_label'))} ${esc(c.normText)}${c.pctOfNorm !== null ? ` · ${c.pctOfNorm} % ${esc(t('norm_ofNorm'))}` : ''}${c.z !== null ? ` · z = ${fmtSigned(c.z, 1, loc()).replace('+', '')}` : ''}</div>`
      : '';
  return `<td class="num"><b>${esc(c.text)}</b>${sd}${est}<div class="small muted">${esc(t('conf_short'))} ${c.confidencePct} % · n = ${c.n}</div>${norm}</td>`;
}

export function spatioSection(rows: readonly SpatioRow[], speed: MetricCell | null): string {
  const hero = speed
    ? `<div class="gc-hero" role="group" aria-label="${esc(t('m_gait_speed'))}"><div class="gc-hero-v">${esc(speed.text)} <small>m/s</small></div>
        <div>${
          speed.pctOfNorm !== null
            ? `<b>${speed.pctOfNorm} %</b> ${esc(t('norm_ofNorm'))}${speed.z !== null ? ` · z = ${fmtSigned(speed.z, 1, loc()).replace('+', '')}` : ''}`
            : esc(t('norm_none'))
        }</div>${speed.normText ? `<div class="small muted">${esc(t('norm_label'))} ${esc(speed.normText)}</div>` : ''}
        ${speed.warning ? `<div class="small muted">${esc(speed.warning)}</div>` : ''}</div>`
    : '';
  const body = rows
    .map((r) => {
      const label = `<th scope="row">${esc(metricLabel(r.id))} <small class="muted">(${esc(r.unit)})</small></th>`;
      if (r.both) return `<tr>${label}<td colspan="2" class="num gc-both">${cellHtml(r.both, true).replace(/^<td class="num">|<\/td>$/g, '')}</td></tr>`;
      return `<tr>${label}${cellHtml(r.L, false)}${cellHtml(r.R, false)}</tr>`;
    })
    .join('');
  return sec(
    'spatio',
    t('sec_spatio'),
    `${hero}<div class="gc-scroll"><table class="gc-table"><caption class="sr-only">${esc(t('sec_spatio'))}</caption>
    <thead><tr><th scope="col">${esc(t('col_param'))}</th><th scope="col">${esc(t('side_left'))}</th><th scope="col">${esc(t('side_right'))}</th></tr></thead>
    <tbody>${body}</tbody></table></div><p class="small muted">${esc(t('spatio_note'))}</p>`,
  );
}

// ---------------------------------------------------------------------------------------------------- Déterminants
export function determinantsSection(list: readonly DeterminantView[]): string {
  const cards = list
    .map((d) => {
      const inds = d.indicators
        .map(
          (i) => `<tr><th scope="row">${esc(i.label)}${i.side ? ` <small class="muted">(${esc(sideLabel(i.side))})</small>` : ''}${i.estimate ? ` ${estimateTag()}` : ''}</th>
          <td class="num">${esc(i.valueText)}</td><td>${esc(i.target)}${i.targetToVerify ? ` <span class="gc-tv">${esc(t('ref_toVerify'))}</span>` : ''}</td><td>${statusChip(i.status)}</td><td class="small">${esc(i.explanation)}</td></tr>`,
        )
        .join('');
      const linked = d.linkedFindings.length
        ? `<p class="small"><b>${esc(t('det_linked'))}</b> ${d.linkedFindings.map((f) => esc(`${f.id} (${sideLabel(f.side)}, ${t('fst_' + f.status)})`)).join(' · ')}</p>`
        : '';
      return `<article class="gc-det ${statusClass(d.status)}" aria-labelledby="gc-d-${esc(d.id)}">
        <header><span class="gc-det-n" aria-hidden="true">${d.n}</span><h3 id="gc-d-${esc(d.id)}">${esc(d.name)}</h3>${statusChip(d.status)}</header>
        <p>${esc(d.explanation)}</p>
        <details><summary>${esc(t('det_details'))}</summary>
          <div class="gc-scroll"><table class="gc-table small"><thead><tr><th scope="col">${esc(t('col_indicator'))}</th><th scope="col">${esc(t('col_value'))}</th><th scope="col">${esc(t('col_target'))}</th><th scope="col">${esc(t('col_status'))}</th><th scope="col">${esc(t('col_why'))}</th></tr></thead><tbody>${inds}</tbody></table></div>
          ${linked}<p class="small"><b>${esc(t('det_goal'))}</b> ${esc(d.restorationGoal)}</p>${refsHtml(d.references)}
        </details></article>`;
    })
    .join('');
  return sec(
    'det',
    t('sec_determinants'),
    `<p class="small muted">${esc(t('det_intro'))}</p><div class="gc-detgrid">${cards}</div><details class="small"><summary>${esc(t('det_critique'))}</summary><p>${esc(t('det_critiqueBody'))}</p></details>`,
  );
}

// ---------------------------------------------------------------------------------------------------- Articulations × phases
export function jointPhaseSection(tbl: JointPhaseTable): string {
  const head = tbl.phases
    .map((p) => {
      const info = PHASES.find((x) => x.id === p);
      return `<th scope="col"><abbr title="${esc(info ? (loc().startsWith('fr') ? info.name_fr : info.name_en) : p)}">${esc(p)}</abbr></th>`;
    })
    .join('');
  const rows = tbl.rows
    .map((r) => {
      const cells = r.cells
        .map((c) =>
          c
            ? `<td class="gc-jp ${statusClass(c.status)}" title="${esc(c.label + ' — ' + c.explanation)}"><span aria-hidden="true">${c.status === 'affected' ? '✗' : c.status === 'preserved' ? '✓' : '?'}</span> <span class="sr-only">${esc(statusLabel(c.status))}</span><b>${esc(c.valueText)}</b>${c.estimate ? ` <small>${esc(t('est_tag'))}</small>` : ''}</td>`
            : '<td class="gc-jp none" aria-label="–">·</td>',
        )
        .join('');
      return `<tr><th scope="row">${esc(t(`joint_${r.joint}`))} <small class="muted">${esc(sideLabel(r.side))}</small></th>${cells}</tr>`;
    })
    .join('');
  const notes = tbl.rows.flatMap((r) =>
    r.cells.flatMap((c, i) =>
      c && c.status !== 'preserved'
        ? [`<li><b>${esc(t(`joint_${r.joint}`))} ${esc(sideLabel(r.side))} · ${esc(tbl.phases[i] ?? '')}</b> — ${statusChip(c.status)} ${esc(c.label)} : ${esc(c.valueText)} (${esc(c.target)}). ${esc(c.explanation)}</li>`]
        : [],
    ),
  );
  void JOINT_ORDER;
  return sec(
    'joints',
    t('sec_jointPhases'),
    `<div class="gc-scroll"><table class="gc-table gc-jtable"><caption class="sr-only">${esc(t('sec_jointPhases'))}</caption><thead><tr><th scope="col">${esc(t('col_joint'))}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted">${esc(t('jp_legend'))}</p>
    ${notes.length ? `<details><summary>${esc(t('jp_notes', { n: notes.length }))}</summary><ul class="gc-notes">${notes.join('')}</ul></details>` : ''}`,
  );
}

// ---------------------------------------------------------------------------------------------------- Courbes
const JOINT_NAME = (j: string): string => t(`joint_${j}`);

function describeSeries(label: string, mean: readonly number[], unit: string): string {
  const x = curveExtremes(mean);
  if (!x) return '';
  return t('curve_desc_series', {
    label,
    min: fmtNum(x.min, 0, loc()),
    minAt: x.minAt,
    max: fmtNum(x.max, 0, loc()),
    maxAt: x.maxAt,
    unit,
  });
}

export function curvesSection(charts: readonly JointChartData[]): string {
  if (!charts.length) return sec('curves', t('sec_curves'), `<p class="muted">${esc(t('curves_none'))}</p>`);
  const html = charts
    .map((c) => {
      const series: ChartSeries[] = c.series.map((s) => ({
        id: s.side,
        label: `${sideLabel(s.side)} (n = ${s.n})`,
        mean: s.mean,
        sd: s.sd,
        cls: SERIES_CLASS[s.side],
        dashed: s.side === 'R',
      }));
      const spec: ChartSpec = {
        id: `j-${c.joint}`,
        title: `${JOINT_NAME(c.joint)} — ${t('curve_title_suffix')}`,
        unit: c.unit,
        series,
        band: c.band ? { lo: c.band.lo, hi: c.band.hi, label: t('curve_band') } : null,
        desc: `${JOINT_NAME(c.joint)}. ${series.map((s) => describeSeries(s.label, s.mean, c.unit)).join(' ')}`,
        xLabel: t('curve_x'),
      };
      return `<figure class="gc-fig">${curveChartSvg(spec)}<figcaption><b>${esc(JOINT_NAME(c.joint))}</b> ${legendHtml(spec)}${c.band ? `<span class="small muted">${esc(t('curve_bandNote'))}</span>` : ''}</figcaption></figure>`;
    })
    .join('');
  return sec('curves', t('sec_curves'), `<p class="small muted">${esc(t('curves_intro'))}</p><div class="gc-figgrid">${html}</div>`);
}

/** Courbes A (pointillé) et B (plein) superposées pour la comparaison. */
export function overlaySection(charts: readonly OverlayChart[], labelA: string, labelB: string): string {
  if (!charts.length) return sec('curves', t('sec_curves'), `<p class="muted">${esc(t('curves_none'))}</p>`);
  const html = charts
    .map((c) => {
      const series: ChartSeries[] = [
        { id: 'a', label: `A — ${labelA}`, mean: c.a.mean, sd: c.a.sd, cls: 's2', dashed: true },
        { id: 'b', label: `B — ${labelB}`, mean: c.b.mean, sd: c.b.sd, cls: 's0' },
      ];
      const name = `${JOINT_NAME(c.joint)} — ${sideLabel(c.side)}`;
      const spec: ChartSpec = {
        id: `o-${c.joint}-${c.side}`,
        title: name,
        unit: '°',
        series,
        band: c.band ? { lo: c.band.lo, hi: c.band.hi, label: t('curve_band') } : null,
        desc: `${name}. ${series.map((s) => describeSeries(s.label, s.mean, '°')).join(' ')}`,
        xLabel: t('curve_x'),
      };
      return `<figure class="gc-fig">${curveChartSvg(spec)}<figcaption><b>${esc(name)}</b> ${legendHtml(spec)}</figcaption></figure>`;
    })
    .join('');
  return sec('curves', t('sec_curves'), `<div class="gc-figgrid">${html}</div>`);
}

// ---------------------------------------------------------------------------------------------------- Défauts
export function findingsSection(list: readonly FindingView[], insufficient: number, titleKey = 'sec_findings'): string {
  const cards = list
    .map((f) => {
      const why = f.why
        .map(
          (c) =>
            `<li><span class="gc-role">${esc(t(`role_${c.role}`))}</span> ${esc(c.text)} — <b>${esc(c.valueText)}</b>${c.anomalyText ? ` <small class="muted">(${esc(t('why_anomaly'))} ${esc(c.anomalyText)}${c.confidentText ? `, ${esc(t('why_confident'))} ${esc(c.confidentText)}` : ''})</small>` : ''}${c.agreementPct !== null ? ` <small class="muted">${esc(t('why_cycles', { p: c.agreementPct }))}</small>` : ''}${c.estimate ? ` ${estimateTag()}` : ''}${c.thresholdStatus === 'proposed_heuristic' || c.thresholdStatus === 'to_verify' ? ` <span class="gc-tv">${esc(t('why_unvalidated'))}</span>` : ''}</li>`,
        )
        .join('');
      const list_ = (title: string, items: readonly string[]): string =>
        items.length ? `<h4>${esc(title)}</h4><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
      return `<article class="gc-find ${f.status}" aria-labelledby="gc-f-${esc(f.key)}">
        <header><h3 id="gc-f-${esc(f.key)}">${esc(f.name)}</h3><span class="chip ${f.status === 'probable' ? 'neg' : 'warn'}">${esc(t(`fst_${f.status}`))}</span><span class="chip">${esc(sideLabel(f.side))}</span><span class="chip">${esc(t('find_conf', { p: f.confidencePct }))}</span>${f.estimate ? estimateTag() : ''}</header>
        <h4>${esc(t('find_why'))}</h4><ul class="gc-why">${why}</ul>
        ${list_(t('find_causes'), f.causes)}${list_(t('find_diff'), f.differentials)}
        ${f.suggestions.length ? `<h4>${esc(t('find_suggestions'))}</h4>${suggestionNote()}<ul>${f.suggestions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${f.camera2dLimits ? `<p class="small muted"><b>${esc(t('find_limits'))}</b> ${esc(f.camera2dLimits)}</p>` : ''}
        ${f.unvalidated.length ? `<p class="small muted">${esc(t('find_unvalidated'))} ${esc(f.unvalidated.join(' ; '))}</p>` : ''}
        ${refsHtml(f.references)}</article>`;
    })
    .join('');
  return sec(
    titleKey === 'sec_findings' ? 'findings' : 'prosth',
    t(titleKey),
    `<p class="small muted">${esc(t('find_intro'))}</p>${cards || `<p class="card flat">${esc(t('find_none'))}</p>`}${insufficient ? `<p class="small muted">${esc(t('find_insufficient', { n: insufficient }))}</p>` : ''}`,
  );
}

// ---------------------------------------------------------------------------------------------------- Estimations
export function estimatesSection(e: { featured: readonly EstimateView[]; others: readonly EstimateView[] }): string {
  if (!e.featured.length && !e.others.length) return '';
  const rows = (l: readonly EstimateView[]): string =>
    l
      .map(
        (x) =>
          `<tr><th scope="row">${esc(metricLabel(x.id))}${x.side ? ` <small class="muted">(${esc(sideLabel(x.side))})</small>` : ''} ${estimateTag()}</th><td class="num"><b>${esc(x.valueText)}</b> ${esc(x.unit)}</td><td class="small muted">${esc(t('conf_short'))} ${x.confidencePct} % · ${esc(viewLabel(x.view))}</td></tr>`,
      )
      .join('');
  const table = (l: readonly EstimateView[]): string =>
    `<div class="gc-scroll"><table class="gc-table"><tbody>${rows(l)}</tbody></table></div>`;
  return sec(
    'est',
    t('sec_estimates'),
    `<p class="small muted">${esc(t('est_intro'))}</p>
    ${e.featured.length ? `<div class="gc-limit"><h3>${esc(t('est_featured'))}</h3>${table(e.featured)}</div>` : `<p class="small">${esc(t('est_noneLimiting'))}</p>`}
    ${e.others.length ? `<details><summary>${esc(t('est_others', { n: e.others.length }))}</summary>${table(e.others)}</details>` : ''}`,
  );
}

// ---------------------------------------------------------------------------------------------------- Comparaison
export function deltaSection(rows: readonly DeltaRow[]): string {
  const body = rows
    .map((r) => {
      const verdict = r.significant
        ? r.towardNorm === true
          ? `<span class="chip pos">${esc(t('cmp_towardNorm'))}</span>`
          : r.towardNorm === false
            ? `<span class="chip neg">${esc(t('cmp_awayNorm'))}</span>`
            : `<span class="chip">${esc(t('cmp_significant'))}</span>`
        : `<span class="chip">${esc(t('cmp_notSignificant'))}</span>`;
      return `<tr class="${r.significant ? 'sig' : ''}"><th scope="row">${esc(metricLabel(r.id))}${r.side ? ` <small class="muted">(${esc(sideLabel(r.side))})</small>` : ''} <small class="muted">${esc(r.unit)}</small>${r.estimate ? ` ${estimateTag()}` : ''}</th>
        <td class="num">${esc(r.a)}</td><td class="num">${esc(r.b)}</td><td class="num"><b>${esc(r.delta)}</b></td><td class="num" title="${esc(r.marginSource)}">${esc(r.margin)}</td><td>${verdict}</td></tr>`;
    })
    .join('');
  return sec(
    'delta',
    t('sec_deltas'),
    `<p class="small muted">${esc(t('cmp_intro'))}</p><div class="gc-scroll"><table class="gc-table gc-delta"><caption class="sr-only">${esc(t('sec_deltas'))}</caption>
    <thead><tr><th scope="col">${esc(t('col_param'))}</th><th scope="col">A</th><th scope="col">B</th><th scope="col">${esc(t('cmp_delta'))}</th><th scope="col">${esc(t('cmp_margin'))}</th><th scope="col">${esc(t('cmp_verdict'))}</th></tr></thead><tbody>${body}</tbody></table></div>`,
  );
}

export function changesSection(
  title: string,
  rows: readonly StatusChange[],
  name: (c: StatusChange) => string,
  statusText: (s: string) => string,
): string {
  const body = rows.length
    ? `<ul class="gc-changes">${rows
        .map(
          (c) =>
            `<li class="${c.direction}"><b>${esc(name(c))}</b>${c.side ? ` <small class="muted">(${esc(sideLabel(c.side))})</small>` : ''} : ${esc(statusText(c.a))} → ${esc(statusText(c.b))} <span class="chip ${c.direction === 'better' ? 'pos' : c.direction === 'worse' ? 'neg' : ''}">${esc(t(`cmp_${c.direction}`))}</span></li>`,
        )
        .join('')}</ul>`
    : `<p class="muted">${esc(t('cmp_noChange'))}</p>`;
  return sec(title === 'sec_detChanges' ? 'dch' : 'fch', t(title), body);
}
