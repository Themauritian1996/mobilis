// Comparaison et export d'une étude (#/etude/<studyId>) : tableau patients × points dans le temps × mesures, deltas par
// rapport à T0, moyenne ± ET, seuil de changement connu, courbes superposées, notes ; exports CSV (long), JSON, PDF.
import type { MeasureDefinition, Timepoint } from '../../../core/types/clinical.ts';
import {
  buildJsonExport,
  buildPdfModel,
  buildStudyData,
  deltasFromBaseline,
  exportFileName,
  loadStudyBundle,
  meanCurves,
  renderPdfModel,
  summarizeStudy,
  toCsvLong,
  type CellSummary,
  type Observation,
  type StudyBundle,
  type StudyData,
} from '../../../domains/research/index.ts';
import type { JsPdfConstructor } from '../../../domains/outcomes/report-pdf.ts';
import { loadJsPDF } from '../../../platform/files.ts';
import { getLang } from '../../../../www/js/i18n.js';
import { saveFile } from '../../components/files.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { banner, db, digitsFor, ensureCss, errMsg, esc, fmtNum, t, topbar } from './shared.ts';

const COLORS = ['#2747d4', '#e07a2e', '#16a36b', '#9b4dca', '#c22f29', '#5b6b7f'];

const notesKey = (id: string): string => `mobilis.research.notes.${id}`;
function readNotes(id: string): string {
  try {
    return localStorage.getItem(notesKey(id)) ?? '';
  } catch {
    return '';
  }
}
function writeNotes(id: string, v: string): void {
  try {
    localStorage.setItem(notesKey(id), v);
  } catch {
    /* stockage indisponible : les notes restent dans la page */
  }
}

/** Courbes superposées (101 points) : une ligne par point dans le temps. */
export function overlaySvg(series: { label: string; color: string; mean: readonly number[] }[], unit: string): string {
  const all = series.flatMap((s) => s.mean.filter(Number.isFinite));
  if (!all.length) return '';
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1) {
    lo -= 1;
    hi += 1;
  }
  const W = 320;
  const H = 170;
  const L = 34;
  const B = 22;
  const x = (k: number): number => L + (k / 100) * (W - L - 8);
  const y = (v: number): number => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
  let s = `<svg class="rs-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((x) => x.label).join(', '))} (${esc(unit)})">`;
  for (const v of [lo, (lo + hi) / 2, hi])
    s += `<line class="ax" x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 3}">${fmtNum(v, 0)}</text>`;
  for (const k of [0, 25, 50, 75, 100]) s += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${k}</text>`;
  for (const se of series) {
    const pts = se.mean
      .map((v, k) => (Number.isFinite(v) ? `${x(k).toFixed(1)},${y(v).toFixed(1)}` : ''))
      .filter(Boolean)
      .join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  return s + '</svg>';
}

/** Moyenne ± ET par point dans le temps (barres d'erreur). */
function meanSvg(cells: readonly CellSummary[], tps: readonly Timepoint[], unit: string): string {
  const pts = tps
    .map((tp, i) => ({ i, c: cells.find((c) => c.timepointId === tp.id) }))
    .filter((p): p is { i: number; c: CellSummary } => !!p.c && p.c.mean !== null);
  if (pts.length < 2) return '';
  const vals = pts.flatMap((p) => [p.c.mean! - (p.c.sd ?? 0), p.c.mean! + (p.c.sd ?? 0)]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const W = 320;
  const H = 140;
  const L = 40;
  const x = (i: number): number => L + (tps.length <= 1 ? 0 : (i / (tps.length - 1)) * (W - L - 16));
  const y = (v: number): number => 10 + (1 - (v - lo) / (hi - lo)) * (H - 40);
  const d = digitsFor(unit);
  let s = `<svg class="rs-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('rs_meanSd'))}">`;
  for (const v of [lo, hi])
    s += `<line class="ax" x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 3}">${fmtNum(v, d)}</text>`;
  tps.forEach((tp, i) => (s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(tp.label)}</text>`));
  s += `<polyline points="${pts.map((p) => `${x(p.i)},${y(p.c.mean!)}`).join(' ')}" fill="none" stroke="var(--brand)" stroke-width="2"/>`;
  for (const p of pts) {
    const sd = p.c.sd ?? 0;
    s += `<line x1="${x(p.i)}" x2="${x(p.i)}" y1="${y(p.c.mean! - sd)}" y2="${y(p.c.mean! + sd)}" stroke="var(--brand)" stroke-width="1.5"/><circle cx="${x(p.i)}" cy="${y(p.c.mean!)}" r="3.5" fill="var(--brand)"/>`;
  }
  return s + '</svg>';
}

function patientTable(
  m: MeasureDefinition,
  tps: readonly Timepoint[],
  obs: readonly Observation[],
  anon: boolean,
  deltas: ReturnType<typeof deltasFromBaseline>,
): string {
  const rows = obs.filter((o) => o.measureId === m.id);
  if (!rows.length) return `<p class="small muted">${esc(t('rs_noData'))}</p>`;
  const keys = [...new Map(rows.map((o) => [`${o.patientId}|${o.condition}`, o])).values()];
  const d = digitsFor(rows[0]!.unit);
  const head = `<tr><th scope="col">${esc(t('rs_patient'))}</th>${tps.map((tp) => `<th scope="col">${esc(tp.label)}</th>`).join('')}</tr>`;
  const body = keys
    .map((k) => {
      const cells = tps
        .map((tp) => {
          const o = rows.find(
            (r) => r.patientId === k.patientId && r.condition === k.condition && r.timepointId === tp.id,
          );
          if (!o) return '<td class="muted">–</td>';
          const dl = deltas.find(
            (x) =>
              x.patientId === o.patientId &&
              x.measureId === m.id &&
              x.timepointId === tp.id &&
              x.condition === o.condition,
          );
          const flag = o.estimate ? ` <abbr class="rs-est" title="${esc(t('rs_estimate'))}">≈</abbr>` : '';
          const low = o.confidence < 0.5 ? ` <span class="chip sm warn" title="${esc(t('rs_lowConf'))}">!</span>` : '';
          const delta = dl
            ? `<br><small class="${dl.beyondThreshold ? 'rs-beyond' : 'muted'}">${dl.delta > 0 ? '+' : ''}${fmtNum(dl.delta, d)}</small>`
            : '';
          return `<td class="tnum">${fmtNum(o.value, d)}${flag}${low}${delta}</td>`;
        })
        .join('');
      const who = anon ? k.researchId : `${k.researchId} · ${k.displayName}`;
      return `<tr><th scope="row">${esc(who)}${k.condition ? `<br><small class="muted">${esc(k.condition)}</small>` : ''}</th>${cells}</tr>`;
    })
    .join('');
  return `<div class="rs-tablewrap"><table class="rs-table">${head}${body}</table></div>`;
}

function summaryTable(cells: readonly CellSummary[], tps: readonly Timepoint[]): string {
  const label = new Map(tps.map((x) => [x.id, x.label]));
  return `<div class="rs-tablewrap"><table class="rs-table"><tr><th scope="col"></th><th scope="col">n</th><th scope="col">${esc(t('rs_meanSd'))}</th><th scope="col">${esc(t('rs_delta'))}</th><th scope="col">${esc(t('rs_threshold'))}</th></tr>${cells
    .map((c) => {
      const d = digitsFor(c.unit);
      const thr = c.threshold
        ? `${esc(t('rs_thr_' + c.threshold.kind))} ${fmtNum(c.threshold.value, 2)} ${esc(c.threshold.unit)}${c.threshold.status === 'to_verify' ? ` <span class="chip sm warn">${esc(t('rs_toVerify'))}</span>` : ''}${c.nPaired && c.nBeyondThreshold !== null ? `<br><small>${esc(t('rs_beyond', { a: c.nBeyondThreshold, b: c.nPaired }))}</small>` : ''}`
        : '–';
      return `<tr><th scope="row">${esc(label.get(c.timepointId) ?? c.timepointId)}${c.condition ? `<br><small class="muted">${esc(c.condition)}</small>` : ''}</th><td class="tnum">${c.n}</td><td class="tnum">${c.mean === null ? '–' : `${fmtNum(c.mean, d)}${c.sd !== null ? ` ± ${fmtNum(c.sd, d)}` : ''} ${esc(c.unit)}`}</td><td class="tnum">${c.deltaMean === null ? '–' : `${c.deltaMean > 0 ? '+' : ''}${fmtNum(c.deltaMean, d)}${c.deltaSd !== null ? ` ± ${fmtNum(c.deltaSd, d)}` : ''}`}</td><td class="small">${thr}</td></tr>`;
    })
    .join('')}</table></div>`;
}

export async function viewStudy(root: HTMLElement, studyId: string | undefined): Promise<void> {
  ensureCss();
  root.innerHTML = `<section class="screen rs"><div class="card muted">${esc(t('rs_loading'))}</div></section>`;
  let bundle: StudyBundle | null = null;
  try {
    bundle = studyId ? await loadStudyBundle(db(), studyId) : null;
  } catch (e) {
    root.innerHTML = `<section class="screen rs">${topbar(t('rs_studyTitle'), '#/recherche')}<div class="card neg">${esc(t('rs_error', { msg: errMsg(e) }))}</div></section>`;
    return;
  }
  if (!bundle) {
    root.innerHTML = `<section class="screen rs">${topbar(t('rs_studyTitle'), '#/recherche')}<div class="card">${esc(t('rs_studyNotFound'))}</div></section>`;
    return;
  }
  const { study } = bundle;
  const data: StudyData = buildStudyData(study, bundle.patients, bundle.assessments, bundle.followups);
  const summary = summarizeStudy(study, data);
  const deltas = deltasFromBaseline(study, data.observations);
  const curves = meanCurves(study, data.curves);
  const anonView = study.anonymizeExports;
  const sections = study.measures
    .map((m) => {
      if (m.kind === 'gait_curve') {
        const cs = curves.filter((c) => c.measureId === m.id);
        const series = cs.map((c, i) => ({
          label: `${study.timepoints.find((x) => x.id === c.timepointId)?.label ?? c.timepointId}${c.condition ? ` (${c.condition})` : ''} · n=${c.n}`,
          color: COLORS[i % COLORS.length]!,
          mean: c.mean,
        }));
        return `<article class="card rs-sec"><h3>${esc(m.label)}</h3>${series.length ? `${overlaySvg(series, cs[0]!.unit)}<div class="rs-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div><p class="small muted">${esc(t('rs_cyclePct'))}</p>` : `<p class="small muted">${esc(t('rs_noData'))}</p>`}</article>`;
      }
      const cells = summary.filter((c) => c.measureId === m.id);
      const est = m.kind === 'custom_angle' || data.observations.some((o) => o.measureId === m.id && o.estimate);
      return `<article class="card rs-sec"><h3>${esc(m.label)}${est ? ` <span class="chip sm warn">${esc(t('rs_estimate'))}</span>` : ''}</h3>
        ${meanSvg(
          cells.filter((c) => c.condition === (cells[0]?.condition ?? '')),
          study.timepoints,
          cells.find((c) => c.unit)?.unit ?? '',
        )}
        <h4>${esc(t('rs_summary'))}</h4>${summaryTable(cells, study.timepoints)}
        <details><summary class="small">${esc(t('rs_table'))}</summary>${patientTable(m, study.timepoints, data.observations, anonView, deltas)}</details></article>`;
    })
    .join('');
  root.innerHTML = `<section class="screen rs">${topbar(study.name, '#/recherche')}${banner()}
    <p class="small muted">${esc(t('rs_nPatients', { n: study.patientIds.length }))} · ${study.timepoints.map((x) => esc(x.label)).join(' → ')}</p>
    <div class="row wrap"><button class="btn sm ghost" data-go="#/recherche/edit/${esc(study.id)}">${esc(t('rs_edit'))}</button></div>
    <div aria-live="polite">${sections}</div>
    <p class="small muted">${esc(t('rs_thrNote'))}</p>
    <h2>${esc(t('rs_notes'))}</h2><label class="field"><span class="small muted">${esc(t('rs_notesHint'))}</span><textarea class="input" id="rs-notes" rows="4">${esc(readNotes(study.id))}</textarea></label>
    <h2>${esc(t('rs_export'))}</h2>
    <div class="toggle"><span>${esc(t('rs_exportAnon'))}</span><button class="switch ${study.anonymizeExports ? 'on' : ''}" id="rs-anon" role="switch" aria-checked="${study.anonymizeExports}" aria-label="${esc(t('rs_exportAnon'))}"></button></div>
    <p class="small neg" id="rs-named" ${study.anonymizeExports ? 'hidden' : ''}>${esc(t('rs_exportNamed'))}</p>
    <div class="row wrap rs-mt"><button class="btn sm" data-exp="csv">${icon('doc', 16)} ${esc(t('rs_exportCsv'))}</button><button class="btn sm ghost" data-exp="json">${icon('doc', 16)} ${esc(t('rs_exportJson'))}</button><button class="btn sm ghost" data-exp="pdf">${icon('doc', 16)} ${esc(t('rs_exportPdf'))}</button></div></section>`;
  let anon = study.anonymizeExports;
  const notesEl = root.querySelector<HTMLTextAreaElement>('#rs-notes')!;
  notesEl.addEventListener('input', () => writeNotes(study.id, notesEl.value));
  root.querySelector<HTMLElement>('#rs-anon')!.onclick = (e) => {
    anon = !anon;
    const b = e.currentTarget as HTMLElement;
    b.classList.toggle('on', anon);
    b.setAttribute('aria-checked', String(anon));
    root.querySelector<HTMLElement>('#rs-named')!.hidden = anon;
  };
  const b = bundle;
  root.querySelectorAll<HTMLElement>('[data-exp]').forEach((btn) => {
    btn.onclick = async () => {
      const kind = btn.dataset['exp'] as 'csv' | 'json' | 'pdf';
      const now = new Date().toISOString();
      const name = exportFileName(study.name, kind, now);
      const notes = notesEl.value.trim();
      try {
        btn.setAttribute('aria-busy', 'true');
        if (kind === 'csv')
          await saveFile(toCsvLong(data.observations, { anonymize: anon }), name, 'text/csv;charset=utf-8');
        else if (kind === 'json')
          await saveFile(
            JSON.stringify(
              buildJsonExport(study, b.patients, data, b.interventions, {
                anonymize: anon,
                exportedAt: now,
                ...(notes ? { notes } : {}),
              }),
              null,
              2,
            ),
            name,
            'application/json',
          );
        else {
          const JsPDF = (await loadJsPDF()) as unknown as JsPdfConstructor;
          const model = buildPdfModel({ ...study, anonymizeExports: anon }, summary, {
            exportedAt: now,
            ...(notes ? { notes } : {}),
            lang: getLang() === 'fr' ? 'fr' : 'en',
          });
          await saveFile(renderPdfModel(JsPDF, model), name, 'application/pdf');
        }
      } catch (e) {
        toast(t('rs_error', { msg: errMsg(e) }));
      } finally {
        btn.removeAttribute('aria-busy');
      }
    };
  });
}
