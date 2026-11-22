// Branchement du rapport PDF de v1.15 : le domaine (src/domains/outcomes/report-pdf.ts) reçoit le chargeur de jsPDF
// (platform/files) par injection. Couche « ui » = racine de composition pendant la migration ; remplacé par src/main.ts.
import {
  fmtDate,
  latin,
  pdfLang,
  renderPdfDetailedWith,
  renderPdfWith,
  type JsPdfConstructor,
} from '../../domains/outcomes/report-pdf.ts';
import type { ReportData } from '../../domains/outcomes/types.ts';
import { loadJsPDF, sharePdf } from '../../platform/files.ts';

export { fmtDate, latin, pdfLang, loadJsPDF, sharePdf };

const loader = (): Promise<JsPdfConstructor> => loadJsPDF() as Promise<JsPdfConstructor>;

export const renderPdfDetailed = (
  data: ReportData,
  lang = 'fr',
  opts: { jsPDF?: JsPdfConstructor | undefined } = {},
): Promise<{ blob: Blob; pages: number }> => renderPdfDetailedWith(loader, data, lang, opts);

/** → Promise<Blob> (application/pdf) */
export const renderPdf = (
  data: ReportData,
  lang = 'fr',
  opts: { jsPDF?: JsPdfConstructor | undefined } = {},
): Promise<Blob> => renderPdfWith(loader, data, lang, opts);
