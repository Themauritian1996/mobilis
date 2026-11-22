import { describe, expect, it, vi } from 'vitest';
import type { Assessment, AssessmentId, IsoDateTime, PatientId } from '../core/types/index.ts';
import { createMemoryAuth } from './auth/index.ts';
import { createScriptedAi } from './ai/index.ts';
import { createMemoryDatabase } from './db/index.ts';
import { createMemoryStorage } from './storage/index.ts';

const now = '2026-11-22T00:00:00.000Z' as IsoDateTime;
const assessment = (id: string, patientId: string): Assessment => ({
  schemaVersion: 1,
  id: id as AssessmentId,
  patientId: patientId as PatientId,
  ownerUid: 'u1',
  kind: 'gait',
  performedAt: now,
  createdAt: now,
  updatedAt: now,
  metrics: [],
  findings: [],
  videoRetained: false,
});

describe('adaptateurs mémoire (contrats des ports)', () => {
  it('base : set/get/query/watch/remove, copies indépendantes', async () => {
    const db = createMemoryDatabase();
    const seen = vi.fn();
    db.watch('assessments', 'a1', seen);
    const a = assessment('a1', 'p1');
    await db.set('assessments', 'a1', a);
    await db.set('assessments', 'a2', assessment('a2', 'p2'));
    const got = await db.get('assessments', 'a1');
    expect(got).toEqual(a);
    expect(got).not.toBe(a);
    expect(await db.query('assessments', [{ field: 'patientId', op: '==', value: 'p2' }])).toHaveLength(1);
    await db.remove('assessments', 'a1');
    expect(await db.get('assessments', 'a1')).toBeNull();
    expect(seen).toHaveBeenLastCalledWith(null);
  });

  it('auth : connexion, déconnexion, abonnement', async () => {
    const auth = createMemoryAuth();
    const cb = vi.fn();
    auth.onChange(cb);
    await auth.signIn('google');
    expect(auth.currentUser()?.uid).toBe('local-user');
    await auth.signOut();
    expect(cb).toHaveBeenLastCalledWith(null);
  });

  it('IA : image sans consentement refusée', async () => {
    const ai = createScriptedAi(() => 'ok');
    const images = [{ mime: 'image/jpeg' as const, base64: '' }];
    await expect(ai.generate({ prompt: 'p', lang: 'fr', images })).rejects.toThrow(/Consentement/);
    await expect(ai.generate({ prompt: 'p', lang: 'fr', images, imageConsent: true })).resolves.toMatchObject({
      text: 'ok',
    });
  });

  it('stockage : aucune vidéo (ADR 0007)', async () => {
    const s = createMemoryStorage();
    await expect(s.put('x.webm', 'data', 'video/webm')).rejects.toThrow(/vidéo/);
    await s.put('exports/a.csv', 'a,b', 'text/csv');
    expect(await s.list('exports/')).toHaveLength(1);
  });
});
