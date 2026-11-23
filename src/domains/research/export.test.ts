import { describe, expect, it } from 'vitest';
import type { Intervention, InterventionId, PatientId, StudyId } from '../../core/types/clinical.ts';
import type { IsoDate } from '../../core/types/common.ts';
import type { JsPdfConstructor, PdfDocument } from '../outcomes/report-pdf.ts';
import { buildStudyData, summarizeStudy } from './aggregate.ts';
import { buildJsonExport, csvCell, exportFileName, toCsvLong } from './export.ts';
import { buildPdfModel, renderPdfModel } from './pdf.ts';
import { metricAssessment, patient, studyFromTemplate, T } from './testing/fixtures.ts';

const study = studyFromTemplate('s1', 'msk_injection', ['p1', 'p2']);
const patients = [patient('p1', 'R-001', 'Jeanne, "la" Tremblay'), patient('p2', 'R-002', 'Paul Roy')];
const A = (id: string, pid: string, tp: string, v: number, date: string) =>
  metricAssessment(id, pid, date, [{ metricId: 'pain_nrs', value: v, unit: '/10' }], {
    kind: 'custom',
    studyId: 's1' as StudyId,
    timepointId: tp,
  });
const data = buildStudyData(
  study,
  patients,
  [
    A('a1', 'p1', 't0', 8, '2026-01-01T09:00:00.000Z'),
    A('a2', 'p1', 'w2', 5, '2026-01-15T09:00:00.000Z'),
    A('a3', 'p2', 't0', 6.123456, '2026-01-02T09:00:00.000Z'),
  ],
  [],
);
const interventions: Intervention[] = [
  {
    schemaVersion: 1,
    id: 'i1' as InterventionId,
    patientId: 'p1' as PatientId,
    type: 'medication',
    date: '2026-01-01' as IsoDate,
    details: { site: 'Épaule D', dose: '40 mg' },
    createdAt: T,
    updatedAt: T,
    ownerUid: 'clin',
  },
];

describe('csvCell', () => {
  it('échappe guillemets, virgules et retours ; neutralise les formules', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(1.234567)).toBe('1.2346');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
  });
});

describe('CSV long', () => {
  it('anonymisé : identifiant de recherche seulement, date au jour, jour relatif', () => {
    const csv = toCsvLong(data.observations, { anonymize: true, bom: false });
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'research_id,timepoint,timepoint_label,offset_days,condition,measure,measure_label,value,unit,confidence,estimate,date,day_from_first',
    );
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('R-001,t0,T0,0,,pain,Douleur (EVA/ENS 0–10),8,/10,0.9,false,2026-01-01,0');
    expect(lines[2]).toBe('R-001,w2,T+2 sem,14,,pain,Douleur (EVA/ENS 0–10),5,/10,0.9,false,2026-01-15,14');
    expect(csv).not.toContain('Jeanne');
    expect(csv).not.toContain('p1,');
  });
  it('nominatif : nom et identifiant du dossier, nom échappé ; BOM par défaut', () => {
    const csv = toCsvLong(data.observations, { anonymize: false });
    expect(csv.startsWith('﻿research_id,patient_id,patient_name,')).toBe(true);
    expect(csv).toContain('R-001,p1,"Jeanne, ""la"" Tremblay",t0');
    expect(csv).toContain('2026-01-01T09:00:00.000Z');
    expect(csv).toContain(',6.1235,');
  });
});

describe('JSON complet', () => {
  it('anonymisé : aucun nom, identifiant interne ni champ libre', () => {
    const j = buildJsonExport(study, patients, data, interventions, { anonymize: true, exportedAt: T, notes: 'Note' });
    const text = JSON.stringify(j);
    expect(j).toMatchObject({ format: 'mobilis-study-export', schemaVersion: 1, anonymized: true, notes: 'Note' });
    expect(text).not.toMatch(/Jeanne|Paul|"p1"|"p2"|Épaule|40 mg|"a1"|"s1"/);
    expect(j.patients).toEqual([
      { researchId: 'R-001', sex: null, affectedSide: null },
      { researchId: 'R-002', sex: null, affectedSide: null },
    ]);
    expect(j.interventions).toEqual([{ researchId: 'R-001', type: 'medication', date: '2026-01-01' }]);
    expect(j.observations[0]).toMatchObject({ researchId: 'R-001', value: 8, date: '2026-01-01' });
    expect(j.deltas).toHaveLength(1);
    expect(j.summary.length).toBeGreaterThan(0);
  });
  it('nominatif : tout est conservé', () => {
    const j = buildJsonExport(study, patients, data, interventions, { anonymize: false, exportedAt: T });
    expect(j.study.id).toBe('s1');
    expect(j.patients[0]).toMatchObject({ patientId: 'p1', displayName: 'Jeanne, "la" Tremblay' });
    expect(j.interventions[0]).toMatchObject({ details: { site: 'Épaule D', dose: '40 mg' } });
    expect(j.observations[0]).toMatchObject({ patientId: 'p1', assessmentId: 'a1' });
  });
});

describe('PDF résumé', () => {
  it('modèle : une section par mesure scalaire, moyenne ± ET, delta, seuil', () => {
    const m = buildPdfModel(study, summarizeStudy(study, data), { exportedAt: T, notes: 'Notes cliniques' });
    expect(m.sections.map((s) => s.measure)).toEqual(study.measures.map((x) => x.label));
    const pain = m.sections[0]!;
    expect(pain.rows[0]).toEqual(['T0', '2', '7.06 ± 1.33 /10', '–', 'DMCI 2']);
    expect(pain.rows[1]).toEqual(['T+2 sem', '1', '5 /10', '-3 (n=1)', 'DMCI 2 — 1/1']);
    expect(m.subtitle).toContain('anonymisé');
  });
  it('rendu avec un jsPDF simulé', () => {
    const calls: string[] = [];
    function Fake(this: object): void {
      void this;
    }
    const fake = Fake as unknown as JsPdfConstructor;
    const proto: PdfDocument = {
      setFillColor: () => 0,
      setDrawColor: () => 0,
      setTextColor: () => 0,
      setFont: () => 0,
      setFontSize: () => 0,
      setLineWidth: () => 0,
      setLineDashPattern: () => 0,
      splitTextToSize: (t: string) => [t],
      text: (t: string) => calls.push(t),
      rect: () => 0,
      roundedRect: () => 0,
      line: () => 0,
      circle: () => 0,
      addPage: () => calls.push('<page>'),
      setPage: () => 0,
      getNumberOfPages: () => 1,
      setProperties: () => 0,
      output: () => new Blob(['%PDF'], { type: 'application/pdf' }),
    };
    Object.assign((fake as unknown as { prototype: object }).prototype, proto);
    const blob = renderPdfModel(fake, buildPdfModel(study, summarizeStudy(study, data), { exportedAt: T }));
    expect(blob.type).toBe('application/pdf');
    expect(calls).toContain(study.name);
    expect(calls.some((c) => c.includes('non homologué'))).toBe(true);
  });
});

describe('nom de fichier', () => {
  it('ASCII sans accents', () => {
    expect(exportFileName('Infiltration de toxine — été', 'csv', T)).toBe(
      'mobilis-infiltration-de-toxine-ete-2026-01-01.csv',
    );
  });
});
