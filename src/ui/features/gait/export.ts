/**
 * Volet « marche » — exports d'une évaluation : JSON (document `assessments` complet, sans image ni vidéo) et PDF
 * simple (résumé texte : qualité, spatio-temporel, déterminants, défauts). Le PDF réutilise l'infrastructure existante
 * (jsPDF local chargé par `loadJsPDF`, partage/téléchargement `sharePdf`, nettoyage de texte `latin`) ; si jsPDF est
 * indisponible, repli sur l'impression du navigateur (feuille de style d'impression de gait.css).
 */
import type { Assessment } from '../../../core/types/clinical.ts';
import type { JsPdfConstructor } from '../../../domains/outcomes/report-pdf.ts';
import { latin, loadJsPDF, sharePdf } from '../../compat/reportpdf.ts';
import { fromCoreView, type StoredResult } from './model.ts';
import {
  captureConfidence,
  determinantViews,
  dateLabel,
  estimateViews,
  findingViews,
  spatioRows,
  speedSummary,
  viewQuality,
} from './present.ts';

export type TFn = (key: string, vars?: Readonly<Record<string, string | number>>) => string;

export interface PdfLine {
  readonly kind: 'title' | 'h2' | 'p' | 'li' | 'small' | 'row';
  readonly text: string;
  readonly cols?: readonly string[];
}

const sideTxt = (t: TFn, s: string): string => (s === 'L' ? t('side_left') : s === 'R' ? t('side_right') : s);

/** Contenu du PDF (pur, testé) : même information que l'écran, sans courbes. */
export function reportLines(a: Assessment, r: StoredResult, t: TFn, locale: string, lang: string): PdfLine[] {
  const L: PdfLine[] = [];
  const c = a.conditions ?? {};
  L.push({ kind: 'title', text: t('pdf_title') });
  L.push({ kind: 'small', text: t('banner') });
  L.push({ kind: 'p', text: `${dateLabel(a.performedAt, locale)} — ${t(a.kind === 'prosthetic_gait' ? 'kind_prosthetic' : 'kind_gait')} — ${t('engine', { v: a.engineVersion ?? '–' })}` });
  L.push({ kind: 'p', text: (a.views ?? []).map((v) => t(`view_${fromCoreView(v)}`)).join(' · ') });
  const cond: string[] = [];
  if (c['heightCm']) cond.push(`${t('f_height')} : ${c['heightCm']} cm`);
  if (c['assistiveDevice']) cond.push(`${t('f_device')} : ${t(`dev_${c['assistiveDevice']}`)}`);
  if (c['footwear']) cond.push(`${t('f_footwear')} : ${t(`foot_${c['footwear']}`)}`);
  if (c['prosthesisLevel']) cond.push(`${t('f_prosthesis')} : ${t(`lvl_${c['prosthesisLevel']}`)} (${sideTxt(t, c['prosthesisSide'] ?? '')})`);
  if (c['speed']) cond.push(`${t('f_speed')} : ${t(`spd_${c['speed']}`)}`);
  if (c['instruction']) cond.push(`${t('f_instruction')} : ${c['instruction']}`);
  if (c['modification']) cond.push(`${t('f_modification')} : ${c['modification']}`);
  for (const x of cond) L.push({ kind: 'li', text: x });

  const views = r.analyses.map(viewQuality);
  const conf = captureConfidence(views);
  L.push({ kind: 'h2', text: t('sec_quality') });
  L.push({ kind: 'p', text: `${t('q_confidence')} ${t(`conf_${conf.level}`)}` });
  for (const v of views)
    L.push({
      kind: 'li',
      text: `${t(`view_${v.view}`)} : ${Math.round(v.fps)} ${t('unit_fps')}, ${t('q_cycles')} ${t('side_L')} ${v.cycles.L} / ${t('side_R')} ${v.cycles.R}, ${t('q_usable')} ${v.usablePct} %`,
    });

  L.push({ kind: 'h2', text: t('sec_spatio') });
  const sp = speedSummary(r.analyses, locale);
  if (sp)
    L.push({
      kind: 'p',
      text: `${t('m_gait_speed')} : ${sp.text} m/s${sp.pctOfNorm !== null ? ` — ${sp.pctOfNorm} % ${t('norm_ofNorm')}` : ''}${sp.z !== null ? `, z = ${sp.z}` : ''}`,
    });
  L.push({ kind: 'row', text: '', cols: [t('col_param'), t('side_left'), t('side_right')] });
  for (const row of spatioRows(r.analyses, locale))
    L.push({
      kind: 'row',
      text: '',
      cols: [
        `${t(`m_${row.id}`) === `m_${row.id}` ? row.id : t(`m_${row.id}`)} (${row.unit})`,
        row.both ? row.both.text : (row.L?.text ?? '–'),
        row.both ? '' : (row.R?.text ?? '–'),
      ],
    });

  L.push({ kind: 'h2', text: t('sec_determinants') });
  for (const d of determinantViews(r.determinants, lang, locale)) {
    L.push({ kind: 'p', text: `${d.n}. ${d.name} — ${t(`st_${d.status}`)}` });
    L.push({ kind: 'small', text: d.explanation });
  }

  L.push({ kind: 'h2', text: t('sec_findings') });
  const fs = findingViews(r.findings, lang, locale);
  if (!fs.length) L.push({ kind: 'p', text: t('find_none') });
  for (const f of fs) {
    L.push({
      kind: 'p',
      text: `${f.name} — ${sideTxt(t, f.side)} — ${t(`fst_${f.status}`)} — ${t('find_conf', { p: f.confidencePct })}`,
    });
    for (const w of f.why) L.push({ kind: 'li', text: `${w.text} : ${w.valueText}` });
    if (f.suggestions.length) {
      L.push({ kind: 'small', text: t('sugg_note') });
      for (const s of f.suggestions) L.push({ kind: 'li', text: s });
    }
    if (f.references.length) L.push({ kind: 'small', text: `${t('find_refs')} ${f.references.join(', ')}` });
  }
  const est = estimateViews(r.analyses, locale).featured;
  if (est.length) {
    L.push({ kind: 'h2', text: t('est_featured') });
    for (const e of est)
      L.push({ kind: 'li', text: `${t(`m_${e.id}`) === `m_${e.id}` ? e.id : t(`m_${e.id}`)}${e.side ? ` (${sideTxt(t, e.side)})` : ''} : ${e.valueText} ${e.unit} — ${t('est_tag')}` });
  }
  L.push({ kind: 'small', text: r.disclaimer });
  return L;
}

const safe = (s: string): string => latin(s) ?? s.replace(/[^\x20-\x7e -ÿ]/g, '?');

/** Dessine les lignes (A4, marges 15 mm, sauts de page). */
export async function renderPdfBlob(lines: readonly PdfLine[], JsPDF?: JsPdfConstructor): Promise<Blob> {
  const Ctor = JsPDF ?? ((await loadJsPDF()) as unknown as JsPdfConstructor);
  const doc = new Ctor({ unit: 'mm', format: 'a4', compress: true, orientation: 'portrait' });
  const M = 15;
  const W = 210 - 2 * M;
  const BOTTOM = 297 - 16;
  let y = M;
  const need = (h: number): void => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  doc.setTextColor(20, 28, 44);
  for (const ln of lines) {
    if (ln.kind === 'row' && ln.cols) {
      need(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(safe(ln.cols[0] ?? ''), M, y);
      doc.text(safe(ln.cols[1] ?? ''), M + 100, y);
      doc.text(safe(ln.cols[2] ?? ''), M + 140, y);
      y += 5;
      continue;
    }
    const size = ln.kind === 'title' ? 16 : ln.kind === 'h2' ? 12 : ln.kind === 'small' ? 8.5 : 10;
    doc.setFont('helvetica', ln.kind === 'title' || ln.kind === 'h2' ? 'bold' : 'normal');
    doc.setFontSize(size);
    const indent = ln.kind === 'li' ? 5 : 0;
    const text = ln.kind === 'li' ? `- ${ln.text}` : ln.text;
    const wrapped = doc.splitTextToSize(safe(text), W - indent);
    const lh = size * 0.42 + 1.2;
    if (ln.kind === 'h2') y += 3;
    need(lh * Math.min(wrapped.length, 2));
    for (const w of wrapped) {
      need(lh);
      doc.text(w, M + indent, y);
      y += lh;
    }
    y += ln.kind === 'title' ? 3 : 0.8;
  }
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 118, 130);
    doc.text(`Mobilis - ${p}/${n}`, 105, 290, { align: 'center' });
  }
  return doc.output('blob');
}

/** PDF simple de l'évaluation ; repli sur l'impression du navigateur si jsPDF est indisponible. */
export async function exportPdf(
  a: Assessment,
  r: StoredResult,
  t: TFn,
  locale: string,
  lang: string,
  root: HTMLElement,
): Promise<void> {
  try {
    const blob = await renderPdfBlob(reportLines(a, r, t, locale, lang));
    await sharePdf(blob, `mobilis-marche-${a.performedAt.slice(0, 10)}.pdf`, { title: 'Mobilis' });
  } catch (e) {
    console.warn('pdf: repli impression', e);
    const opened = [...root.querySelectorAll('details')].filter((d) => !d.open);
    opened.forEach((d) => (d.open = true));
    const restore = (): void => {
      opened.forEach((d) => (d.open = false));
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }
}

/** Télécharge le document complet (JSON). Aucune image ni vidéo n'y figure (`videoRetained: false`). */
export async function exportJson(doc: unknown, fileName: string): Promise<void> {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
