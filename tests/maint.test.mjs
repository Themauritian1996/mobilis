// 1.15 suivi long terme : code clinicien introuvable / réseau (B1), effacement complet, consentement avant envoi d'image, voix,
// calendrier (semaine, jours, rendez-vous, .ics), historique (plage, modification, suppression, séance manuelle), CSV clinicien.
import assert from 'node:assert/strict';
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem(k, v) { mem[k] = String(v); }, removeItem(k) { delete mem[k]; } };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = globalThis;
globalThis.document = { documentElement: {}, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr', onLine: true }, configurable: true });
const S = await import('../www/js/store.js');
const C = await import('../www/js/coach.js');
const L = await import('../www/js/longterm.js');
const P = await import('../www/js/program.js');
let n = 0; const ok = () => { n++; };
const setS = (o) => { mem['mobilis.settings'] = JSON.stringify(o); };

// ---------- B1 : un code introuvable ou injoignable ne doit jamais verrouiller l'app ----------
S.setPendingRx('ZZZ999'); assert.equal(S.getPendingRx(), 'ZZZ999');
let r = await S.lookupRx('ZZZ999', async () => null);
assert.deepEqual(r, { error: 'notfound' }); assert.equal(S.getPendingRx(), null, 'pendingRx effacé si introuvable'); ok();
S.setPendingRx('ABC234');
r = await S.lookupRx('ABC234', async () => { throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' }); });
assert.equal(r.error, 'network'); assert.equal(S.getPendingRx(), null, 'pendingRx effacé si réseau'); ok();
S.setPendingRx('ABC234');
r = await S.lookupRx('ABC234', async () => { throw new TypeError('Failed to fetch dynamically imported module'); });
assert.equal(r.error, 'network'); assert.equal(S.getPendingRx(), null); ok();
S.setPendingRx('ABC234');
r = await S.lookupRx('~@@@', async () => { throw new SyntaxError('Unexpected token'); }); // lien corrompu : pas une panne réseau
assert.equal(r.error, 'notfound'); assert.equal(S.getPendingRx(), null); ok();
S.setPendingRx('ABC234');
r = await S.lookupRx('ABC234', () => new Promise(() => {}), 30); // jamais de réponse : délai dépassé → réseau
assert.equal(r.error, 'network'); assert.equal(S.getPendingRx(), null); ok();
S.setPendingRx('ABC234');
r = await S.lookupRx('ABC234', async () => ({ code: 'ABC234', ids: ['squat'] }));
assert.equal(r.rx.code, 'ABC234'); ok();
// le lien « emballé » (~…) se lit sans réseau
const link = (await S.saveRx({ clinician: 'Dr X', region: 'knee', pathology: 'oa_knee', phase: 1, ids: ['squat'], levels: {}, days: [1, 3, 5], auto: true })).data.packed;
assert.equal((await S.lookupRx(link)).rx.clinician, 'Dr X'); ok();

// ---------- Effacement complet de l'appareil ----------
S.signInLocal(() => {});
await S.loadData();
setS({ geminiKey: 'AIzaSECRET', sharedAI: { key: 'SHARED', from: 'Dr X' }, theme: 'dark' });
mem['mobilis.aiLang'] = 'en'; mem['mobilis.aiUse'] = '{"day":"x","n":3}'; mem['mobilis.pendingRx'] = 'ABC234'; mem['mobilis.remindDay'] = 'x';
await S.saveProfile({ name: 'Chris', role: 'patient', pathology: 'oa_knee', days: [1, 3, 5] });
await S.saveSession({ id: 's1', date: Date.now(), items: [] });
S.eraseLocal();
for (const k of S.LOCAL_KEYS) assert.equal(mem[k], undefined, k + ' effacé');
assert.equal(S.aiKey(), '', 'plus aucune clé (personnelle ou partagée)');
assert.equal(mem['mobilis.data.local'], undefined);
assert.equal((await S.loadData()).profile ?? null, null); ok();
assert.equal(await S.deleteCloudData(), 0); ok(); // hors compte : se limite à l'appareil

// ---------- Consentement : aucune image sans « oui » explicite ----------
assert.equal(S.imageConsent(), false); setS({ imageConsent: null }); assert.equal(S.imageConsent(), false);
const img = { inline_data: { mime_type: 'image/jpeg', data: 'AAA' } }, txt = { text: 'hi' }, aud = { inline_data: { mime_type: 'audio/webm', data: 'BBB' } };
assert.deepEqual(C.stripImages([txt, img, aud], false), [txt, aud]); assert.deepEqual(C.stripImages([txt, img], true), [txt, img]); ok();
const calls = [];
globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Bien' }] } }] }), text: async () => '' }; };
setS({ geminiKey: 'K', sendFrame: true });
await C.gemini({ sys: 'S', parts: [txt, img] });
assert.equal(calls.at(-1).contents[0].parts.length, 1, 'sans consentement : image retirée de la requête'); ok();
await C.coachComment({ kind: 'set', reps: 5 }, 'IMGB64');
assert.ok(!JSON.stringify(calls.at(-1)).includes('IMGB64')); ok();
S.setImageConsent(true); assert.equal(S.imageConsent(), true);
await C.gemini({ sys: 'S', parts: [txt, img] });
assert.equal(calls.at(-1).contents[0].parts.length, 2, 'avec consentement : image envoyée'); ok();
const fakeVideo = { videoWidth: 640, videoHeight: 480 };
globalThis.document.createElement = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, translate() {}, scale() {} }), toDataURL: () => 'data:image/jpeg;base64,ZZZ' });
assert.equal(C.grabFrame(fakeVideo, false), 'ZZZ');
S.setImageConsent(false);
assert.equal(C.grabFrame(fakeVideo, false), null, 'sans consentement : aucune capture'); assert.equal(S.settings().sendFrame, false, 'retirer le consentement coupe l’envoi'); ok();
S.setImageConsent(true); S.purgeApiKey(); assert.equal(S.settings().geminiKey, ''); ok();

// ---------- Voix ----------
assert.equal(S.clampRate(5), 1.3); assert.equal(S.clampRate(0.1), 0.8); assert.equal(S.clampRate('x'), 1); assert.equal(S.clampRate(1.07), 1.05); ok();
assert.equal(C.cueAllowed('good', 'essential'), false); assert.equal(C.cueAllowed('valgus', 'essential'), true); assert.equal(C.cueAllowed('good', 'all'), true); ok();

// ---------- Calendrier ----------
assert.equal(L.weekStartFor(1, 'fr-CA'), 1); assert.equal(L.weekStartFor(0, 'fr-FR'), 0); assert.equal(L.weekStartFor('auto', 'fr-FR'), 1); assert.equal(L.weekStartFor('auto', 'en-US'), 0);
assert.deepEqual(L.weekOrder(1), [1, 2, 3, 4, 5, 6, 0]); assert.deepEqual(L.weekOrder(0), [0, 1, 2, 3, 4, 5, 6]); ok();
assert.equal(L.canToggleDay([3], 3), false, 'dernier jour : refusé'); assert.equal(L.canToggleDay([1, 3], 3), true); assert.equal(L.canToggleDay([3], 4), true);
assert.deepEqual(L.toggleDay([1, 3], 2), [1, 2, 3]); assert.deepEqual(L.toggleDay([1, 3], 3), [1]); ok();
const appts = [{ date: '2026-12-01', time: '09:00', note: 'a' }, { date: '2026-12-01', time: '09:00', note: 'b' }, { date: '2026-12-02', time: '', note: '' }];
assert.deepEqual(L.removeAt(appts, 0).map((a) => a.note), ['b', ''], 'un seul rendez-vous retiré'); assert.equal(L.removeAt(appts, 9).length, 3); ok();
// .ics : mardi 10 nov. 2026, jours lun/mer/ven → premier événement mercredi 11, à l'heure du rappel
const now = new Date(2026, 10, 10, 20, 0);
const st = L.firstTrainingStart([1, 3, 5], '07:30', now);
assert.equal(st.getDay(), 3); assert.equal(st.getDate(), 11); assert.equal(st.getHours(), 7); assert.equal(st.getMinutes(), 30); ok();
const ics = L.buildIcs({ days: [1, 3, 5], time: '07:30', appts: [{ date: '2026-12-01', time: '10:15', note: 'Bilan, genou' }], labels: { title: 'Séance', desc: 'D', appt: 'RDV' }, now });
assert.match(ics, /DTSTART:20261111T073000/); assert.match(ics, /BYDAY=MO,WE,FR/); assert.match(ics, /DTSTART:20261201T101500/); assert.match(ics, /RDV — Bilan\\, genou/); assert.ok(!/DTSTART:20261110/.test(ics));
assert.match(L.buildIcs({ days: [2], now }), /DTSTART:20261110T180000/, 'mardi est un jour d’entraînement : aujourd’hui'); ok();

// ---------- Historique ----------
const D = 86400000, t0 = new Date(2026, 10, 15, 12).getTime();
assert.equal(L.rangeCutoff('all', t0), null); assert.equal(L.rangeCutoff('4w', t0), t0 - 28 * D); assert.equal(L.rangeCutoff('3m', t0), t0 - 91 * D);
assert.equal(L.inRange(t0 - 30 * D, '4w', t0), false); assert.equal(L.inRange(t0 - 30 * D, '3m', t0), true); assert.equal(L.inRange(t0 - 400 * D, 'all', t0), true);
assert.equal(L.rangeWeeks('4w'), 4); assert.equal(L.rangeWeeks('all'), Infinity); ok();
assert.equal(L.validPastDay('2026-11-16', null, t0), 'future'); assert.equal(L.validPastDay('2026-11-15', null, t0), null); assert.equal(L.validPastDay('2026-09-01', t0 - 20 * D, t0), 'before'); assert.equal(L.validPastDay('nope', null, t0), 'format'); ok();
const ms = L.makeManualSession({ day: '2026-11-10', items: [{ id: 'squat', level: 2, sets: 3, reps: 10, pain: 3, note: 'ok' }], now: t0 });
assert.equal(ms.manual, true); assert.equal(P.todayKey(ms.date), '2026-11-10'); assert.equal(ms.items[0].sets.length, 3); assert.equal(ms.items[0].sets[0].reps, 10);
const stats = P.weeklyStats({ startDate: t0 - 30 * D, joinedAt: t0 - 30 * D, days: [1, 3, 5] }, [ms]); assert.ok(stats.some((w) => w.sessions === 1), 'la séance manuelle compte dans les stats'); ok();
const es = L.editSession({ ...ms, items: [{ ...ms.items[0] }, { ...ms.items[0], id: 'bridge' }] }, { day: '2026-11-09', items: { 0: { pain: 7, note: '' } }, remove: [1] });
assert.equal(es.items.length, 1); assert.equal(es.items[0].pain, 7); assert.equal(P.todayKey(es.date), '2026-11-09'); assert.equal(es.items[0].id, 'squat'); ok();
assert.deepEqual(L.removeById([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
assert.deepEqual(L.removeByTs([{ ts: 1 }, { ts: 2 }], 1), [{ ts: 2 }]); assert.deepEqual(L.patchByTs([{ ts: 1, deg: 5 }], 1, { deg: 9 }), [{ ts: 1, deg: 9 }]); ok();
// suppression locale d'une séance / d'une entrée de journal
S.signInLocal(() => {}); await S.loadData();
await S.saveProfile({ name: 'C', role: 'patient', pathology: 'oa_knee', days: [1, 3, 5], romLog: [{ test: 'sh_flex', side: 'L', deg: 100, ts: 5 }] });
await S.saveSession(ms); await S.saveSession({ id: 'x2', date: t0, items: [] }); await S.saveJournal({ day: '2026-11-10', pain: 4, ts: 1 }); await S.saveJournal({ day: '2026-11-11', pain: 2, ts: 2 });
await S.deleteSession(ms.id); let d = await S.loadData();
assert.deepEqual(d.sessions.map((s) => s.id), ['x2']);
await S.deleteJournal('2026-11-10'); assert.deepEqual((await S.loadData()).journal.map((j) => j.day), ['2026-11-11']);
// sauvegarde → restauration : rien n'est perdu
const bk = S.exportData(); S.eraseLocal(); S.signInLocal(() => {}); await S.loadData(); const imp = await S.importData(bk, { replaceProfile: true });
assert.equal(imp.sessions, 1); assert.equal((await S.loadData()).profile.romLog.length, 1); ok();

// ---------- CSV clinicien ----------
const csv = L.patientCsv({ name: '=SUM(A1)', week: 4, phase: 2, sessions7: 3, planned: 3, pain7: 2.5, quality7: 80, flare: false, updated: t0, ex: { squat: { level: 3, lastDifficulty: 2, lastPain: 1, trend: 'up' } },
  rom: [{ t: 'sh_flex', s: 'L', b: 90, l: 120, g: 30, n: 3, ts: t0 }], prom: [{ id: 'quickdash', last: 20, delta: -5, n: 2 }], notes: [{ ex: 'squat', text: 'genou, "ok"', date: t0, pain: 2 }] }, { nameOf: (id) => id.toUpperCase() });
assert.ok(csv.startsWith('﻿section,item,value,detail')); assert.match(csv, /patient,name,'=SUM\(A1\),/, 'pas d’injection de formule'); assert.match(csv, /exercise,SQUAT,3,/); assert.match(csv, /"genou, ""ok"""/); assert.match(csv, /rom,sh_flex L,120,/); ok();

console.log(`maint OK (${n} blocs)`);
