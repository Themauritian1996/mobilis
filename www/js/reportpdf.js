// Rapport PDF (jsPDF 4.x vendu en local) : mise en page A4 propre, tableaux, courbes vectorielles. Aucune image, aucun réseau.
// Entrée : l'objet produit par report.js buildReportData() (ou dataFromSummary() pour le clinicien). Sortie : Blob PDF.
// Langue du PDF : fr ou en seulement (polices standard WinAnsi : pas d'arabe ni de chinois) ; texte libre non latin = remplacé par une note.
import { TESTS } from './data/romtests.js';

// ---------- Langue ----------
export const pdfLang = (l) => (l === 'fr' ? 'fr' : 'en');

const L = {
  fr: {
    title: 'Rapport de suivi', period: 'Période', generated: 'Généré le', patient: 'Patient', condition: 'Problème', protocol: 'Protocole post-opératoire',
    week: 'Semaine', phase: 'Phase', clinician: 'Clinicien', adherence: 'Adhérence', sessions: 'Séances', painAvg: 'Douleur moy.', badges: 'Badges',
    plannedDays: 'jours prévus réalisés', ofN: 'sur', sessionsIn: 'séances sur la période', last7: '7 derniers jours', perWeek: 'par semaine',
    patientReport: 'Rapport du patient', globalStatus: 'État global depuis le dernier rapport', painNow: 'Douleur en ce moment', goalsProg: 'Progression vers les objectifs', goals: 'Objectifs',
    hardEx: 'Exercices difficiles ou douloureux', difficulties: 'Difficultés', comment: 'Commentaire',
    g: { '-2': 'Beaucoup moins bien', '-1': 'Un peu moins bien', '0': 'Pareil', '1': 'Un peu mieux', '2': 'Beaucoup mieux' },
    gp: ['Pas du tout', 'Un peu', 'Beaucoup', 'Atteints'],
    pain: 'Douleur', painSub: 'Douleur déclarée (0 à 10) : séances et journal quotidien', first: 'Première', lastv: 'Dernière', change: 'Variation', noPain: 'Aucune donnée de douleur sur la période.',
    exercises: 'Exercices', exercise: 'Exercice', level: 'Niveau', difficulty: 'Difficulté', trend: 'Tendance', up: 'Progresse', down: 'Allégé', steady: 'Stable', none: 'Aucun',
    rom: 'Amplitudes de mouvement', test: 'Test', side: 'Côté', baseline: 'Départ', last: 'Dernière', gain: 'Gain', pctNormal: '% norme', L: 'G', R: 'D', bothSides: 'G / D',
    romNote: 'Mesures par caméra ou manuelles ; précision approximative (± 5 à 15°). Gain = amélioration depuis la première mesure.', normalBand: 'Zone normale',
    prom: 'Questionnaires', instrument: 'Questionnaire', delta: 'Variation', mcid: 'DMCI atteinte', yes: 'Oui', no: 'Non', mcidNote: 'DMCI : différence minimale cliniquement importante.',
    comments: 'Commentaires du patient', log: 'Journal des séances', date: 'Date', done: 'Réalisé', diffShort: 'Diff.', painShort: 'Douleur', set1: 'série', sets: 'séries', reps: 'rép.', full: 'complètes', partial: 'partielles',
    logCap: 'Journal limité aux {n} séances les plus récentes de la période.', exCount: 'Exercices', footer: 'Généré par Mobilis — ne remplace pas une évaluation clinique', page: 'Page',
    nonLatin: '(texte non affiché : alphabet non pris en charge par le PDF)', summaryNote: 'Rapport produit à partir du résumé partagé par le patient : période limitée aux 7 derniers jours, sans détail des séries ni des répétitions.',
    nothing: 'Aucune donnée sur la période.', preop: 'avant la chirurgie', surgery: 'Chirurgie', since: 'depuis le départ',
  },
  en: {
    title: 'Follow-up report', period: 'Period', generated: 'Generated', patient: 'Patient', condition: 'Condition', protocol: 'Post-operative protocol',
    week: 'Week', phase: 'Phase', clinician: 'Clinician', adherence: 'Adherence', sessions: 'Sessions', painAvg: 'Avg pain', badges: 'Badges',
    plannedDays: 'planned days completed', ofN: 'of', sessionsIn: 'sessions in the period', last7: 'last 7 days', perWeek: 'per week',
    patientReport: 'Patient report', globalStatus: 'Overall status since the last report', painNow: 'Pain right now', goalsProg: 'Progress toward goals', goals: 'Goals',
    hardEx: 'Difficult or painful exercises', difficulties: 'Difficulties', comment: 'Comment',
    g: { '-2': 'Much worse', '-1': 'A little worse', '0': 'About the same', '1': 'A little better', '2': 'Much better' },
    gp: ['Not at all', 'A little', 'A lot', 'Reached'],
    pain: 'Pain', painSub: 'Reported pain (0 to 10): sessions and daily check-in', first: 'First', lastv: 'Latest', change: 'Change', noPain: 'No pain data in the period.',
    exercises: 'Exercises', exercise: 'Exercise', level: 'Level', difficulty: 'Difficulty', trend: 'Trend', up: 'Progressing', down: 'Eased', steady: 'Steady', none: 'None',
    rom: 'Range of motion', test: 'Test', side: 'Side', baseline: 'Baseline', last: 'Latest', gain: 'Gain', pctNormal: '% of normal', L: 'L', R: 'R', bothSides: 'L / R',
    romNote: 'Camera or manual measurements; approximate accuracy (± 5 to 15 degrees). Gain = improvement since the first measurement.', normalBand: 'Normal range',
    prom: 'Questionnaires', instrument: 'Questionnaire', delta: 'Change', mcid: 'MCID reached', yes: 'Yes', no: 'No', mcidNote: 'MCID: minimal clinically important difference.',
    comments: 'Patient comments', log: 'Session log', date: 'Date', done: 'Done', diffShort: 'Diff.', painShort: 'Pain', set1: 'set', sets: 'sets', reps: 'reps', full: 'full', partial: 'partial',
    logCap: 'Log limited to the {n} most recent sessions of the period.', exCount: 'Exercises', footer: 'Generated by Mobilis — does not replace a clinical assessment', page: 'Page',
    nonLatin: '(text not shown: script not supported by the PDF)', summaryNote: 'Report built from the summary shared by the patient: limited to the last 7 days, without set or repetition detail.',
    nothing: 'No data in the period.', preop: 'before surgery', surgery: 'Surgery', since: 'since baseline',
  },
};

// ---------- Texte compatible polices standard (WinAnsi) ----------
const WIN_EXTRA = new Set([0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122]);
const REPL = { '−': '-', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≈': '~', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '↑': '', '↓': '', ' ': ' ' };
/** Texte sûr pour les polices standard, ou null si un caractère (lettre non latine, emoji…) ne peut pas être dessiné. */
export function latin(s) {
  if (s == null) return '';
  let out = '';
  for (const ch of String(s).replace(/\r/g, '')) {
    if (REPL[ch] !== undefined) { out += REPL[ch]; continue; }
    const c = ch.codePointAt(0);
    if (ch === '\n' || ch === '\t' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.has(c)) out += ch === '\t' ? ' ' : ch;
    else if (c < 0x20 || (c >= 0x7f && c < 0xa0) || (c >= 0xfe00 && c <= 0xfe0f)) continue; // contrôles / sélecteurs de variante
    else return null;
  }
  return out;
}

const pick = (o, lang) => (o == null ? '' : typeof o === 'string' ? o : (o[lang] ?? o.en ?? o.fr ?? ''));
const pad2 = (n) => String(n).padStart(2, '0');
export const fmtDate = (ts) => { if (ts == null) return '–'; const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
let decComma = false; // virgule décimale en français
const dec = (s) => (decComma ? s.replace('.', ',') : s);
const num = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : dec(String(+x.toFixed(d))));
const signed = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${x > 0 ? '+' : x < 0 ? '-' : ''}${dec(String(Math.abs(+x.toFixed(d))))}`);

// ---------- Chargement de jsPDF (local, paresseux) ----------
let jsPdfP = null;
export function loadJsPDF() {
  if (globalThis.jspdf?.jsPDF) return Promise.resolve(globalThis.jspdf.jsPDF);
  if (jsPdfP) return jsPdfP;
  jsPdfP = (async () => {
    if (typeof document !== 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href;
        s.onload = res; s.onerror = () => rej(new Error('jspdf'));
        document.head.appendChild(s);
      });
    } else { // node (tests)
      const fsN = 'node:fs', vmN = 'node:vm';
      const [fs, vm] = await Promise.all([import(fsN), import(vmN)]);
      vm.runInThisContext(fs.readFileSync(new URL('../vendor/jspdf.umd.min.js', import.meta.url), 'utf8'));
    }
    if (!globalThis.jspdf?.jsPDF) throw new Error('jspdf');
    return globalThis.jspdf.jsPDF;
  })().catch((e) => { jsPdfP = null; throw e; });
  return jsPdfP;
}

// ---------- Mise en page ----------
const W = 210, H = 297, M = 15, CW = W - 2 * M, BOTTOM = H - 16;
const C = { ink: [20, 28, 44], accent: [30, 94, 140], grey: [110, 118, 130], line: [214, 219, 227], alt: [244, 246, 249], tile: [238, 242, 247], pos: [22, 130, 90], neg: [190, 60, 50], white: [255, 255, 255], band: [214, 238, 226] };

export async function renderPdfDetailed(data, lang = 'fr', opts = {}) {
  lang = pdfLang(lang);
  const T = L[lang];
  decComma = lang === 'fr';
  const JsPDF = opts.jsPDF || (await loadJsPDF());
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true, orientation: 'portrait' });
  const txt = (s) => { const v = latin(s); return v == null ? T.nonLatin : v; };
  const name = (o) => txt(pick(o, lang));
  let y = M;
  let pageNo = 1;

  const fill = (c) => doc.setFillColor(...c), stroke = (c) => doc.setDrawColor(...c), color = (c) => doc.setTextColor(...c);
  const font = (size, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  const lines = (s, w, size = 9.5, bold = false) => { font(size, bold); return doc.splitTextToSize(String(s), w); };
  const lh = (size) => size * 0.4;

  function runningHeader() {
    font(8, false); color(C.grey);
    doc.text('Mobilis · ' + T.title, M, 10);
    doc.text(periodText(), W - M, 10, { align: 'right' });
    stroke(C.line); doc.setLineWidth(0.2); doc.line(M, 12, W - M, 12);
    y = 19;
  }
  function newPage() { doc.addPage(); pageNo++; runningHeader(); }
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };

  function periodText() {
    const p = data.period || {};
    if (data.source === 'summary') return `${T.period}: ${T.last7}`;
    return `${T.period}: ${fmtDate(p.from)} – ${fmtDate(p.to)}`;
  }
  function heading(s) {
    ensure(16);
    y += 3;
    fill(C.accent); doc.rect(M, y - 4.6, 1.6, 6, 'F');
    font(12, true); color(C.ink); doc.text(s, M + 4, y);
    y += 5;
  }
  function para(s, { size = 9.5, c = C.ink, bold = false, gap = 1.5, w = CW, x = M } = {}) {
    const ls = lines(s, w, size, bold);
    for (const l of ls) { ensure(lh(size) + 2); font(size, bold); color(c); doc.text(l, x, y); y += lh(size) + 1.1; }
    y += gap;
  }
  function kv(k, v) {
    if (v == null || v === '') return;
    const ks = lines(k, 54, 9.5, true), ls = lines(v, CW - 60, 9.5, false), n = Math.max(ks.length, ls.length);
    ensure(n * 4.8 + 1);
    font(9.5, true); color(C.grey); ks.forEach((l, i) => doc.text(l, M, y + i * 4.8));
    font(9.5, false); color(C.ink);
    ls.forEach((l, i) => doc.text(l, M + 58, y + i * 4.8));
    y += n * 4.8 + 0.6;
  }

  // Tableau : cols [{ label, w (mm), align? }], rows [[texte…]] ; lignes alternées, en-tête répété
  function table(cols, rows, { size = 9, hdrSize = 8.5 } = {}) {
    const total = cols.reduce((a, c) => a + c.w, 0), k = CW / total;
    const ws = cols.map((c) => c.w * k);
    const header = () => {
      ensure(10);
      fill(C.accent); doc.rect(M, y - 4.2, CW, 6.6, 'F');
      font(hdrSize, true); color(C.white);
      let x = M;
      cols.forEach((c, i) => { doc.text(String(c.label), c.align === 'right' ? x + ws[i] - 1.5 : c.align === 'center' ? x + ws[i] / 2 : x + 1.5, y, { align: c.align || 'left' }); x += ws[i]; });
      y += 6.2;
    };
    header();
    rows.forEach((r, ri) => {
      const cells = r.map((v, i) => lines(v == null ? '–' : v, ws[i] - 3, size, false));
      const n = Math.max(...cells.map((c) => c.length));
      const h = n * lh(size) + n * 1.1 + 2.2;
      if (y - 4.2 + h > BOTTOM) { newPage(); header(); }
      if (ri % 2 === 0) { fill(C.alt); doc.rect(M, y - 4.2, CW, h, 'F'); }
      font(size, false); color(C.ink);
      let x = M;
      cells.forEach((c, i) => {
        c.forEach((l, li) => { const yy = y + li * (lh(size) + 1.1); doc.text(l, cols[i].align === 'right' ? x + ws[i] - 1.5 : cols[i].align === 'center' ? x + ws[i] / 2 : x + 1.5, yy, { align: cols[i].align || 'left' }); });
        x += ws[i];
      });
      y += h;
    });
    y += 2;
  }

  // Courbe vectorielle : series [{ pts: [[ts, v]], color, dash, marker }], axes simples
  function chart(x, y0, w, h, { series, yMin, yMax, ticks = 3, band = null, xFrom, xTo }) {
    const L0 = 9, B0 = 5, ix = x + L0, iy = y0, iw = w - L0 - 2, ih = h - B0;
    const all = series.flatMap((s) => s.pts);
    const t0 = xFrom ?? Math.min(...all.map((p) => p[0])), t1 = xTo ?? Math.max(...all.map((p) => p[0]));
    const X = (t) => (t1 === t0 ? ix + iw / 2 : ix + ((t - t0) / (t1 - t0)) * iw), Y = (v) => iy + ih - ((v - yMin) / (yMax - yMin)) * ih;
    if (band) { const a = Y(Math.min(yMax, band[1])), b = Y(Math.max(yMin, band[0])); fill(C.band); doc.rect(ix, a, iw, Math.max(0.6, b - a), 'F'); }
    stroke(C.line); doc.setLineWidth(0.15); font(7, false); color(C.grey);
    for (let i = 0; i <= ticks; i++) {
      const v = yMin + ((yMax - yMin) * i) / ticks, yy = Y(v);
      doc.line(ix, yy, ix + iw, yy);
      doc.text(String(Math.round(v)), ix - 1.5, yy + 0.9, { align: 'right' });
    }
    doc.text(fmtDate(t0), ix, iy + ih + 3.6); doc.text(fmtDate(t1), ix + iw, iy + ih + 3.6, { align: 'right' });
    for (const s of series) {
      const pts = s.pts.filter((p) => Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
      doc.setLineWidth(0.45); stroke(s.color); fill(s.color);
      doc.setLineDashPattern(s.dash || [], 0);
      for (let i = 1; i < pts.length; i++) doc.line(X(pts[i - 1][0]), Y(pts[i - 1][1]), X(pts[i][0]), Y(pts[i][1]));
      doc.setLineDashPattern([], 0);
      for (const p of pts) doc.circle(X(p[0]), Y(p[1]), pts.length > 30 ? 0.45 : 0.85, 'F');
    }
    doc.setLineWidth(0.2);
  }

  // ===== Page 1 : en-tête =====
  fill(C.ink); doc.rect(0, 0, W, 30, 'F');
  font(20, true); color(C.white); doc.text('Mobilis', M, 14);
  font(11, false); doc.text(T.title, M, 21.5);
  font(9, false); doc.text(periodText(), W - M, 14, { align: 'right' });
  doc.text(`${T.generated}: ${fmtDate(data.generatedAt || Date.now())}`, W - M, 20, { align: 'right' });
  y = 40;

  // ===== Identité, problème =====
  const cond = data.condition || {};
  if (data.patient?.name) { const nm = latin(data.patient.name); if (nm) kv(T.patient, nm); }
  if (cond.pathology) kv(T.condition, name(cond.pathology));
  if (cond.protocol) {
    const p = cond.protocol;
    kv(T.protocol, `${name(p.name)} — ${T.week} ${p.week}${p.phases ? ` · ${T.phase} ${p.phase}/${p.phases}` : ''}${p.preop ? ' (' + T.preop + ')' : ''}${p.surgeryDate ? ` · ${T.surgery} ${p.surgeryDate}` : ''}`);
  }
  if (cond.week != null) kv(T.week, `${cond.week}${cond.phase ? ` · ${T.phase} ${cond.phase}` : ''}`);
  if (cond.clinician) { const c = latin(cond.clinician); if (c) kv(T.clinician, c); }

  // ===== Tuiles de synthèse =====
  y += 3;
  const ad = data.adherence || {};
  const tiles = [
    [ad.pct != null ? `${ad.pct} %` : '–', T.adherence, ad.planned != null ? `${ad.done}/${ad.planned}` : ''],
    [String(data.sessionsCount ?? 0), T.sessions, data.source === 'summary' ? T.last7 : ''],
    [data.pain?.avg != null ? `${num(data.pain.avg)}/10` : '–', T.painAvg, ''],
    [String(data.badges?.total ?? 0), T.badges, data.badges?.inPeriod ? `+${data.badges.inPeriod}` : ''],
  ];
  const tw = (CW - 3 * 4) / 4;
  ensure(24);
  tiles.forEach((tl, i) => {
    const tx = M + i * (tw + 4);
    fill(C.tile); doc.roundedRect(tx, y, tw, 20, 2.5, 2.5, 'F');
    font(15, true); color(C.ink); doc.text(tl[0], tx + 4, y + 9);
    font(8, false); color(C.grey); doc.text(tl[1] + (tl[2] ? ' · ' + tl[2] : ''), tx + 4, y + 15.5);
  });
  y += 24;
  if (data.source === 'summary') para(T.summaryNote, { size: 8.5, c: C.grey });

  // ===== Rapport du patient =====
  const f = data.fields;
  if (f && (f.global != null || f.pain != null || f.goalsProgress != null || f.goals || f.difficulties || f.comment || (f.hardEx || []).length)) {
    heading(T.patientReport);
    if (f.global != null) kv(T.globalStatus, T.g[String(f.global)] || '');
    if (f.pain != null) kv(T.painNow, `${f.pain}/10`);
    if (f.goalsProgress != null) kv(T.goalsProg, T.gp[f.goalsProgress] || '');
    if (f.goals) kv(T.goals, txt(f.goals));
    if ((f.hardEx || []).length) kv(T.hardEx, f.hardEx.map((e) => name(e)).join(', '));
    if (f.difficulties) kv(T.difficulties, txt(f.difficulties));
    if (f.comment) kv(T.comment, txt(f.comment));
  }

  // ===== Adhérence =====
  heading(T.adherence);
  if (ad.planned != null) {
    para(data.source === 'summary'
      ? `${ad.done} ${T.ofN} ${ad.planned} ${T.perWeek} (${T.last7}).`
      : `${ad.done} ${T.ofN} ${ad.planned} ${T.plannedDays} (${ad.pct} %). ${data.sessionsCount} ${T.sessionsIn}.`);
  } else para(T.nothing, { c: C.grey });

  // ===== Douleur =====
  heading(T.pain);
  const ps = data.pain?.series || [];
  if (ps.length) {
    ensure(52);
    font(8.5, false); color(C.grey); doc.text(T.painSub, M, y); y += 3;
    chart(M, y, CW, 38, { series: [{ pts: ps.map((p) => [p.ts, p.v]), color: C.neg }], yMin: 0, yMax: 10, ticks: 5, xFrom: data.period?.from != null && data.source !== 'summary' ? Math.min(data.period.from, ps[0].ts) : undefined, xTo: data.source === 'summary' ? undefined : data.period?.to });
    y += 44;
    const pn = data.pain;
    para(`${T.painAvg}: ${num(pn.avg)}/10  ·  ${T.first}: ${num(pn.first)}  ·  ${T.lastv}: ${num(pn.last)}  ·  ${T.change}: ${signed(pn.delta)}`, { size: 9 });
  } else if (data.pain?.avg != null) para(`${T.painAvg}: ${num(data.pain.avg)}/10`);
  else para(T.noPain, { c: C.grey });

  // ===== Exercices =====
  if ((data.exercises || []).length) {
    heading(T.exercises);
    table([{ label: T.exercise, w: 62 }, { label: T.level, w: 20, align: 'center' }, { label: T.sessions, w: 17, align: 'center' }, { label: T.difficulty, w: 22, align: 'center' }, { label: T.painShort, w: 20, align: 'center' }, { label: T.trend, w: 24 }],
      data.exercises.map((e) => [name(e.name), e.levelStart != null && e.levelStart !== e.level ? `${e.levelStart} > ${e.level}/5` : `${e.level ?? '–'}/5`, e.sessions != null ? String(e.sessions) : '–', e.difficulty != null ? `${num(e.difficulty)}/5` : '–', e.pain != null ? `${num(e.pain)}/10` : '–', T[e.trend] || T.steady]));
  }

  // ===== Amplitudes =====
  if ((data.rom || []).length) {
    heading(T.rom);
    table([{ label: T.test, w: 54 }, { label: T.side, w: 14, align: 'center' }, { label: T.baseline, w: 22, align: 'right' }, { label: T.last, w: 22, align: 'right' }, { label: T.gain, w: 20, align: 'right' }, { label: T.pctNormal, w: 22, align: 'right' }],
      data.rom.map((r) => { const u = r.unit === '%' ? ' %' : '°'; return [name(r.name), r.side ? (r.side === 'L' ? T.L : T.R) : '–', r.baseline != null ? Math.round(r.baseline) + u : '–', r.last != null ? Math.round(r.last) + u : '–', r.gain != null ? signed(r.gain, 0) + u : '–', r.pctNormal != null ? r.pctNormal + ' %' : '–']; }));
    para(T.romNote, { size: 8, c: C.grey });
    // Courbes : un graphique par test (G plein, D pointillé), deux par ligne
    const byTest = new Map();
    for (const r of data.rom) { if (!(r.series || []).length) continue; if (!byTest.has(r.test)) byTest.set(r.test, { name: r.name, normal: r.normal, unit: r.unit, rows: [] }); byTest.get(r.test).rows.push(r); }
    const groups = [...byTest.values()].filter((g) => g.rows.some((r) => r.series.length > 1));
    const cw = (CW - 6) / 2, ch = 38;
    for (let i = 0; i < groups.length; i += 2) {
      ensure(ch + 10);
      groups.slice(i, i + 2).forEach((g, j) => {
        const x = M + j * (cw + 6), vals = g.rows.flatMap((r) => r.series.map((p) => p[1]));
        const hi = Math.max(...vals, g.normal?.hi ?? 0, g.normal?.ref ?? 0), lo = Math.min(0, ...vals);
        const yMax = Math.max(10, Math.ceil((hi * 1.08) / 10) * 10), yMin = lo < 0 ? Math.floor(lo / 10) * 10 : 0;
        font(8.5, true); color(C.ink); doc.text(name(g.name), x, y);
        chart(x, y + 2.5, cw, ch - 6, { series: g.rows.map((r) => ({ pts: r.series, color: r.side === 'R' ? C.pos : C.ink, dash: r.side === 'R' ? [1.6, 1.2] : null })), yMin, yMax, ticks: 2, band: g.normal?.lo != null ? [g.normal.lo, g.normal.hi ?? yMax] : null });
      });
      y += ch + 4;
    }
    if (groups.length) para(`${T.L} = ${lang === 'fr' ? 'trait plein' : 'solid line'} · ${T.R} = ${lang === 'fr' ? 'pointillé' : 'dashed'} · ${T.normalBand} = ${lang === 'fr' ? 'zone verte' : 'green band'}`, { size: 8, c: C.grey });
  }

  // ===== Questionnaires =====
  if ((data.prom || []).length) {
    heading(T.prom);
    table([{ label: T.instrument, w: 58 }, { label: T.baseline, w: 22, align: 'right' }, { label: T.last, w: 22, align: 'right' }, { label: T.delta, w: 22, align: 'right' }, { label: T.mcid, w: 26, align: 'center' }],
      data.prom.map((p) => [name(p.name), p.baseline != null ? num(p.baseline) : '–', p.last != null ? num(p.last) : '–', p.delta != null ? signed(p.delta) : '–', p.mcidReached ? T.yes : (p.mcid ? T.no : '–')]));
    para(T.mcidNote, { size: 8, c: C.grey });
  }

  // ===== Commentaires =====
  if ((data.notes || []).length) {
    heading(T.comments);
    for (const n of data.notes) para(`${fmtDate(n.ts)} · ${name(n.exName)}${n.pain != null ? ' · ' + n.pain + '/10' : ''} : « ${txt(n.text)} »`, { size: 9, gap: 0.8 });
  }

  // ===== Journal des séances =====
  if ((data.log || []).length) {
    heading(T.log);
    const detail = data.log.some((s) => s.items);
    if (detail) {
      table([{ label: T.date, w: 22 }, { label: T.exCount, w: 116 }, { label: T.painShort, w: 17, align: 'center' }, { label: T.diffShort, w: 17, align: 'center' }],
        data.log.map((s) => [fmtDate(s.ts), (s.items || []).map((i) => logLine(i)).join('\n'), s.pain != null ? num(s.pain) : '–', s.difficulty != null ? num(s.difficulty) : '–']), { size: 8.5 });
      if (data.logTruncated) para(T.logCap.replace('{n}', data.log.length), { size: 8, c: C.grey });
    } else {
      table([{ label: T.date, w: 30 }, { label: T.exCount, w: 40, align: 'center' }, { label: T.painShort, w: 30, align: 'center' }], data.log.map((s) => [fmtDate(s.ts), s.n != null ? String(s.n) : '–', s.pain != null ? num(s.pain) : '–']));
    }
  }
  function logLine(i) {
    const parts = [`${i.sets} ${i.sets === 1 ? T.set1 : T.sets}`];
    if (i.reps) parts.push(`${i.reps} ${T.reps}${i.partial ? ` (${i.full} ${T.full}, ${i.partial} ${T.partial})` : ''}`);
    else if (i.holdSec) parts.push(`${Math.round(i.holdSec)} s`);
    return `${name(i.name)} : ${parts.join(', ')}`;
  }

  // ===== Pieds de page + numéros =====
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    stroke(C.line); doc.setLineWidth(0.2); doc.line(M, H - 12, W - M, H - 12);
    font(8, false); color(C.grey);
    doc.text(T.footer, M, H - 7.5);
    doc.text(`${T.page} ${p} / ${n}`, W - M, H - 7.5, { align: 'right' });
  }
  doc.setProperties({ title: `Mobilis — ${T.title}`, subject: periodText(), creator: 'Mobilis', author: 'Mobilis' });
  const blob = doc.output('blob');
  return { blob, pages: n };
}

/** → Promise<Blob> (application/pdf) */
export async function renderPdf(data, lang = 'fr', opts = {}) { return (await renderPdfDetailed(data, lang, opts)).blob; }

// ---------- Partage ----------
const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
/** Envoie le PDF : natif (Filesystem cache + Share) · Web Share avec fichier · téléchargement. → 'native' | 'share' | 'download' | 'cancelled' */
export async function sharePdf(blob, fileName, { title = 'Mobilis' } = {}) {
  const store = await import('./store.js');
  if (store.isNative()) {
    const { Filesystem, Directory, Share } = await store.cap();
    const data = await blobToBase64(blob);
    const saved = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    try { await Share.share({ title, files: [saved.uri], dialogTitle: title }); return 'native'; }
    catch (e) { return /cancel/i.test(String(e?.message || e)) ? 'cancelled' : 'native'; }
  }
  const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'application/pdf' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'share'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'download';
}
