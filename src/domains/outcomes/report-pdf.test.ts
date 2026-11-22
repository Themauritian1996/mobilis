import { describe, expect, it, vi } from 'vitest';
import { fmtDate, latin, pdfLang, renderPdfDetailedWith, renderPdfWith, type PdfDocument } from './report-pdf.ts';
import type { ReportData } from './types.ts';

describe('texte compatible PDF', () => {
  it('langue : fr ou en seulement', () => {
    expect(pdfLang('fr')).toBe('fr');
    expect(pdfLang('ar')).toBe('en');
    expect(pdfLang(undefined)).toBe('en');
  });

  it('latin : remplacements, caractères refusés, contrôles ignorés', () => {
    expect(latin(null)).toBe('');
    expect(latin('Épaule − 5 → 10 ≥ 3')).toBe('Épaule - 5 -> 10 >= 3');
    expect(latin('a b c d​e')).toBe('a b c de');
    expect(latin('↑↓ok')).toBe('ok');
    expect(latin('œuvre « test » – €')).toBe('œuvre « test » – €');
    expect(latin('a\tb\r\nc')).toBe('a b\nc');
    expect(latin('a\u0007b️')).toBe('ab');
    expect(latin('日本語')).toBeNull();
    expect(latin('ok 😀')).toBeNull();
  });

  it('date : tiret long si absente ou invalide', () => {
    expect(fmtDate(null)).toBe('–');
    expect(fmtDate(Number.NaN)).toBe('–');
    expect(fmtDate(Date.UTC(2025, 5, 15, 12))).toMatch(/2025/);
  });
});

function fakeDoc(): { doc: PdfDocument; texts: string[]; pages: () => number } {
  const texts: string[] = [];
  let pages = 1;
  const noop = (): undefined => undefined;
  const doc: PdfDocument = {
    setFillColor: noop,
    setDrawColor: noop,
    setTextColor: noop,
    setFont: noop,
    setFontSize: noop,
    setLineWidth: noop,
    setLineDashPattern: noop,
    splitTextToSize: (s, w) =>
      String(s)
        .split('\n')
        .concat(w > 0 ? [] : []),
    text: (s) => void texts.push(s),
    rect: noop,
    roundedRect: noop,
    line: noop,
    circle: noop,
    addPage: () => void pages++,
    setPage: noop,
    getNumberOfPages: () => pages,
    setProperties: noop,
    output: () => new Blob(['%PDF'], { type: 'application/pdf' }),
  };
  return { doc, texts, pages: () => pages };
}

const data: ReportData = {
  version: 1,
  generatedAt: Date.UTC(2025, 5, 15),
  source: 'full',
  period: { from: Date.UTC(2025, 5, 1), to: Date.UTC(2025, 5, 15), days: 14 },
  patient: { name: 'Camille' },
  condition: {
    pathology: { fr: 'Épaule', en: 'Shoulder' },
    region: null,
    phase: null,
    week: 3,
    protocol: null,
    clinician: '',
  },
  adherence: { planned: 10, done: 8, pct: 80 },
  sessionsCount: 8,
  pain: {
    series: [
      { ts: Date.UTC(2025, 5, 2), v: 5, src: 's' },
      { ts: Date.UTC(2025, 5, 10), v: 3, src: 's' },
    ],
    avg: 4,
    first: 5,
    last: 3,
    delta: -2,
    min: 3,
    max: 5,
  },
  exercises: [
    {
      id: 'x',
      name: { fr: 'Pendule', en: 'Pendulum' },
      level: 2,
      levelStart: 1,
      sessions: 4,
      difficulty: 2.5,
      pain: 3,
      trend: 'up',
    },
  ],
  rom: [],
  prom: [],
  badges: { total: 2, inPeriod: 1 },
  fields: { global: 1, comment: '日本語' },
  log: [],
  logTruncated: false,
  notes: [],
};

describe('rapport PDF (jsPDF simulé)', () => {
  it('dessine le rapport dans la langue demandée avec le constructeur injecté', async () => {
    const { doc, texts, pages } = fakeDoc();
    const ctor = vi.fn(function () {
      return doc;
    });
    const loader = vi.fn(async () => ctor as unknown as new () => PdfDocument);
    const r = await renderPdfDetailedWith(loader as never, data, 'fr');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(r.pages).toBe(pages());
    expect(texts).toContain('Rapport de suivi');
    expect(texts.some((t) => t.includes('Adhérence'))).toBe(true);
    expect(texts).toContain('Un peu mieux');
    expect(texts).toContain('(texte non affiché : alphabet non pris en charge par le PDF)'); // texte libre non latin
    expect(texts).toContain('Progresse');
    expect(texts.some((t) => /Page 1 \/ \d+/.test(t))).toBe(true);
  });

  it('jsPDF fourni par l’appelant : le chargeur n’est pas appelé ; anglais par défaut hors fr', async () => {
    const { doc, texts } = fakeDoc();
    const loader = vi.fn();
    const blob = await renderPdfWith(loader as never, data, 'de', {
      jsPDF: vi.fn(function () {
        return doc;
      }) as never,
    });
    expect(loader).not.toHaveBeenCalled();
    expect(blob.type).toBe('application/pdf');
    expect(texts).toContain('Follow-up report');
  });
});
