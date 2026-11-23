import { describe, expect, it } from 'vitest';
import { compareAssessments, DETERMINANTS, type GaitAnalysis, type GaitView } from '../../../domains/gait/index.ts';
import { generateGait, variantParams, type Variant } from '../../../domains/gait/testing/synthetic.ts';
import type { PatientId } from '../../../core/types/clinical.ts';
import { analyzeCapture, type ViewRecording } from './analysis.ts';
import { curveChartSvg, linePath, niceStep, yDomain } from './charts.ts';
import { buildAssessmentDoc, readStoredResult, validateForm, defaultsFromPatient } from './model.ts';
import { normalBand } from './normal-band.ts';
import {
  captureConfidence,
  deltaRows,
  determinantChanges,
  determinantViews,
  estimateViews,
  findingChanges,
  findingViews,
  fmtNum,
  fmtSigned,
  jointCharts,
  jointPhaseTable,
  overlayCharts,
  spatioRows,
  speedSummary,
  viewQuality,
} from './present.ts';
import { reportLines } from './export.ts';

function record(variant: Variant, views: GaitView[] = ['sagittal-left', 'frontal']) {
  const recs: ViewRecording[] = [];
  let heightCm = 175;
  for (const view of views) {
    const { frames, truth } = generateGait(variantParams(variant, { view, fps: 60, cycles: 6 }));
    heightCm = truth.params.heightM * 100;
    recs.push({ view, frames, aspect: truth.imageAspect });
  }
  const r = validateForm({ ...defaultsFromPatient(null), heightCm: String(heightCm) });
  if (!r.ok) throw new Error('formulaire');
  return { recs, settings: r.settings };
}

const normal = record('normal');
const outN = analyzeCapture(normal.recs, normal.settings, null, 2026);
const footDrop = record('foot_drop', ['sagittal-left']);
const outF = analyzeCapture(footDrop.recs, footDrop.settings, null, 2026);

describe('nombres', () => {
  it('formate avec la virgule décimale et le vrai signe moins', () => {
    expect(fmtNum(1.234, 2, 'fr-CA')).toBe('1,23');
    expect(fmtNum(null, 2)).toBe('–');
    expect(fmtSigned(-0.5, 1, 'fr-CA')).toBe('−0,5');
    expect(fmtSigned(0.004, 2, 'fr-CA')).toBe('0,00');
  });
});

describe('mise en forme des résultats', () => {
  it('tableau spatio-temporel : vitesse, cadence, côtés, norme', () => {
    const rows = spatioRows(outN.analyses, 'fr-CA');
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('gait_speed');
    expect(ids).toContain('cadence');
    const step = rows.find((r) => r.id === 'step_length');
    expect(step?.L && step.R).toBeTruthy();
    const sp = speedSummary(outN.analyses, 'fr-CA');
    expect(sp?.value).toBeGreaterThan(0.5);
    expect(sp?.pctOfNorm).not.toBeNull();
  });

  it('les six déterminants, sans score global, ordonnés', () => {
    const v = determinantViews(outN.assessment.determinants, 'fr', 'fr-CA');
    expect(v.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(v).toHaveLength(DETERMINANTS.length);
    for (const d of v) expect(['affected', 'preserved', 'uncertain']).toContain(d.status);
    expect(Object.keys(v[0] ?? {})).not.toContain('score');
  });

  it('tableau articulations × phases', () => {
    const t = jointPhaseTable(outN.assessment.jointPhases, 'fr-CA');
    expect(t.phases.length).toBeGreaterThan(3);
    expect(t.rows.length).toBeGreaterThan(0);
    for (const r of t.rows) expect(r.cells).toHaveLength(t.phases.length);
  });

  it('défauts : un pied tombant ressort, trié, avec « pourquoi », suggestions et références', () => {
    const f = findingViews(outF.assessment.findings, 'fr', 'fr-CA');
    const fd = f.find((x) => x.id.includes('foot_drop') || /tombant/i.test(x.name));
    expect(fd).toBeTruthy();
    expect(fd?.why.length).toBeGreaterThan(0);
    expect(fd?.references.length).toBeGreaterThan(0);
    expect(fd?.confidencePct).toBeGreaterThan(0);
    const rank = ['probable', 'possible', 'observe'];
    const idx = f.map((x) => rank.indexOf(x.status));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('estimations frontales : en avant seulement si facteur limitant', () => {
    const e = estimateViews(outN.analyses, 'fr-CA');
    for (const x of e.featured) expect(x.limitingFactor).toBe(true);
    for (const x of e.others) expect(x.limitingFactor).toBe(false);
    expect(e.featured.length + e.others.length).toBeGreaterThan(0);
  });

  it('qualité et confiance : fréquence mesurée, règle de confiance', () => {
    const q = outN.analyses.map(viewQuality);
    expect(q[0]?.fps).toBeGreaterThan(55);
    expect(captureConfidence([])).toMatchObject({ level: 'low' });
    const good = { ...(q[0] as (typeof q)[0]), ok: true, fps: 60, cycles: { L: 4, R: 4 }, scaleUncertaintyPct: 3 };
    expect(captureConfidence([good]).level).toBe('high');
    expect(captureConfidence([{ ...good, fps: 40 }]).level).toBe('medium');
    expect(captureConfidence([{ ...good, fps: 20 }]).level).toBe('low');
    expect(captureConfidence([{ ...good, cycles: { L: 2, R: 5 } }]).level).toBe('medium');
    expect(captureConfidence([{ ...good, cycles: { L: 1, R: 5 } }]).level).toBe('low');
  });
});

describe('courbes', () => {
  it('prépare les courbes moyenne ± ET par articulation et côté, avec bande normale', () => {
    const cs = jointCharts(outN.analyses);
    const knee = cs.find((c) => c.joint === 'knee');
    expect(knee?.series.length).toBeGreaterThan(0);
    expect(knee?.series[0]?.mean).toHaveLength(101);
    expect(knee?.band?.hi).toHaveLength(101);
    expect(cs.find((c) => c.joint === 'trunk')?.band).toBeNull();
  });

  it('bande normale : genou fléchi en oscillation, extension au contact', () => {
    const b = normalBand('knee');
    expect(b?.status).toBe('to_verify');
    expect((b?.hi[72] ?? 0) > 55).toBe(true);
    expect((b?.hi[0] ?? 99) < 12).toBe(true);
    expect(normalBand('trunk')).toBeNull();
  });

  it('SVG accessible : titre, description, série, bande, trous coupés', () => {
    const mean = Array.from({ length: 101 }, (_, i) => Math.sin(i / 16) * 20);
    mean[50] = NaN;
    const svg = curveChartSvg({
      id: 't',
      title: 'Genou <test>',
      unit: '°',
      series: [{ id: 'a', label: 'G', mean, sd: mean.map(() => 3), cls: 's0' }],
      band: { lo: mean.map(() => -10), hi: mean.map(() => 10), label: 'norme' },
      desc: 'Description',
      xLabel: '% cycle',
    });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title id="gc-t-t">Genou &lt;test&gt;</title>');
    expect(svg).toContain('gc-band');
    expect(svg.match(/gc-line/g)?.length).toBe(1);
    expect(linePath([1, NaN, 2], (i) => i, (v) => v)).toBe('M0 1M2 2');
    expect(niceStep(37)).toBe(5);
    const d = yDomain({ series: [{ id: 'a', label: '', mean: [-3, 12], cls: 's0' }] });
    expect(d.lo).toBeLessThanOrEqual(-3);
    expect(d.hi).toBeGreaterThanOrEqual(12);
  });
});

describe('enregistrement et comparaison A/B', () => {
  const doc = buildAssessmentDoc({
    id: 'a1',
    patientId: 'p1',
    ownerUid: 'u',
    nowIso: '2026-11-22T10:00:00.000Z',
    settings: normal.settings,
    views: normal.recs.map((r) => r.view),
    assessment: outN.assessment,
    fps: outN.fps,
    durationsS: outN.durationsS,
  });

  it('respecte le contrat du brief', () => {
    expect(doc).toMatchObject({ schemaVersion: 1, kind: 'gait', engineVersion: 'gait-1', videoRetained: false, views: ['lateral_left', 'frontal'] });
    expect(doc.conditions?.['heightCm']).toBeTruthy();
    expect(doc.metrics.length).toBeGreaterThan(10);
    expect(doc.metrics.every((m) => Number.isFinite(m.value))).toBe(true);
    expect(JSON.stringify(doc).length).toBeLessThan(900_000);
    expect(readStoredResult(doc)?.determinants).toHaveLength(6);
  });

  it('mode prothèse : kind prosthetic_gait et result.prosthetic', () => {
    const r = validateForm({ ...defaultsFromPatient(null), heightCm: '175', prostheticMode: true, prosthesisLevel: 'transtibial', prosthesisSide: 'L' });
    if (!r.ok) throw new Error('formulaire');
    const o = analyzeCapture(normal.recs, r.settings, null, 2026);
    expect(o.prosthetic?.deviations.length).toBeGreaterThan(0);
    const d = buildAssessmentDoc({ id: 'a2', patientId: 'p1' as PatientId, ownerUid: 'u', nowIso: '2026-11-22T10:00:00.000Z', settings: r.settings, views: ['sagittal-left'], assessment: o.assessment, prosthetic: o.prosthetic! });
    expect(d.kind).toBe('prosthetic_gait');
    expect(readStoredResult(d)?.prosthetic?.deviations.length).toBeGreaterThan(0);
  });

  it('le résultat relu depuis le JSON permet la comparaison A/B', () => {
    const docF = buildAssessmentDoc({
      id: 'a3', patientId: 'p1', ownerUid: 'u', nowIso: '2026-11-23T10:00:00.000Z', settings: footDrop.settings,
      views: ['sagittal-left'], assessment: outF.assessment,
    });
    const a = readStoredResult(JSON.parse(JSON.stringify(doc)))?.analyses as GaitAnalysis[];
    const b = readStoredResult(JSON.parse(JSON.stringify(docF)))?.analyses as GaitAnalysis[];
    const cmp = compareAssessments(a, b);
    const rows = deltaRows(cmp, 'fr-CA');
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0]?.significant).toBe(true);
    const ankle = rows.find((r) => r.id === 'ankle_msw' && r.side === 'L');
    expect(ankle?.significant).toBe(true);
    expect(ankle?.margin.startsWith('±')).toBe(true);
    expect(Array.isArray(determinantChanges(cmp))).toBe(true);
    for (const c of findingChanges(cmp)) expect(['better', 'worse', 'other']).toContain(c.direction);
    expect(overlayCharts(a, b).length).toBeGreaterThan(0);
  });

  it('le PDF reprend les sections clés', () => {
    const lines = reportLines(doc, readStoredResult(doc)!, (k) => k, 'fr-CA', 'fr');
    const text = lines.map((l) => l.text || (l.cols ?? []).join(' ')).join('\n');
    expect(text).toContain('sec_quality');
    expect(text).toContain('sec_determinants');
    expect(lines.filter((l) => l.kind === 'row').length).toBeGreaterThan(3);
  });
});
