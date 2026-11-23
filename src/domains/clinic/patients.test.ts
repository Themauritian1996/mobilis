import { describe, expect, it } from 'vitest';
import { createMemoryDatabase } from '../../services/db/index.ts';
import type { Annotation, Assessment, Patient } from '../../core/types/clinical.ts';
import {
  buildTimeline,
  deletePatientRecord,
  ensureSelfPatient,
  loadPatientRecords,
  newPatient,
  newRecordId,
  searchPatients,
  updatePatient,
  validatePatientInput,
} from './patients.ts';
import { annotationsFor, editAnnotation, newAnnotation } from './annotations.ts';

const NOW = '2026-11-22T12:00:00.000Z';
const asmt = (id: string, patientId: string, ownerUid: string, at = NOW): Assessment =>
  ({
    schemaVersion: 1,
    id,
    patientId,
    ownerUid,
    kind: 'gait',
    performedAt: at,
    metrics: [],
    findings: [],
    videoRetained: false,
    createdAt: at,
    updatedAt: at,
  }) as unknown as Assessment;
const note = (id: string, ids: string[], text = 't', owner = 'c'): Annotation =>
  newAnnotation({ id, ownerUid: owner, patientId: 'p', assessmentIds: ids, authorRole: 'clinician', text, now: NOW });

describe('saisie du dossier', () => {
  it('valide nom, année de naissance, taille et choix', () => {
    expect(validatePatientInput({ displayName: ' ' }, 2026)).toEqual(['nameRequired']);
    expect(validatePatientInput({ displayName: 'A', birthYear: 1850, heightCm: 20 }, 2026)).toEqual([
      'birthYearRange',
      'heightRange',
    ]);
    expect(validatePatientInput({ displayName: 'A', birthYear: 1960, heightCm: 172 }, 2026)).toEqual([]);
    expect(validatePatientInput({ displayName: 'A', sex: 'x' as never }, 2026)).toEqual(['invalidChoice']);
  });

  it('crée et modifie l’identité sans perdre les autres champs', () => {
    const p = newPatient(
      {
        displayName: ' Mme Tremblay ',
        birthYear: 1950,
        heightCm: 160.44,
        prosthesis: { level: 'transtibial', side: 'left' },
      },
      { id: 'p1', ownerUid: 'c1', now: NOW },
    );
    expect(p).toMatchObject({ schemaVersion: 1, displayName: 'Mme Tremblay', heightCm: 160.4, ownerUid: 'c1' });
    const withResearch = { ...p, researchId: 'R-01', prosthesis: { ...p.prosthesis!, socket: 'TSB' } } as Patient;
    const q = updatePatient(
      withResearch,
      { displayName: 'Mme T.', heightCm: null, prosthesis: { level: 'transtibial', side: 'right' } },
      '2026-11-23T00:00:00.000Z',
    );
    expect(q.heightCm).toBeUndefined();
    expect(q.researchId).toBe('R-01');
    expect(q.prosthesis).toEqual({ level: 'transtibial', side: 'right', socket: 'TSB' });
    expect(q.createdAt).toBe(NOW);
  });

  it('recherche sans accents', () => {
    const l = [
      newPatient({ displayName: 'Élise Côté', birthYear: 1970 }, { id: 'a', ownerUid: 'c', now: NOW }),
      newPatient({ displayName: 'Bob', birthYear: 1980 }, { id: 'b', ownerUid: 'c', now: NOW }),
    ];
    expect(searchPatients(l, 'elise cote').map((p) => p.id)).toEqual(['a']);
    expect(searchPatients(l, '1980').map((p) => p.id)).toEqual(['b']);
    expect(searchPatients(l, '').map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('identifiants uniques', () => {
    expect(newRecordId('p_')).not.toBe(newRecordId('p_'));
  });
});

describe('fiche du patient connecté', () => {
  it('ensureSelfPatient crée la fiche (id = uid) puis complète sans écraser', async () => {
    const db = createMemoryDatabase();
    const p = await ensureSelfPatient(db, 'u1', { displayName: 'Jean', heightCm: 180 }, NOW);
    expect(p).toMatchObject({ id: 'u1', ownerUid: 'u1', displayName: 'Jean', heightCm: 180 });
    const q = await ensureSelfPatient(db, 'u1', { displayName: 'Autre', birthYear: 1960 }, NOW);
    expect(q).toMatchObject({ displayName: 'Jean', birthYear: 1960 });
  });
});

describe('chronologie et annotations', () => {
  it('rattache les notes et regroupe les comparaisons', () => {
    const a = asmt('a', 'p', 'c', '2026-11-01T00:00:00.000Z');
    const b = asmt('b', 'p', 'c', '2026-11-10T00:00:00.000Z');
    const n1 = note('n1', ['a'], 'note A');
    const n2 = note('n2', ['b', 'a'], 'A/B');
    const tl = buildTimeline({
      assessments: [a, b],
      annotations: [n1, n2],
      interventions: [],
      plans: [],
      followups: [],
    });
    expect(tl.map((x) => x.kind)).toEqual(['comparison', 'assessment', 'assessment']);
    const ia = tl.find((x) => x.kind === 'assessment' && x.doc.id === 'a');
    expect(ia && 'notes' in ia ? ia.notes.map((n) => n.id) : []).toEqual(['n1']);
    const cmp = tl[0];
    expect(cmp?.kind === 'comparison' ? cmp.assessmentIds : []).toEqual(['a', 'b']);
    expect(annotationsFor([n1, n2], ['a', 'b']).map((n) => n.id)).toEqual(['n2']);
  });

  it('valide et modifie une note', () => {
    expect(() => note('x', [])).toThrow();
    expect(() => note('x', ['a', 'b', 'c'])).toThrow();
    const n = note('x', ['a'], '  ok  ');
    expect(n.text).toBe('ok');
    expect(() => editAnnotation(n, '   ', NOW)).toThrow();
    expect(editAnnotation(n, 'modifiée', '2026-11-23T00:00:00.000Z')).toMatchObject({
      text: 'modifiée',
      createdAt: NOW,
    });
  });
});

describe('suppression d’un dossier', () => {
  it('supprime le dossier et ce que le clinicien a enregistré, retire le patient des études', async () => {
    const db = createMemoryDatabase();
    await db.set('patients', 'p', newPatient({ displayName: 'X' }, { id: 'p', ownerUid: 'c', now: NOW }));
    await db.set('assessments', 'a', asmt('a', 'p', 'c'));
    await db.set('assessments', 'shared', asmt('shared', 'p', 'p'));
    await db.set('assessments', 'other', asmt('other', 'q', 'c'));
    await db.set('annotations', 'n', note('n', ['a']));
    await db.set('studies', 's', {
      schemaVersion: 1,
      id: 's',
      ownerUid: 'c',
      name: 'Toxine',
      measures: [],
      timepoints: [],
      conditions: [],
      patientIds: ['p', 'q'],
      anonymizeExports: true,
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    expect(await deletePatientRecord(db, 'p', 'c', NOW)).toBe(3);
    expect(await db.get('patients', 'p')).toBeNull();
    expect((await loadPatientRecords(db, 'p')).assessments.map((x) => x.id)).toEqual(['shared']);
    expect(await db.get('assessments', 'other')).not.toBeNull();
    expect((await db.get('studies', 's'))?.patientIds).toEqual(['q']);
    await db.set('patients', 'z', newPatient({ displayName: 'Z' }, { id: 'z', ownerUid: 'autre', now: NOW }));
    await expect(deletePatientRecord(db, 'z', 'c')).rejects.toMatchObject({ code: 'records_not_owner' });
  });
});
