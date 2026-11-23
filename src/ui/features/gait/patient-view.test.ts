import { describe, expect, it } from 'vitest';
import type { GaitView } from '../../../domains/gait/index.ts';
import { generateGait, variantParams, type Variant } from '../../../domains/gait/testing/synthetic.ts';
import type { PatientId } from '../../../core/types/clinical.ts';
import { analyzeCapture, type ViewRecording } from './analysis.ts';
import {
  buildAssessmentDoc,
  defaultsFromPatient,
  patientSafeDoc,
  patientSafeResult,
  readStoredResult,
  validateForm,
  viewerRole,
} from './model.ts';

// Audit v2 (spec §10.8, §10.10) : en rôle patient, #/marche-res affichait les options de prise en charge du catalogue
// (orthèse AFO, toxine botulique…) et toute l'évaluation prothétique (emboîture, « à discuter avec le prothésiste »).
const CLINICIAN_ONLY = /toxine|botul|chirurg|orth[eè]se|\bAFO\b|proth[eè]s|embo[iî]ture|socket/i;

function doc(variant: Variant, prosthetic: boolean) {
  const views: GaitView[] = ['sagittal-left', 'sagittal-right', 'frontal'];
  const recs: ViewRecording[] = views.map((view) => {
    const { frames, truth } = generateGait(variantParams(variant, { view, fps: 60 }));
    return { view, frames, aspect: truth.imageAspect };
  });
  const v = validateForm({
    ...defaultsFromPatient(null),
    heightCm: '175',
    ...(prosthetic
      ? { prostheticMode: true, prosthesisLevel: 'transtibial' as const, prosthesisSide: 'L' as const }
      : {}),
  });
  if (!v.ok) throw new Error('formulaire');
  const out = analyzeCapture(recs, v.settings, null, 2026, []);
  return buildAssessmentDoc({
    id: 'a1',
    patientId: 'p1' as PatientId,
    ownerUid: 'p1',
    nowIso: '2026-11-23T10:00:00.000Z',
    settings: v.settings,
    views,
    assessment: out.assessment,
    ...(out.prosthetic ? { prosthetic: out.prosthetic } : {}),
  });
}

describe('vue patient des résultats de marche', () => {
  it('rôle d’affichage = rôle du profil (un clinicien en « mode test patient » reste clinicien)', () => {
    expect(viewerRole('clinician')).toBe('clinician');
    expect(viewerRole('patient')).toBe('patient');
    expect(viewerRole(undefined)).toBe('patient');
  });

  it('pied tombant : la vue clinicien garde l’orthèse/la toxine, la vue patient non', () => {
    const r = readStoredResult(doc('foot_drop', false))!;
    const fd = r.findings.find((f) => f.id === 'foot_drop_steppage' && f.status === 'probable');
    expect(fd).toBeDefined();
    expect(fd!.suggestions.join(' ')).toMatch(CLINICIAN_ONLY);
    const safe = patientSafeResult(r);
    const sfd = safe.findings.find((f) => f.id === 'foot_drop_steppage' && f.side === fd!.side)!;
    expect(sfd.suggestions.length).toBeGreaterThan(0);
    for (const f of safe.findings) expect(f.suggestions.join(' ')).not.toMatch(CLINICIAN_ONLY);
  });

  it('prothèse : l’évaluation prothétique est retirée de la vue et de l’export du patient', () => {
    const a = doc('prosthetic_asymmetry', true);
    const r = readStoredResult(a)!;
    expect(r.prosthetic).toBeDefined();
    const safe = patientSafeResult(r);
    expect(safe.prosthetic).toBeUndefined();
    const exported = JSON.stringify(patientSafeDoc(a, r));
    expect(exported).not.toMatch(/prothésiste|emboîture/i);
    expect(exported).not.toMatch(/"prosthetic":/);
  });
});
