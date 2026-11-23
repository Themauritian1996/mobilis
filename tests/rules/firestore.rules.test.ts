/**
 * Tests de firestore.rules sur l'ÉMULATEUR Firestore (@firebase/rules-unit-testing). Exécution :
 *   npx firebase-tools emulators:exec --only firestore --project demo-mobilis "npm run test:rules"
 * (job `rules` de .github/workflows/ci-v2.yml ; projet demo-* : aucun secret, aucun accès à la production).
 *
 * Trois volets :
 *  1. Non-régression v1.15 : chaque lecture/écriture de www/js/store.js (branche main, en production) reste permise,
 *     avec les mêmes formes de documents ; ce qui était interdit le reste.
 *  2. Les 10 cas de docs/adr/0009-dossier-patient.md (dossiers cliniques v2).
 *  3. La faille de l'audit (docs/audit-v2.md #10) : connaître un code de programme ne suffit plus pour partager.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let env: RulesTestEnvironment;

type Db = ReturnType<RulesTestContext['firestore']>;
type Data = Record<string, unknown>;

const PAT = 'patientA';
const PAT2 = 'patientB';
const CLIN = 'clinX';
const CLIN2 = 'clinY';
const EVIL = 'intrus';
const CODE = 'ABC234';
const NOW = '2026-11-23T12:00:00.000Z';

const as = (uid: string): Db => env.authenticatedContext(uid).firestore();
const anon = (): Db => env.unauthenticatedContext().firestore();
async function seed(fn: (db: Db) => Promise<unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mobilis',
    firestore: { rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

// ---------------------------------------------------------------- Formes de documents de la v1.15 (www/js/store.js)
const v1Profile = (): Data => ({
  name: 'Mme A',
  pathology: 'lombalgie',
  rxCode: CODE,
  shareProgress: true,
  levels: { squat: 2 },
  badges: {},
});
const v1Session = (id: string, date: number): Data => ({
  id,
  date,
  items: [{ id: 'squat', pain: 2, sets: [{ reps: 10, quality: 0.8 }] }],
});
const v1Rx = (by: string, extra: Data = {}): Data => ({
  label: 'Lombalgie phase 1',
  clinician: 'Dr X',
  lang: 'fr',
  exercises: [{ id: 'squat', level: 1 }],
  ai: null,
  code: CODE,
  by,
  version: 1,
  updated: 1_700_000_000_000,
  created: 1_700_000_000_000,
  ...extra,
});
const v1Progress = (uid: string): Data => ({
  name: 'Mme A',
  week: 2,
  phase: 1,
  sessions7: 3,
  planned: 4,
  pain7: 2.5,
  quality7: 80,
  levels: {},
  flare: false,
  ex: {},
  last: [{ date: 1_700_000_000_000, n: 3, pain: 2 }],
  notes: [],
  badges: 0,
  uid,
  updated: Date.now(),
});

describe('v1.15 — non-régression (production, branche main)', () => {
  describe('users/{uid} et sessions (loadData, saveUserDoc, saveSession, deleteSession, deleteCloudData)', () => {
    it('le patient lit son document et ses séances triées par date', async () => {
      await seed(async (db) => {
        await db.doc(`users/${PAT}`).set({ profile: v1Profile(), journal: [], updated: 1 });
        await db.doc(`users/${PAT}/sessions/s1`).set(v1Session('s1', 1));
      });
      const db = as(PAT);
      await assertSucceeds(db.doc(`users/${PAT}`).get());
      await assertSucceeds(db.collection(`users/${PAT}/sessions`).orderBy('date').get());
      await assertSucceeds(db.collection(`users/${PAT}/sessions`).get());
    });

    it('le patient écrit son profil / journal (setDoc merge), ses séances, et les supprime', async () => {
      const db = as(PAT);
      // Premier enregistrement (document absent) puis mises à jour fusionnées.
      await assertSucceeds(db.doc(`users/${PAT}`).set({ profile: v1Profile(), updated: Date.now() }, { merge: true }));
      await assertSucceeds(
        db.doc(`users/${PAT}`).set({ journal: [{ day: '2026-11-23', pain: 3 }], updated: Date.now() }, { merge: true }),
      );
      await assertSucceeds(db.doc(`users/${PAT}/sessions/s1`).set(v1Session('s1', 1)));
      await assertSucceeds(db.doc(`users/${PAT}/sessions/s1`).set(v1Session('s1', 2)));
      await assertSucceeds(db.doc(`users/${PAT}/sessions/s1`).delete());
      await assertSucceeds(db.doc(`users/${PAT}`).delete());
    });

    it('interdit : lire ou écrire les données d’un autre compte, ou sans connexion', async () => {
      await seed(async (db) => {
        await db.doc(`users/${PAT}`).set({ profile: v1Profile() });
        await db.doc(`users/${PAT}/sessions/s1`).set(v1Session('s1', 1));
      });
      for (const db of [as(PAT2), as(CLIN), anon()]) {
        await assertFails(db.doc(`users/${PAT}`).get());
        await assertFails(db.doc(`users/${PAT}`).set({ profile: {} }, { merge: true }));
        await assertFails(db.doc(`users/${PAT}`).delete());
        await assertFails(db.collection(`users/${PAT}/sessions`).get());
        await assertFails(db.doc(`users/${PAT}/sessions/s1`).get());
        await assertFails(db.doc(`users/${PAT}/sessions/s2`).set(v1Session('s2', 1)));
        await assertFails(db.doc(`users/${PAT}/sessions/s1`).delete());
      }
      await assertFails(as(PAT).collection('users').get());
    });
  });

  describe('rx/{code} (saveRx, getRx, setRxArchived, deleteRx, listMyRx)', () => {
    it('le clinicien crée, réécrit, archive (merge), liste par auteur et supprime son programme', async () => {
      const db = as(CLIN);
      await assertSucceeds(db.doc(`rx/${CODE}`).set(v1Rx(CLIN)));
      await assertSucceeds(db.doc(`rx/${CODE}`).set(v1Rx(CLIN, { version: 2, label: 'Phase 2' })));
      await assertSucceeds(db.doc(`rx/${CODE}`).set({ archived: true }, { merge: true }));
      await assertSucceeds(db.collection('rx').where('by', '==', CLIN).get());
      await assertSucceeds(db.doc(`rx/${CODE}`).delete());
    });

    it('tout le monde lit un programme par son code (lien #/rx/CODE, même avant connexion)', async () => {
      await seed((db) => db.doc(`rx/${CODE}`).set(v1Rx(CLIN)));
      await assertSucceeds(anon().doc(`rx/${CODE}`).get());
      await assertSucceeds(as(PAT).doc(`rx/${CODE}`).get());
      await assertSucceeds(as(PAT).doc('rx/ZZZ999').get()); // code inconnu : « introuvable », pas une erreur
    });

    it('interdit : détourner, modifier ou supprimer le programme d’un autre ; lister sans filtre', async () => {
      await seed((db) => db.doc(`rx/${CODE}`).set(v1Rx(CLIN)));
      await assertFails(as(CLIN2).doc(`rx/${CODE}`).set(v1Rx(CLIN2)));
      await assertFails(as(CLIN2).doc(`rx/${CODE}`).set({ archived: true }, { merge: true }));
      await assertFails(as(CLIN).doc(`rx/${CODE}`).set(v1Rx(CLIN2))); // changer l'auteur
      await assertFails(as(CLIN2).doc(`rx/${CODE}`).delete());
      await assertFails(as(CLIN2).doc('rx/NEW222').set(v1Rx(CLIN))); // créer au nom d'un autre
      await assertFails(anon().doc('rx/NEW222').set(v1Rx(CLIN)));
      await assertFails(as(CLIN2).collection('rx').get());
      await assertFails(as(CLIN2).collection('rx').where('by', '==', CLIN).get());
    });
  });

  describe('rx/{code}/progress/{uid} (pushProgress, listMyRx, deleteCloudData)', () => {
    beforeEach(() => seed((db) => db.doc(`rx/${CODE}`).set(v1Rx(CLIN))));

    it('le patient envoie (création puis mise à jour) et supprime son suivi', async () => {
      const db = as(PAT);
      await assertSucceeds(db.doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT)));
      await assertSucceeds(db.doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT)));
      await assertSucceeds(db.doc(`rx/${CODE}/progress/${PAT}`).get());
      await assertSucceeds(db.doc(`rx/${CODE}/progress/${PAT}`).delete());
      // Code obsolète (programme supprimé) : la suppression du suivi reste permise (deleteCloudData).
      await assertSucceeds(db.doc(`rx/GONE22/progress/${PAT}`).delete());
    });

    it('le clinicien auteur lit la liste des suivis et les supprime (suppression du programme / du compte)', async () => {
      await seed((db) => db.doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT)));
      const db = as(CLIN);
      await assertSucceeds(db.collection(`rx/${CODE}/progress`).get());
      await assertSucceeds(db.doc(`rx/${CODE}/progress/${PAT}`).get());
      await assertSucceeds(db.doc(`rx/${CODE}/progress/${PAT}`).delete());
    });

    it('interdit : suivi d’un autre patient, lecture par un tiers, écriture par le clinicien', async () => {
      await seed((db) => db.doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT)));
      await assertFails(as(PAT2).doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT2)));
      await assertFails(as(PAT2).doc(`rx/${CODE}/progress/${PAT}`).get());
      await assertFails(as(PAT2).doc(`rx/${CODE}/progress/${PAT}`).delete());
      await assertFails(as(PAT2).collection(`rx/${CODE}/progress`).get());
      await assertFails(as(CLIN2).collection(`rx/${CODE}/progress`).get());
      await assertFails(as(CLIN).doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT)));
      await assertFails(anon().doc(`rx/${CODE}/progress/${PAT}`).get());
      await assertFails(anon().doc(`rx/${CODE}/progress/x`).set(v1Progress('x')));
    });
  });

  it('aucune autre collection n’est accessible (refus par défaut)', async () => {
    await assertFails(as(PAT).doc('config/app').get());
    await assertFails(as(PAT).doc('config/app').set({ a: 1 }));
    await assertFails(as(PAT).collection('patients').get());
  });
});

// ---------------------------------------------------------------- Dossiers v2 (ADR 0009)
const rec = (col: string, owner: string, id: string, extra: Data = {}): Data => ({
  schemaVersion: 1,
  id,
  ownerUid: owner,
  createdAt: NOW,
  updatedAt: NOW,
  sharedWith: [],
  sharedVia: null,
  ...(col === 'patients' || col === 'studies' ? {} : { patientId: owner }),
  ...(col === 'assessments' ? { kind: 'gait', videoRetained: false, metrics: [], findings: [] } : {}),
  ...extra,
});
const put = (db: Db, col: string, owner: string, id: string, extra: Data = {}): Promise<void> =>
  db.doc(`${col}/${owner}_${id}`).set(rec(col, owner, id, extra));
const shared = (via = CODE, to = CLIN): Data => ({ sharedWith: [to], sharedVia: via });
const link = (by: string, status: string, extra: Data = {}): Data => ({
  by,
  status,
  requestedAt: NOW,
  ...extra,
});

/** Programme de CLIN + demande du patient acceptée par CLIN. */
async function approved(pid = PAT, code = CODE, clin = CLIN): Promise<void> {
  await seed(async (db) => {
    await db.doc(`rx/${code}`).set(v1Rx(clin, { code }));
    await db.doc(`rx/${code}/links/${pid}`).set(link(clin, 'approved', { decidedAt: NOW }));
  });
}

const COLS = ['patients', 'assessments', 'plans', 'studies', 'interventions', 'annotations', 'followups'];

describe('ADR 0009 — dossiers cliniques v2', () => {
  it('1. propriétaire : créer / lire / modifier / supprimer → permis ; ownerUid d’un autre → refusé', async () => {
    const db = as(CLIN);
    for (const col of COLS) {
      await assertSucceeds(put(db, col, CLIN, 'd1'));
      await assertSucceeds(db.doc(`${col}/${CLIN}_d1`).get());
      await assertSucceeds(put(db, col, CLIN, 'd1', { updatedAt: '2026-11-24T00:00:00.000Z' }));
      await assertSucceeds(db.collection(col).where('ownerUid', '==', CLIN).get());
      await assertSucceeds(db.doc(`${col}/${CLIN}_d1`).delete());
      await assertFails(db.doc(`${col}/${CLIN2}_d2`).set(rec(col, CLIN2, 'd2')));
    }
  });

  it('2. id incohérent ou schemaVersion absent / non entier → refusé', async () => {
    const db = as(CLIN);
    await assertFails(db.doc(`patients/${CLIN}_autre`).set(rec('patients', CLIN, 'p1')));
    await assertFails(db.doc('patients/p1').set(rec('patients', CLIN, 'p1')));
    const noVersion = rec('patients', CLIN, 'p1');
    delete noVersion['schemaVersion'];
    await assertFails(db.doc(`patients/${CLIN}_p1`).set(noVersion));
    await assertFails(put(db, 'patients', CLIN, 'p1', { schemaVersion: 1.5 }));
    await assertFails(put(db, 'patients', CLIN, 'p1', { schemaVersion: '1' }));
    await assertFails(put(db, 'patients', CLIN, 'p1', { schemaVersion: 0 }));
    await assertFails(put(db, 'assessments', CLIN, 'a1', { patientId: null }));
    await assertFails(put(db, 'patients', CLIN, 'p1', { createdAt: 5 }));
  });

  it('3. changer ownerUid à la mise à jour, modifier / supprimer le document d’un autre → refusé', async () => {
    await seed((db) => put(db, 'patients', CLIN, 'p1'));
    await assertFails(
      as(CLIN)
        .doc(`patients/${CLIN}_p1`)
        .set(rec('patients', CLIN2, 'p1')),
    );
    await assertFails(
      as(CLIN2)
        .doc(`patients/${CLIN}_p1`)
        .set(rec('patients', CLIN2, 'p1')),
    );
    await assertFails(
      as(CLIN2)
        .doc(`patients/${CLIN}_p1`)
        .set(rec('patients', CLIN, 'p1')),
    );
    await assertFails(as(CLIN2).doc(`patients/${CLIN}_p1`).delete());
    await assertFails(as(CLIN2).doc(`patients/${CLIN}_p1`).get());
  });

  it('4. évaluation avec videoRetained true ou absent → refusé', async () => {
    const db = as(CLIN);
    await assertFails(put(db, 'assessments', CLIN, 'a1', { videoRetained: true }));
    const noFlag = rec('assessments', CLIN, 'a1');
    delete noFlag['videoRetained'];
    await assertFails(db.doc(`assessments/${CLIN}_a1`).set(noFlag));
    await assertSucceeds(put(db, 'assessments', CLIN, 'a1'));
  });

  it('5. partage vers le clinicien qui a accepté → permis ; autre uid, soi, 2 destinataires, sharedVia absent ou inexistant → refusé', async () => {
    await approved();
    const db = as(PAT);
    await assertSucceeds(put(db, 'patients', PAT, PAT, shared()));
    await assertSucceeds(put(db, 'assessments', PAT, 'a1', shared()));
    await assertSucceeds(put(db, 'annotations', PAT, 'n1', shared()));
    await assertSucceeds(put(db, 'followups', PAT, 'f1', shared()));
    await assertFails(put(db, 'assessments', PAT, 'a2', shared(CODE, CLIN2)));
    await assertFails(put(db, 'assessments', PAT, 'a2', shared(CODE, PAT)));
    await assertFails(put(db, 'assessments', PAT, 'a2', { sharedWith: [CLIN, CLIN2], sharedVia: CODE }));
    await assertFails(put(db, 'assessments', PAT, 'a2', { sharedWith: [CLIN], sharedVia: null }));
    await assertFails(put(db, 'assessments', PAT, 'a2', { sharedWith: [CLIN] }));
    await assertFails(put(db, 'assessments', PAT, 'a2', shared('NOPE22')));
    await assertFails(put(db, 'assessments', PAT, 'a2', { sharedWith: CLIN, sharedVia: CODE }));
  });

  it('6. partage d’une évaluation d’un autre patient, d’un plan / étude / intervention, d’une fiche id ≠ uid → refusé', async () => {
    await approved();
    const db = as(PAT);
    await assertFails(put(db, 'assessments', PAT, 'a1', { ...shared(), patientId: 'quelquun' }));
    await assertFails(put(db, 'plans', PAT, 'pl1', shared()));
    await assertFails(put(db, 'studies', PAT, 'st1', shared()));
    await assertFails(put(db, 'interventions', PAT, 'i1', shared()));
    await assertFails(put(db, 'patients', PAT, 'autre', shared()));
  });

  it('7. clinicien destinataire : get et requête array-contains → permis ; écriture → refusée', async () => {
    await approved();
    await assertSucceeds(put(as(PAT), 'assessments', PAT, 'a1', shared()));
    const db = as(CLIN);
    await assertSucceeds(db.doc(`assessments/${PAT}_a1`).get());
    await assertSucceeds(db.collection('assessments').where('sharedWith', 'array-contains', CLIN).get());
    await assertFails(db.doc(`assessments/${PAT}_a1`).set(rec('assessments', PAT, 'a1', shared())));
    await assertFails(db.doc(`assessments/${PAT}_a1`).delete());
    await assertFails(db.doc(`assessments/${CLIN}_a1`).set(rec('assessments', PAT, 'a1')));
  });

  it('8. requête sans filtre ou sur le propriétaire d’un autre → refusée ; non connecté → tout refusé', async () => {
    await seed((db) => put(db, 'patients', CLIN, 'p1'));
    for (const col of COLS) {
      await assertFails(as(PAT).collection(col).get());
      await assertFails(as(PAT).collection(col).where('ownerUid', '==', CLIN).get());
      await assertFails(as(PAT).collection(col).where('sharedWith', 'array-contains', CLIN).get());
      await assertFails(anon().collection(col).where('ownerUid', '==', CLIN).get());
      await assertFails(anon().doc(`${col}/${CLIN}_p1`).get());
      await assertFails(
        anon()
          .doc(`${col}/${CLIN}_p9`)
          .set(rec(col, CLIN, 'p9')),
      );
    }
  });

  it('9. après retrait (sharedWith: []), le clinicien ne lit plus le document', async () => {
    await approved();
    await assertSucceeds(put(as(PAT), 'assessments', PAT, 'a1', shared()));
    await assertSucceeds(put(as(PAT), 'assessments', PAT, 'a1', { sharedWith: [], sharedVia: null }));
    await assertFails(as(CLIN).doc(`assessments/${PAT}_a1`).get());
    await assertSucceeds(as(CLIN).collection('assessments').where('sharedWith', 'array-contains', CLIN).get());
  });

  it('10. règles v1 inchangées : voir le bloc « v1.15 — non-régression » ci-dessus', async () => {
    // Contrôle croisé minimal : un document v2 ne donne aucun droit sur les collections v1.
    await approved();
    await assertFails(as(CLIN).doc(`users/${PAT}`).get());
    await assertFails(as(CLIN).doc(`rx/${CODE}/progress/${PAT}`).set(v1Progress(PAT)));
  });
});

// ---------------------------------------------------------------- Faille de l'audit #10 : partage imposé par le code
describe('audit #10 — connaître le code ne suffit pas', () => {
  beforeEach(() => seed((db) => db.doc(`rx/${CODE}`).set(v1Rx(CLIN))));

  it('sans demande acceptée, un compte qui connaît le code ne peut rien envoyer au clinicien', async () => {
    const db = as(EVIL);
    await assertSucceeds(db.doc(`rx/${CODE}`).get()); // le code et `by` restent lisibles (v1.15)
    await assertFails(put(db, 'patients', EVIL, EVIL, shared()));
    await assertFails(put(db, 'assessments', EVIL, 'a1', shared()));
    await assertFails(put(db, 'followups', EVIL, 'f1', shared()));
  });

  it('une demande en attente ne suffit pas, et le demandeur ne peut pas l’accepter lui-même', async () => {
    const db = as(EVIL);
    await assertSucceeds(db.doc(`rx/${CODE}/links/${EVIL}`).set(link(CLIN, 'pending')));
    await assertFails(put(db, 'assessments', EVIL, 'a1', shared()));
    await assertFails(db.doc(`rx/${CODE}/links/${EVIL}`).set(link(CLIN, 'approved', { decidedAt: NOW })));
    await assertFails(db.doc(`rx/${CODE}/links/${EVIL}`).update({ status: 'approved', decidedAt: NOW }));
    await assertFails(as(CLIN2).doc(`rx/${CODE}/links/${EVIL}`).update({ status: 'approved', decidedAt: NOW }));
  });

  it('création de la demande : seulement pour soi, vers l’auteur actuel du programme, en attente, champs connus', async () => {
    await assertFails(
      as(PAT)
        .doc(`rx/${CODE}/links/${PAT}`)
        .set(link(CLIN, 'approved', { decidedAt: NOW })),
    );
    await assertFails(as(PAT).doc(`rx/${CODE}/links/${PAT}`).set(link(CLIN2, 'pending')));
    await assertFails(as(PAT).doc(`rx/${CODE}/links/${PAT2}`).set(link(CLIN, 'pending')));
    await assertFails(
      as(PAT)
        .doc(`rx/${CODE}/links/${PAT}`)
        .set(link(CLIN, 'pending', { extra: 1 })),
    );
    await assertFails(
      as(PAT)
        .doc(`rx/${CODE}/links/${PAT}`)
        .set(link(CLIN, 'pending', { displayName: 'x'.repeat(121) })),
    );
    await assertFails(as(PAT).doc(`rx/NOPE22/links/${PAT}`).set(link(CLIN, 'pending')));
    await assertFails(as(CLIN).doc(`rx/${CODE}/links/${CLIN}`).set(link(CLIN, 'pending')));
    await assertFails(anon().doc(`rx/${CODE}/links/${PAT}`).set(link(CLIN, 'pending')));
    await assertSucceeds(
      as(PAT)
        .doc(`rx/${CODE}/links/${PAT}`)
        .set(link(CLIN, 'pending', { displayName: 'Mme A' })),
    );
    // Une fois créée, le patient ne la modifie pas (il peut la supprimer).
    await assertFails(as(PAT).doc(`rx/${CODE}/links/${PAT}`).update({ displayName: 'B' }));
  });

  it('acceptation par le clinicien auteur → partage permis et lisible ; il ne peut changer que le statut', async () => {
    await assertSucceeds(as(PAT).doc(`rx/${CODE}/links/${PAT}`).set(link(CLIN, 'pending')));
    const c = as(CLIN);
    await assertFails(c.doc(`rx/${CODE}/links/${PAT}`).update({ status: 'approved', decidedAt: NOW, by: CLIN2 }));
    await assertFails(c.doc(`rx/${CODE}/links/${PAT}`).update({ status: 'maybe', decidedAt: NOW }));
    await assertFails(c.doc(`rx/${CODE}/links/${PAT}`).update({ status: 'approved' }));
    await assertSucceeds(c.doc(`rx/${CODE}/links/${PAT}`).update({ status: 'approved', decidedAt: NOW }));
    await assertSucceeds(put(as(PAT), 'assessments', PAT, 'a1', shared()));
    await assertSucceeds(c.doc(`assessments/${PAT}_a1`).get());
  });

  it('refus ou révocation → nouveau partage refusé, retrait toujours permis', async () => {
    await approved();
    await assertSucceeds(put(as(PAT), 'assessments', PAT, 'a1', shared()));
    await assertSucceeds(as(CLIN).doc(`rx/${CODE}/links/${PAT}`).update({ status: 'refused', decidedAt: NOW }));
    await assertFails(put(as(PAT), 'assessments', PAT, 'a2', shared()));
    await assertFails(put(as(PAT), 'assessments', PAT, 'a1', { ...shared(), updatedAt: '2026-11-25T00:00:00.000Z' }));
    await assertSucceeds(put(as(PAT), 'assessments', PAT, 'a1', { sharedWith: [], sharedVia: null }));
  });

  it('code réattribué à un autre clinicien après suppression : l’ancienne acceptation ne vaut plus', async () => {
    await approved();
    await seed(async (db) => {
      await db.doc(`rx/${CODE}`).delete();
      await db.doc(`rx/${CODE}`).set(v1Rx(EVIL));
    });
    await assertFails(put(as(PAT), 'assessments', PAT, 'a1', shared(CODE, EVIL)));
    await assertFails(put(as(PAT), 'assessments', PAT, 'a1', shared(CODE, CLIN)));
    // Le nouvel auteur ne peut pas « accepter » l'ancienne demande (liée à CLIN) ni lister les demandes de CLIN.
    await assertFails(as(EVIL).doc(`rx/${CODE}/links/${PAT}`).update({ status: 'approved', decidedAt: NOW }));
    await assertFails(as(EVIL).collection(`rx/${CODE}/links`).get());
    await assertFails(as(EVIL).doc(`rx/${CODE}/links/${PAT}`).get());
  });

  it('lecture des demandes : le patient la sienne (même absente), le clinicien les siennes (filtre by)', async () => {
    await assertSucceeds(as(PAT).doc(`rx/${CODE}/links/${PAT}`).get()); // absente : pas d'erreur
    await assertSucceeds(as(PAT).doc(`rx/${CODE}/links/${PAT}`).set(link(CLIN, 'pending')));
    await assertSucceeds(as(PAT).doc(`rx/${CODE}/links/${PAT}`).get());
    await assertSucceeds(as(CLIN).doc(`rx/${CODE}/links/${PAT}`).get());
    await assertSucceeds(as(CLIN).collection(`rx/${CODE}/links`).where('by', '==', CLIN).get());
    await assertFails(as(CLIN).collection(`rx/${CODE}/links`).get());
    await assertFails(as(PAT2).doc(`rx/${CODE}/links/${PAT}`).get());
    await assertFails(as(PAT2).collection(`rx/${CODE}/links`).where('by', '==', CLIN).get());
    await assertFails(anon().doc(`rx/${CODE}/links/${PAT}`).get());
  });

  it('suppression de la demande : par le patient ou par le clinicien lié, jamais par un tiers', async () => {
    await seed(async (db) => {
      await db.doc(`rx/${CODE}/links/${PAT}`).set(link(CLIN, 'approved', { decidedAt: NOW }));
      await db.doc(`rx/${CODE}/links/${PAT2}`).set(link(CLIN, 'pending'));
    });
    await assertFails(as(EVIL).doc(`rx/${CODE}/links/${PAT}`).delete());
    await assertSucceeds(as(PAT).doc(`rx/${CODE}/links/${PAT}`).delete());
    await assertSucceeds(as(CLIN).doc(`rx/${CODE}/links/${PAT2}`).delete());
  });

  it('sharedVia malformé (chemin, minuscules) → refusé', async () => {
    await approved();
    await assertFails(put(as(PAT), 'assessments', PAT, 'a1', shared(`${CODE}/links/${PAT}`)));
    await assertFails(put(as(PAT), 'assessments', PAT, 'a1', shared('abc234')));
  });
});
