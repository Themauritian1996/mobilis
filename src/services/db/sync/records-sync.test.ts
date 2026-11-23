import { describe, expect, it } from 'vitest';
import type { Annotation, Assessment, Patient } from '../../../core/types/clinical.ts';
import { createMemoryRecordsKv, type RecordsKv } from '../local/records-kv.ts';
import { createLocalRecordsStore } from '../local/records-store.ts';
import { migrateRecord, _schemaFor, RECORD_COLLECTIONS } from '../local/record-schemas.ts';
import { assertCompleteChain } from '../../../core/schema.ts';
import { createAccountRecords } from '../records-account.ts';
import { createFakeCloud } from './fake-cloud.test-util.ts';
import { createSyncedRecords, type SyncedRecordsOptions } from './records-sync.ts';
import { decodeFromCloud, encodeForCloud } from './remote.ts';
import { desiredSharedWith, planAutoCreate, type ShareTarget } from './sharing.ts';

let tick = 0;
const clock = (): string => new Date(Date.UTC(2026, 10, 22, 12, 0, tick++)).toISOString();

const patient = (id: string, owner: string, extra: Partial<Patient> = {}): Patient =>
  ({
    schemaVersion: 1,
    id,
    ownerUid: owner,
    createdAt: clock(),
    updatedAt: clock(),
    ...extra,
  }) as Patient;

const assessment = (id: string, owner: string, patientId: string, extra: Partial<Assessment> = {}): Assessment =>
  ({
    schemaVersion: 1,
    id,
    ownerUid: owner,
    patientId,
    kind: 'gait',
    performedAt: clock(),
    metrics: [],
    findings: [],
    videoRetained: false,
    createdAt: clock(),
    updatedAt: clock(),
    ...extra,
  }) as Assessment;

function device(
  kv: RecordsKv,
  uid: string,
  cloud: ReturnType<typeof createFakeCloud> | null,
  extra: Partial<SyncedRecordsOptions> = {},
) {
  return createSyncedRecords({
    store: createLocalRecordsStore(kv, uid),
    uid,
    remote: cloud ? cloud.as(uid) : null,
    now: clock,
    autoSyncMs: null,
    ...extra,
  });
}

describe('persistance locale', () => {
  it('conserve les documents après un redémarrage (même stockage)', async () => {
    const kv = createMemoryRecordsKv();
    const a = device(kv, 'u1', null);
    await a.db.set('patients', 'p1', patient('p1', 'u1', { displayName: 'Mme A', heightCm: 165 }));
    const b = device(kv, 'u1', null);
    expect((await b.db.get('patients', 'p1'))?.displayName).toBe('Mme A');
    expect(Object.keys(kv.dump()).every((k) => k.startsWith('mobilis.v2.u1.'))).toBe(true);
  });

  it('sépare les comptes sur un même appareil', async () => {
    const kv = createMemoryRecordsKv();
    await device(kv, 'u1', null).db.set('patients', 'p1', patient('p1', 'u1'));
    expect(await device(kv, 'u2', null).db.query('patients')).toEqual([]);
  });

  it('impose le propriétaire et filtre les requêtes', async () => {
    const s = device(createMemoryRecordsKv(), 'u1', null);
    await s.db.set('assessments', 'a1', assessment('a1', 'autre', 'p1'));
    await s.db.set('assessments', 'a2', assessment('a2', 'u1', 'p2'));
    expect((await s.db.get('assessments', 'a1'))?.ownerUid).toBe('u1');
    expect((await s.db.query('assessments', [{ field: 'patientId', op: '==', value: 'p1' }])).map((x) => x.id)).toEqual(
      ['a1'],
    );
    await s.db.remove('assessments', 'a1');
    expect(await s.db.get('assessments', 'a1')).toBeNull();
  });

  it('migre un document nu (format 0) et un document sans schemaVersion', async () => {
    const kv = createMemoryRecordsKv({
      'mobilis.v2.u1.annotations.n1': JSON.stringify({ id: 'n1', patientId: 'p1', text: 'note' }),
    });
    const s = device(kv, 'u1', null);
    const n = await s.db.get('annotations', 'n1');
    expect(n).toMatchObject({ schemaVersion: 1, ownerUid: 'u1', assessmentIds: [], authorRole: 'clinician' });
    expect(JSON.parse(kv.dump()['mobilis.v2.u1.annotations.n1']!)).toMatchObject({ f: 1, col: 'annotations' });
  });

  it('masque sans effacer un document d’une version plus récente', async () => {
    const raw = JSON.stringify({ f: 1, col: 'patients', doc: { id: 'p9', schemaVersion: 2, ownerUid: 'u1' } });
    const kv = createMemoryRecordsKv({ 'mobilis.v2.u1.patients.p9': raw });
    const s = device(kv, 'u1', null);
    expect(await s.db.get('patients', 'p9')).toBeNull();
    expect(await s.db.query('patients')).toEqual([]);
    expect(kv.dump()['mobilis.v2.u1.patients.p9']).toBe(raw);
  });

  it('chaque collection a une chaîne de migrations complète', () => {
    for (const c of RECORD_COLLECTIONS) assertCompleteChain(_schemaFor(c, { ownerUid: 'x', now: 'n' }));
    expect(migrateRecord('assessments', { id: 'a', videoRetained: true }, { ownerUid: 'x', now: 'n' })).toMatchObject({
      videoRetained: false,
      metrics: [],
    });
  });

  it('notifie les abonnés (watch)', async () => {
    const s = device(createMemoryRecordsKv(), 'u1', null);
    const seen: (string | undefined)[] = [];
    s.db.watch('patients', 'p1', (d) => seen.push(d?.displayName));
    await s.db.set('patients', 'p1', patient('p1', 'u1', { displayName: 'X' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toContain('X');
  });
});

describe('synchronisation', () => {
  it('hors ligne → en ligne : rien n’est perdu', async () => {
    const cloud = createFakeCloud();
    const s = device(createMemoryRecordsKv(), 'c1', cloud);
    cloud.state.offline = true;
    await s.db.set('patients', 'p1', patient('p1', 'c1'));
    const r1 = await s.sync();
    expect(r1).toMatchObject({ ok: false, offline: true });
    expect(s.pending()).toBe(1);
    cloud.state.offline = false;
    expect(await s.sync()).toMatchObject({ ok: true, pushed: 1 });
    expect(s.pending()).toBe(0);
    expect(cloud.docs.has('patients/c1_p1')).toBe(true);
  });

  it('ne synchronise pas sans le drapeau ni pour un compte local', async () => {
    const cloud = createFakeCloud();
    const s = device(createMemoryRecordsKv(), 'c1', cloud, { enabled: () => false });
    await s.db.set('patients', 'p1', patient('p1', 'c1'));
    expect((await s.sync()).skipped).toBe('disabled');
    expect(cloud.state.writes).toBe(0);
    expect((await device(createMemoryRecordsKv(), 'local', null).sync()).skipped).toBe('local');
  });

  it('deux appareils : réception, suppression propagée, conflit (updatedAt le plus récent)', async () => {
    const cloud = createFakeCloud();
    const a = device(createMemoryRecordsKv(), 'c1', cloud);
    const b = device(createMemoryRecordsKv(), 'c1', cloud);
    await a.db.set('patients', 'p1', patient('p1', 'c1', { displayName: 'v1' }));
    await a.sync();
    await b.sync();
    expect((await b.db.get('patients', 'p1'))?.displayName).toBe('v1');

    // Conflit : B modifie d'abord (plus ancien), A ensuite (plus récent) → A gagne partout.
    const old = (await b.db.get('patients', 'p1'))!;
    await b.db.set('patients', 'p1', { ...old, displayName: 'B', updatedAt: clock() } as Patient);
    await a.db.set('patients', 'p1', { ...old, displayName: 'A', updatedAt: clock() } as Patient);
    await a.sync();
    await b.sync();
    expect((await b.db.get('patients', 'p1'))?.displayName).toBe('A');
    await a.sync();
    expect((await a.db.get('patients', 'p1'))?.displayName).toBe('A');

    // Suppression sur A → disparaît en ligne puis sur B.
    await a.db.remove('patients', 'p1');
    expect(await a.db.get('patients', 'p1')).toBeNull();
    await a.sync();
    expect(cloud.docs.has('patients/c1_p1')).toBe(false);
    await b.sync();
    expect(await b.db.get('patients', 'p1')).toBeNull();
  });

  it('encode les tableaux imbriqués (courbes) pour Firestore et les restitue', async () => {
    const v = {
      curves: [
        [1, 2],
        [3, [4, 5]],
      ],
      x: undefined,
      y: [{ z: [[0]] }],
    };
    const enc = encodeForCloud(v) as Record<string, unknown>;
    expect(JSON.stringify(enc)).not.toMatch(/\[\[/);
    expect(decodeFromCloud(enc)).toEqual({
      curves: [
        [1, 2],
        [3, [4, 5]],
      ],
      y: [{ z: [[0]] }],
    });
    const cloud = createFakeCloud();
    const a = device(createMemoryRecordsKv(), 'c1', cloud);
    await a.db.set(
      'assessments',
      'a1',
      assessment('a1', 'c1', 'p1', {
        result: {
          mean: [
            [1, 2],
            [3, 4],
          ],
        },
      }),
    );
    await a.sync();
    const b = device(createMemoryRecordsKv(), 'c1', cloud);
    await b.sync();
    expect((await b.db.get('assessments', 'a1'))?.result).toEqual({
      mean: [
        [1, 2],
        [3, 4],
      ],
    });
  });
});

describe('partage patient → clinicien et création automatique du dossier', () => {
  const setup = () => {
    const cloud = createFakeCloud({ ABC234: { by: 'clin' } });
    let target: ShareTarget | null | undefined = { uid: 'clin', via: 'ABC234' };
    const pat = device(createMemoryRecordsKv(), 'pat', cloud, { shareTarget: async () => target });
    const clin = device(createMemoryRecordsKv(), 'clin', cloud);
    return { cloud, pat, clin, setTarget: (t: ShareTarget | null | undefined) => (target = t) };
  };

  it('transmet évaluations, annotations et suivis ; crée le dossier chez le clinicien', async () => {
    const { pat, clin } = setup();
    await pat.db.set(
      'patients',
      'pat',
      patient('pat', 'pat', { displayName: 'Jean', birthYear: 1960, heightCm: 178, weightKg: 80 }),
    );
    await pat.db.set('assessments', 'a1', assessment('a1', 'pat', 'pat'));
    const note: Annotation = {
      schemaVersion: 1,
      id: 'n1' as Annotation['id'],
      ownerUid: 'pat',
      patientId: 'pat' as Annotation['patientId'],
      assessmentIds: ['a1' as Assessment['id']],
      authorRole: 'patient',
      text: 'Plus facile avec la canne',
      createdAt: clock() as Annotation['createdAt'],
      updatedAt: clock() as Annotation['updatedAt'],
    };
    await pat.db.set('annotations', 'n1', note);
    expect(pat.shareState('assessments', 'a1')).toBe('none'); // destinataire pas encore connu
    expect(await pat.sync()).toMatchObject({ ok: true, pushed: 3 });
    expect(pat.shareState('assessments', 'a1')).toBe('shared');

    const r = await clin.sync();
    expect(r).toMatchObject({ ok: true, created: 1 });
    const own = await clin.db.query('patients');
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ id: 'pat', ownerUid: 'clin', displayName: 'Jean', birthYear: 1960, heightCm: 178 });
    const list = await clin.db.query('assessments', [{ field: 'patientId', op: '==', value: 'pat' }]);
    expect(list.map((x) => x.id)).toEqual(['a1']);
    expect(clin.isForeign('assessments', 'a1')).toBe(true);
    expect((await clin.db.query('annotations'))[0]?.text).toBe('Plus facile avec la canne');
    // Lecture seule pour le clinicien
    await expect(clin.db.set('assessments', 'a1', list[0]!)).rejects.toMatchObject({ code: 'records_read_only' });
    await expect(clin.db.remove('assessments', 'a1')).rejects.toMatchObject({ code: 'records_read_only' });
    // Pas de doublon à la synchronisation suivante
    expect((await clin.sync()).created).toBe(0);
  });

  it('ne partage pas ce qui ne concerne pas le patient ni les plans', async () => {
    const { pat, cloud } = setup();
    await pat.db.set('assessments', 'x', assessment('x', 'pat', 'quelqu-un-d-autre'));
    await pat.db.set('plans', 'pl', {
      schemaVersion: 1,
      id: 'pl',
      ownerUid: 'pat',
      patientId: 'pat',
      revision: 1,
      status: 'draft',
      sourceAssessmentIds: [],
      actions: [],
      goals: [],
      createdAt: clock(),
      updatedAt: clock(),
    } as never);
    await pat.sync();
    expect(cloud.docs.get('assessments/pat_x')?.['sharedWith']).toEqual([]);
    expect(cloud.docs.get('plans/pat_pl')?.['sharedWith']).toEqual([]);
  });

  it('retrait du consentement : le clinicien ne voit plus les données, son dossier reste', async () => {
    const { pat, clin, setTarget } = setup();
    await pat.db.set('assessments', 'a1', assessment('a1', 'pat', 'pat'));
    await pat.sync();
    await clin.sync();
    expect(await clin.db.query('assessments')).toHaveLength(1);
    setTarget(null);
    expect((await pat.sync()).pushed).toBe(1);
    await clin.sync();
    expect(await clin.db.query('assessments')).toHaveLength(0);
    expect(await clin.db.query('patients')).toHaveLength(1);
  });

  it('lien inconnu (hors ligne) : le partage déjà accordé est conservé', async () => {
    const { pat, cloud, setTarget } = setup();
    await pat.db.set('assessments', 'a1', assessment('a1', 'pat', 'pat'));
    await pat.sync();
    setTarget(undefined);
    const a = (await pat.db.get('assessments', 'a1'))!;
    await pat.db.set('assessments', 'a1', { ...a, updatedAt: clock() } as Assessment);
    await pat.sync();
    expect(cloud.docs.get('assessments/pat_a1')?.['sharedWith']).toEqual(['clin']);
  });

  it('dossier supprimé par le clinicien : recréé seulement si le patient transmet du nouveau', async () => {
    const { pat, clin } = setup();
    await pat.db.set('assessments', 'a1', assessment('a1', 'pat', 'pat'));
    await pat.sync();
    await clin.sync();
    await clin.db.remove('patients', 'pat');
    await clin.dismissPatient('pat');
    await clin.sync();
    expect(await clin.db.query('patients')).toHaveLength(0);
    await pat.db.set('assessments', 'a2', assessment('a2', 'pat', 'pat', { updatedAt: clock() as never }));
    await pat.sync();
    expect((await clin.sync()).created).toBe(1);
  });

  it('les règles refusent un partage vers un compte qui n’est pas l’auteur du programme', async () => {
    const cloud = createFakeCloud({ ABC234: { by: 'clin' } });
    const pat = device(createMemoryRecordsKv(), 'pat', cloud, {
      shareTarget: async () => ({ uid: 'intrus', via: 'ABC234' }),
    });
    await pat.db.set('assessments', 'a1', assessment('a1', 'pat', 'pat'));
    const r = await pat.sync();
    expect(r.ok).toBe(false);
    expect((r.error as { code?: string }).code).toBe('permission-denied');
    expect(pat.pending()).toBe(1);
  });

  it('suppression Loi 25 : appareil et en ligne', async () => {
    const { pat, clin, cloud } = setup();
    await pat.db.set('patients', 'pat', patient('pat', 'pat'));
    await pat.db.set('assessments', 'a1', assessment('a1', 'pat', 'pat'));
    await pat.sync();
    await clin.sync();
    cloud.state.offline = true;
    await expect(pat.eraseAll({ remote: true })).rejects.toBeTruthy();
    expect(await pat.db.query('assessments')).toHaveLength(1); // rien effacé si le réseau échoue
    cloud.state.offline = false;
    expect((await pat.eraseAll({ remote: true })).removedOnline).toBe(2);
    expect(await pat.db.query('assessments')).toHaveLength(0);
    expect([...cloud.docs.keys()].filter((k) => k.includes('pat_'))).toEqual([]);
    await clin.sync();
    expect(await clin.db.query('assessments')).toHaveLength(0);
  });
});

describe('règles pures de partage', () => {
  const t = { uid: 'clin', via: 'C' };
  it('desiredSharedWith', () => {
    expect(desiredSharedWith('assessments', { patientId: 'pat' }, 'pat', t)).toEqual(['clin']);
    expect(desiredSharedWith('assessments', { patientId: 'x' }, 'pat', t)).toEqual([]);
    expect(desiredSharedWith('patients', { id: 'pat' }, 'pat', t)).toEqual(['clin']);
    expect(desiredSharedWith('patients', { id: 'autre' }, 'pat', t)).toEqual([]);
    expect(desiredSharedWith('plans', { patientId: 'pat' }, 'pat', t)).toEqual([]);
    expect(desiredSharedWith('assessments', { patientId: 'pat' }, 'pat', null)).toEqual([]);
    expect(desiredSharedWith('assessments', { patientId: 'pat' }, 'pat', undefined, ['clin'])).toEqual(['clin']);
    expect(desiredSharedWith('assessments', { patientId: 'clin' }, 'clin', t)).toEqual([]);
  });
  it('planAutoCreate', () => {
    const base = { uid: 'clin', now: '2026-11-22T00:00:00.000Z', ownPatientIds: new Set<string>(), dismissed: {} };
    expect(
      planAutoCreate({ ...base, sharedPatients: [], sharedDocs: [{ ownerUid: 'p', patientId: 'p' }] }),
    ).toHaveLength(1);
    expect(
      planAutoCreate({ ...base, sharedPatients: [], sharedDocs: [{ ownerUid: 'p', patientId: 'q' }] }),
    ).toHaveLength(0);
    expect(
      planAutoCreate({
        ...base,
        ownPatientIds: new Set(['p']),
        sharedPatients: [],
        sharedDocs: [{ ownerUid: 'p', patientId: 'p' }],
      }),
    ).toHaveLength(0);
    expect(
      planAutoCreate({
        ...base,
        dismissed: { p: '2026-11-21' },
        sharedPatients: [],
        sharedDocs: [{ ownerUid: 'p', patientId: 'p', updatedAt: '2026-11-20' }],
      }),
    ).toHaveLength(0);
  });
});

describe('compte courant (façade installée par setRecordsDb)', () => {
  it('change de magasin à la connexion et synchronise', async () => {
    const cloud = createFakeCloud();
    let user: { uid: string; local?: boolean } | null = { uid: 'local', local: true };
    let cb: ((u: unknown) => void) | null = null;
    const acc = createAccountRecords({
      kv: createMemoryRecordsKv(),
      currentUser: () => user,
      onUserChange: (f) => (cb = f as never),
      remoteFor: (u) => cloud.as(u.uid),
      shareTarget: async () => null,
      enabled: () => true,
      now: clock,
      autoSyncMs: null,
    });
    await acc.db.set('patients', 'p1', patient('p1', 'local'));
    expect(await acc.db.query('patients')).toHaveLength(1);
    user = { uid: 'c1' };
    cb!(user);
    expect(await acc.db.query('patients')).toHaveLength(0);
    await acc.db.set('patients', 'p2', patient('p2', 'c1'));
    await acc.sync();
    expect(cloud.docs.has('patients/c1_p2')).toBe(true);
    await acc.eraseMine({ remote: true });
    expect(cloud.docs.size).toBe(0);
  });
});
