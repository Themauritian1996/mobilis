// Utilisation au long cours : migration d'anciens profils, sauvegarde / restauration (aller-retour), fin de programme.
import assert from 'node:assert/strict';
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem(k, v) { mem[k] = String(v); }, removeItem(k) { delete mem[k]; } };
globalThis.window = globalThis;
globalThis.document = { documentElement: {}, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr', onLine: true }, configurable: true });
const L = await import('../www/js/longterm.js');
const S = await import('../www/js/store.js');
const P = await import('../www/js/program.js');
const DAY = 86400000, now = Date.UTC(2026, 10, 15, 15);

// --- migration d'un très ancien profil (sans days, levels, startDate…) : rien ne casse dans program.js
const old = { role: 'patient', name: 'Ana', pathology: 'neck_mech' };
const m = L.migrateProfile(old);
assert.deepEqual(m.days, [1, 3, 5]); assert.equal(m.perWeek, 3); assert.equal(m.phase, 1); assert.deepEqual(m.levels, {});
assert.ok(Number.isFinite(m.startDate) && Number.isFinite(m.joinedAt)); assert.equal(m.name, 'Ana'); assert.equal(old.days, undefined); // l'original n'est pas modifié
assert.ok(P.todaysProgram(m).length > 0); assert.ok(P.weeklyStats(m, []).length >= 1);
// types invalides
const bad = L.migrateProfile({ pathology: 'neck_mech', days: 'lun', levels: [1], phase: 9, plan: { ids: [] }, rxDose: [], irritability: 'x', startDate: 'hier' });
assert.deepEqual(bad.days, [1, 3, 5]); assert.deepEqual(bad.levels, {}); assert.equal(bad.phase, 1); assert.equal(bad.plan, null); assert.equal(bad.rxDose, undefined); assert.equal(bad.irritability, 'med'); assert.ok(Number.isFinite(bad.startDate));
// un profil récent est conservé tel quel (idempotent) et les champs inconnus aussi
const cur = { role: 'patient', pathology: 'neck_mech', days: [2, 4], perWeek: 2, phase: 2, levels: { chin_tuck: 3 }, startDate: now - 20 * DAY, joinedAt: now - 20 * DAY, irritability: 'low', painBase: 2, rxCode: 'ABC234', rxVersion: 4, rxAt: now - 5 * DAY, futur: { a: 1 } };
assert.deepEqual(L.migrateProfile(cur), cur); assert.deepEqual(L.migrateProfile(m), m);
assert.equal(L.migrateProfile(null), null);
// profil avec code mais sans rxAt/rxVersion : complétés
const rx0 = L.migrateProfile({ pathology: 'neck_mech', rxCode: 'ABC234', startDate: now - 90 * DAY });
assert.equal(rx0.rxVersion, 1); assert.equal(rx0.rxAt, now - 90 * DAY);
// séances anciennes : items / sets manquants
const ses = L.migrateSessions([{ id: 'a', date: 5 }, { id: 'b', items: [{ id: 'x' }, null] }, null, { nope: 1 }]);
assert.equal(ses.length, 2); assert.deepEqual(ses[1].items, [{ id: 'x', sets: [] }]); assert.deepEqual(ses[0].items, []);
assert.equal(P.weeklyStats({ ...m, startDate: now - 3 * DAY }, ses).length >= 1, true);
assert.deepEqual(L.migrateJournal([{ day: '2026-11-01' }, {}, null]), [{ day: '2026-11-01' }]);

// --- sauvegarde : aller-retour via store (sans compte), sans clé ni jeton, fusion sans doublon
S.signInLocal(() => {});
await S.loadData();
await S.saveProfile({ ...cur, geminiKey: 'LEAK', sharedAI: { key: 'LEAK2' } });
for (const id of ['s1', 's2']) await S.saveSession({ id, date: now - DAY, items: [{ id: 'chin_tuck', sets: [{ quality: 0.8 }] }] });
await S.saveJournal({ day: '2026-11-10', pain: 3 });
S.saveSettings({ geminiKey: 'PERSONAL', sharedAI: { key: 'SHAREDLEAK' } });
const file = S.exportData();
assert.ok(!file.includes('PERSONAL') && !file.includes('SHAREDLEAK')); // jamais de clé dans la sauvegarde des réglages
const parsed = JSON.parse(file); assert.equal(parsed.app, 'mobilis-backup'); assert.equal(parsed.sessions.length, 2);
const bk = L.parseBackup(file);
assert.equal(bk.profile.geminiKey, undefined); assert.equal(bk.profile.sharedAI, undefined); assert.equal(bk.sessions.length, 2);
// nouveau téléphone : stockage vide → restauration complète
S.eraseLocal(); delete mem['mobilis.data.local'];
let r = await S.importData(file, { replaceProfile: true });
let d = await S.loadData();
assert.equal(r.sessions, 2); assert.equal(d.sessions.length, 2); assert.equal(d.profile.rxCode, 'ABC234'); assert.equal(d.profile.pathology, 'neck_mech'); assert.equal(d.journal.length, 1);
// idempotent : restaurer deux fois n'ajoute rien
r = await S.importData(file); d = await S.loadData(); assert.equal(r.sessions, 0); assert.equal(d.sessions.length, 2);
// fusion : le profil actuel gagne, les séances manquantes s'ajoutent
const f2 = JSON.stringify({ ...parsed, profile: { ...parsed.profile, phase: 3 }, sessions: [...parsed.sessions, { id: 's3', date: now }] });
r = await S.importData(f2); d = await S.loadData(); assert.equal(r.sessions, 1); assert.equal(d.sessions.length, 3); assert.equal(d.profile.phase, 2);
// fichiers invalides
for (const x of ['pas du json', '{"app":"autre"}', '[]', '{}']) assert.throws(() => L.parseBackup(x), x);
// ancien export (sans « app ») accepté
assert.equal(L.parseBackup(JSON.stringify({ exported: 'x', profile: { pathology: 'neck_mech' }, sessions: [], journal: [] })).profile.pathology, 'neck_mech');
// rechargement : le profil ancien stocké localement est migré à la lecture
mem['mobilis.data.local'] = JSON.stringify({ profile: { role: 'patient', pathology: 'neck_mech' }, sessions: [{ id: 'z' }] });
await S.signOut(() => {});
mem['mobilis.data.local'] = JSON.stringify({ profile: { role: 'patient', pathology: 'neck_mech' }, sessions: [{ id: 'z' }] });
S.signInLocal(() => {}); d = await S.loadData();
assert.deepEqual(d.profile.days, [1, 3, 5]); assert.deepEqual(d.sessions[0].items, []);

// --- fin de programme
const rx = (o) => ({ role: 'patient', pathology: 'neck_mech', rxCode: 'ABC234', clinician: 'Dr X', phase: 3, startDate: now - 100 * DAY, rxAt: now - 100 * DAY, ...o });
assert.equal(L.programEnded(rx(), now), true);                                   // 12 semaines passées, phase 3
assert.equal(L.programEnded(rx({ rxAt: now - 83 * DAY }), now), false);          // pas encore
assert.equal(L.programEnded(rx({ rxAt: now - 84 * DAY }), now), true);
assert.equal(L.programEnded(rx({ phase: 1 }), now), false);                      // encore en phase 1, auto
assert.equal(L.programEnded(rx({ phase: 1, lockPhase: true }), now), true);      // phase fixée par le clinicien
assert.equal(L.programEnded(rx({ rxAt: now }), now), false);                     // programme renouvelé (rxAt remis à maintenant) : plus « terminé »
assert.equal(L.programEnded(rx({ rxCode: null, clinician: '' }), now), false);   // programme auto-évalué
assert.equal(L.programEnded(rx({ role: 'clinician' }), now), false);
assert.equal(L.programEnded({ role: 'patient' }, now), false);
// protocole à durée définie : fini à la fin de la dernière phase ; sinon reste ouvert
const { PROTOCOLS } = await import('../www/js/data/protocols.js').catch(() => ({}));
if (PROTOCOLS?.length) {
  let any = false;
  for (const pr of PROTOCOLS) {
    const ph = P.protocolStatus({ protocol: { id: pr.id, surgeryDate: '2026-01-01' } }, now);
    if (!ph) continue;
    const last = ph.phases[ph.phases.length - 1], end = last.weeks?.[1];
    if (end == null) { assert.equal(L.programEnded({ role: 'patient', pathology: 'neck_mech', clinician: 'x', protocol: { id: pr.id, surgeryDate: '2026-01-01', confirmed: Object.fromEntries(ph.phases.map((p) => [p.id, true])) }, startDate: now }, now), false); any = true; }
  }
}
// l'exercice reste disponible après la fin : le programme du jour n'est pas vidé
assert.ok(P.todaysProgram(rx()).length > 0);
console.log('longterm OK');
