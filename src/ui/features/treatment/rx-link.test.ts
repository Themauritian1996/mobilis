import { describe, expect, it } from 'vitest';
import type { Plan, PlanId, PatientId } from '../../../core/types/clinical.ts';
import type { IsoDateTime } from '../../../core/types/common.ts';
import { fromStored, linkRx } from '../../../domains/treatment/plan.ts';
import { memoryDb } from '../../../domains/research/testing/fixtures.ts';
import { setRecordsDb } from '../../../services/db/records.ts';
import { applyRxSaved } from './rx-link.ts';

const T = '2026-11-22T10:00:00.000Z' as IsoDateTime;
const stored: Plan = {
  schemaVersion: 1,
  id: 'pl1' as PlanId,
  patientId: 'p1' as PatientId,
  revision: 1,
  status: 'draft',
  sourceAssessmentIds: [],
  actions: [],
  goals: [],
  createdAt: T,
  updatedAt: T,
  ownerUid: 'u',
};

describe('plan ↔ programme rx', () => {
  it('linkRx : code, sinon identifiant local, sinon inchangé', () => {
    const p = fromStored(stored);
    const now = new Date('2026-11-23T10:00:00Z');
    expect(linkRx(p, { code: 'ABCD' }, now).rxCode).toBe('ABCD');
    expect(linkRx(p, { code: null, localId: 'L123' }, now).rxCode).toBe('L123');
    expect(linkRx(p, { code: null, localId: null }, now)).toBe(p);
    const linked = linkRx(p, { code: 'ABCD' }, now);
    expect(linkRx(linked, { code: 'ABCD' }, now)).toBe(linked);
  });

  it('applyRxSaved enregistre plan.rxCode ; sans planId, ne fait rien', async () => {
    const db = memoryDb();
    setRecordsDb(db);
    await db.set('plans', 'pl1', stored);
    expect(await applyRxSaved({ code: 'ZZ', planId: null })).toBe(false);
    expect(await applyRxSaved({ code: 'ZZ', planId: 'absent' })).toBe(false);
    expect(await applyRxSaved({ code: 'K7M2', localId: 'L1', planId: 'pl1' })).toBe(true);
    expect((await db.get('plans', 'pl1'))?.rxCode).toBe('K7M2');
    expect(await applyRxSaved({ code: 'K7M2', planId: 'pl1' })).toBe(false);
  });
});
