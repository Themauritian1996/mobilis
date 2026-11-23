import { describe, expect, it } from 'vitest';
import type { Patient, PatientId } from '../../../core/types/clinical.ts';
import type { IsoDateTime } from '../../../core/types/common.ts';
import {
  compactResult,
  defaultsFromPatient,
  formFromAssessment,
  patientInput,
  recommendedViews,
  validateForm,
  type CaptureFormState,
} from './model.ts';

const T = '2026-11-22T10:00:00.000Z' as IsoDateTime;
const patient = (extra: Partial<Patient> = {}): Patient => ({
  schemaVersion: 1,
  id: 'p1' as PatientId,
  createdAt: T,
  updatedAt: T,
  ownerUid: 'u',
  ...extra,
});

describe('formulaire de capture', () => {
  it('préremplit la taille et le côté atteint depuis le dossier', () => {
    const f = defaultsFromPatient(patient({ heightCm: 172, affectedSide: 'right' }));
    expect(f.heightCm).toBe('172');
    expect(f.affectedSide).toBe('R');
    expect(f.targetCycles).toBe('3');
    expect(f.prostheticMode).toBe(false);
  });

  it('active le mode prothèse avec le profil prothétique ; niveau « other » à choisir', () => {
    const f = defaultsFromPatient(patient({ prosthesis: { level: 'transtibial', side: 'left' } }));
    expect(f).toMatchObject({ prostheticMode: true, prosthesisLevel: 'transtibial', prosthesisSide: 'L', footwear: 'prosthesis' });
    const g = defaultsFromPatient(patient({ prosthesis: { level: 'other', side: 'bilateral' } }));
    expect(g.prosthesisLevel).toBe('');
    expect(g.prosthesisSide).toBe('');
    expect(validateForm({ ...g, heightCm: '170' }).ok).toBe(false);
  });

  it('la taille est obligatoire et plausible', () => {
    const base = defaultsFromPatient(patient());
    expect(validateForm(base)).toMatchObject({ ok: false, errors: { heightCm: 'required' } });
    expect(validateForm({ ...base, heightCm: '12' })).toMatchObject({ ok: false, errors: { heightCm: 'range' } });
    const ok = validateForm({ ...base, heightCm: '175,5' });
    expect(ok.ok && ok.settings.heightCm).toBe(175.5);
  });

  it('valide le nombre de cycles (défaut 3, entier 1–10)', () => {
    const base: CaptureFormState = { ...defaultsFromPatient(patient()), heightCm: '170' };
    expect(validateForm({ ...base, targetCycles: '' })).toMatchObject({ ok: true, settings: { targetCycles: 3 } });
    expect(validateForm({ ...base, targetCycles: '2.5' })).toMatchObject({ ok: false, errors: { targetCycles: 'integer' } });
    expect(validateForm({ ...base, targetCycles: '11' })).toMatchObject({ ok: false, errors: { targetCycles: 'range' } });
  });

  it('en mode prothèse : niveau et côté requis, le côté atteint suit la prothèse', () => {
    const base: CaptureFormState = { ...defaultsFromPatient(patient()), heightCm: '170', prostheticMode: true };
    expect(validateForm(base)).toMatchObject({ ok: false, errors: { prosthesisLevel: 'required', prosthesisSide: 'required' } });
    const r = validateForm({ ...base, prosthesisLevel: 'transfemoral', prosthesisSide: 'R' });
    expect(r.ok && r.settings).toMatchObject({ prosthesis: { level: 'transfemoral', side: 'R' }, affectedSide: 'R', footwear: 'prosthesis' });
  });

  it('« refaire » exige la note de modification et reprend les réglages', () => {
    const base: CaptureFormState = { ...defaultsFromPatient(patient()), heightCm: '170' };
    expect(validateForm(base, { requireModificationNote: true })).toMatchObject({ ok: false, errors: { modificationNote: 'required' } });
    const f = formFromAssessment({ conditions: { heightCm: '180', assistiveDevice: 'cane', speed: 'fast', targetCycles: '4', footwear: 'barefoot' } }, base);
    expect(f).toMatchObject({ heightCm: '180', assistiveDevice: 'cane', speed: 'fast', targetCycles: '4', footwear: 'barefoot', modificationNote: '' });
  });
});

describe('vues et entrée du moteur', () => {
  it('recommande trois vues ; la latérale suit le côté atteint', () => {
    expect(recommendedViews({ affectedSide: 'L' })).toEqual(['sagittal-left', 'frontal', 'posterior']);
    expect(recommendedViews({ affectedSide: 'R' })).toEqual(['sagittal-right', 'frontal', 'posterior']);
    expect(recommendedViews({ affectedSide: 'none', prosthesis: { level: 'transtibial', side: 'R' } })[0]).toBe('sagittal-right');
  });

  it('construit l’entrée patient (âge, sexe) du dossier', () => {
    const r = validateForm({ ...defaultsFromPatient(patient()), heightCm: '170' });
    if (!r.ok) throw new Error('invalide');
    const p = patientInput(r.settings, patient({ birthYear: 1956, sex: 'female' }), 2026);
    expect(p).toMatchObject({ heightCm: 170, ageYears: 70, sex: 'F', speedCondition: 'comfortable' });
  });

  it('compactResult arrondit et vide la série d’échelle', () => {
    const c = compactResult({ a: 1.234567, scale: { series: [1, 2, 3], metersPerUnit: 0.123456789 } });
    expect(c).toEqual({ a: 1.2346, scale: { series: [], metersPerUnit: 0.1235 } });
  });
});
