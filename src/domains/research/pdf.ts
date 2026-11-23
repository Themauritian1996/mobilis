/**
 * PDF résumé d'une étude : modèle pur (lignes du tableau de synthèse) + rendu avec un jsPDF injecté (le domaine ne
 * charge ni le DOM ni le système de fichiers ; voir src/ui/features/research/ pour le chargeur).
 * Polices standard WinAnsi : texte converti par `latin()` (caractères non latins remplacés par « ? »).
 */
import type { Study } from '../../core/types/clinical.ts';
import { latin, type JsPdfConstructor, type PdfDocument } from '../outcomes/report-pdf.ts';
import type { CellSummary } from './aggregate.ts';
import { EXPORT_DISCLAIMER } from './export.ts';

export interface PdfSummaryModel {
  readonly title: string;
  readonly subtitle: string;
  readonly disclaimer: string;
  readonly header: readonly string[];
  readonly sections: readonly { readonly measure: string; readonly rows: readonly (readonly string[])[] }[];
  readonly notes: string;
  readonly footnote: string;
}

const f = (x: number | null, d = 2): string => (x === null || !Number.isFinite(x) ? '–' : String(+x.toFixed(d)));
const pm = (m: number | null, s: number | null, d = 2): string =>
  m === null ? '–' : s === null ? f(m, d) : `${f(m, d)} ± ${f(s, d)}`;
const signed = (x: number | null, d = 2): string => (x === null ? '–' : `${x > 0 ? '+' : ''}${f(x, d)}`);

/** Modèle du PDF (textes en français ; `lang: 'en'` pour l'anglais). */
export function buildPdfModel(
  study: Pick<Study, 'name' | 'measures' | 'timepoints' | 'patientIds' | 'anonymizeExports'>,
  summary: readonly CellSummary[],
  opts: { readonly exportedAt: string; readonly notes?: string; readonly lang?: 'fr' | 'en' },
): PdfSummaryModel {
  const en = opts.lang === 'en';
  const tpLabel = new Map(study.timepoints.map((t) => [t.id, t.label]));
  const sections = study.measures
    .filter((m) => m.kind !== 'gait_curve')
    .map((m) => ({
      measure: m.label,
      rows: summary
        .filter((c) => c.measureId === m.id)
        .map((c) => [
          `${tpLabel.get(c.timepointId) ?? c.timepointId}${c.condition ? ` (${c.condition})` : ''}`,
          String(c.n),
          `${pm(c.mean, c.sd)} ${c.unit}`.trim(),
          c.nPaired ? `${signed(c.deltaMean)}${c.deltaSd !== null ? ` ± ${f(c.deltaSd)}` : ''} (n=${c.nPaired})` : '–',
          c.threshold
            ? `${c.threshold.kind === 'mdc' ? 'MDC' : c.threshold.kind === 'mcid' ? (en ? 'MCID' : 'DMCI') : en ? '2D error' : 'Erreur 2D'} ${f(c.threshold.value)}${c.nBeyondThreshold !== null && c.nPaired ? ` — ${c.nBeyondThreshold}/${c.nPaired}` : ''}`
            : '–',
        ]),
    }));
  return {
    title: study.name,
    subtitle: `${en ? 'Patients' : 'Patients'} : ${study.patientIds.length} · ${en ? 'Exported' : 'Exporté le'} ${opts.exportedAt.slice(0, 10)}${study.anonymizeExports ? (en ? ' · anonymized' : ' · anonymisé') : ''}`,
    disclaimer: EXPORT_DISCLAIMER,
    header: en
      ? ['Timepoint', 'n', 'Mean ± SD', 'Change vs T0 ± SD', 'Threshold — n beyond']
      : ['Point dans le temps', 'n', 'Moyenne ± ET', 'Delta vs T0 ± ET', 'Seuil — n au-delà'],
    sections,
    notes: opts.notes ?? '',
    footnote: en
      ? 'MDC: minimal detectable change; MCID: minimal clinically important difference (indicative); 2D error: published camera error (not an MDC). Values marked to_verify must be checked before publication.'
      : 'MDC : changement minimal détectable ; DMCI : différence minimale cliniquement importante (indicative) ; erreur 2D : erreur publiée de la caméra (pas un MDC). Valeurs « à vérifier » avant toute publication.',
  };
}

const safe = (s: string): string => latin(s) ?? s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');

/** Dessine le modèle en A4 portrait ; renvoie le Blob PDF. */
export function renderPdfModel(JsPDF: JsPdfConstructor, model: PdfSummaryModel): Blob {
  const doc: PdfDocument = new JsPDF({ unit: 'mm', format: 'a4', compress: true, orientation: 'portrait' });
  const M = 15;
  const W = 210 - 2 * M;
  const BOTTOM = 280;
  let y = M;
  const need = (h: number): void => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const para = (text: string, size: number, style = 'normal', color: [number, number, number] = [20, 28, 44]): void => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(safe(text), W)) {
      need(size * 0.45);
      doc.text(line, M, y);
      y += size * 0.45;
    }
    y += 1.5;
  };
  doc.setProperties({ title: safe(model.title), creator: 'Mobilis' });
  para(model.title, 16, 'bold', [30, 94, 140]);
  para(model.subtitle, 9, 'normal', [110, 118, 130]);
  para(model.disclaimer, 8, 'italic', [190, 60, 50]);
  const cols = [44, 10, 40, 48, 38];
  const row = (cells: readonly string[], bold: boolean): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(20, 28, 44);
    const wrapped = cells.map((c, i) => doc.splitTextToSize(safe(c), cols[i]! - 2));
    const h = Math.max(...wrapped.map((w) => w.length)) * 3.6 + 1.5;
    need(h);
    let x = M;
    wrapped.forEach((w, i) => {
      w.forEach((line, k) => doc.text(line, x + 1, y + 3.2 + k * 3.6));
      x += cols[i]!;
    });
    y += h;
    doc.setDrawColor(214, 219, 227);
    doc.line(M, y, M + W, y);
  };
  for (const s of model.sections) {
    need(14);
    y += 2;
    para(s.measure, 11, 'bold');
    row(model.header, true);
    if (!s.rows.length) para('–', 8);
    for (const r of s.rows) row(r, false);
    y += 2;
  }
  if (model.notes.trim()) {
    y += 2;
    para('Notes', 11, 'bold');
    para(model.notes, 9);
  }
  y += 2;
  para(model.footnote, 7.5, 'italic', [110, 118, 130]);
  return doc.output('blob');
}
