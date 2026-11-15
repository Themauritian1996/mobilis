import assert from 'node:assert/strict';
import { INSTRUMENTS, score, due, trend, summaryPart, customToDef, validateLicense, mergeLicenses, resolveDef, isAvailable, suggestFor, band, FREE_ORDER, LICENSED_ORDER } from '../www/js/data/proms.js';

const fill = (n, v) => Array(n).fill(v);
const S = (id, a) => score(INSTRUMENTS[id], a);

// ---- structure : aucun texte d'item pour les instruments sous licence ; libres bilingues
for (const id of LICENSED_ORDER) { const d = INSTRUMENTS[id]; assert.equal(d.items.length, 0, id); assert.ok(d.nItems > 0 && d.mcid.value > 0 && d.holder, id); assert.equal(isAvailable(id, {}), false, id + ' licence requise'); }
for (const id of FREE_ORDER) { const d = INSTRUMENTS[id]; if (d.dynamicItems) continue; for (const it of d.items) assert.ok(it.text.fr && it.text.en, id); }
for (const id of FREE_ORDER.filter((x) => x.startsWith('mfq_'))) assert.ok(INSTRUMENTS[id].items.length >= 8 && INSTRUMENTS[id].items.length <= 10, id);
assert.equal(FREE_ORDER.filter((x) => x.startsWith('mfq_')).length, 8);

// ---- libres
let r = S('nprs', [4, 5, 9]);
assert.equal(r.score, 6); assert.deepEqual(r.sub, { now: 4, avg: 5, worst: 9 });
assert.equal(S('nprs', [3, null, 5]).score, 4);            // moyenne des items répondus
assert.equal(S('nprs', [11, -1, null]).valid, false);       // hors échelle
assert.equal(S('pgic', [2]).score, 2);
assert.equal(S('sane', [65]).score, 65);
assert.equal(S('sane', [101]).valid, false);
assert.equal(S('sleep', [7]).score, 7);
const act = resolveDef('activities', { activities: ['Marcher', 'Jardiner', 'Porter ma fille'] });
assert.equal(act.available, true); assert.equal(act.items.length, 3);
assert.equal(resolveDef('activities', { activities: ['Marcher'] }).available, false);
assert.equal(score(act, [5, 7, 9]).score, 7);
assert.equal(score(act, [5, null, 9]).score, 7);
// Mobilis fonctionnel : 0 difficulté = 100, tout « impossible » = 0, mi-chemin = 50
assert.equal(S('mfq_knee', fill(8, 0)).score, 100);
assert.equal(S('mfq_knee', fill(8, 4)).score, 0);
assert.equal(S('mfq_knee', fill(8, 2)).score, 50);
assert.equal(S('mfq_shoulder', [1, 1, 1, 1, 1, 1, 1, 1]).score, 75);
assert.equal(S('mfq_hip', [0, 0, 0, 0, 0, 0, null, null]).score, 100); // 6/8 = 75 % : valide
assert.equal(S('mfq_hip', [0, 0, 0, 0, 0, null, null, null]).valid, false);

// ---- sous licence (réponses synthétiques)
r = S('quickdash', fill(11, 1)); assert.equal(r.score, 0);
assert.equal(S('quickdash', fill(11, 5)).score, 100);
assert.equal(S('quickdash', fill(11, 3)).score, 50);
assert.equal(S('quickdash', [...fill(10, 3), null]).score, 50);           // 10 items suffisent
assert.equal(S('quickdash', [...fill(9, 3), null, null]).valid, false);   // 9 : invalide
assert.equal(S('koos12', fill(12, 0)).score, 100);
assert.equal(S('koos12', fill(12, 4)).score, 0);
r = S('koos12', [0, 0, 0, 0, 4, 4, 4, 4, 2, 2, 2, 2]); assert.deepEqual(r.sub, { pain: 100, function: 0, qol: 50 }); assert.equal(r.score, 50);
assert.equal(S('koos12', [0, 0, 0, null, 4, 4, 4, 4, 2, 2, 2, 2]).sub.pain, 100); // 1 manquant toléré
assert.equal(S('koos12', [0, 0, null, null, 4, 4, 4, 4, 2, 2, 2, 2]).valid, false);
assert.equal(S('hoos12', fill(12, 1)).score, 75);
r = S('spadi', [...fill(5, 10), ...fill(8, 0)]); assert.deepEqual(r.sub, { pain: 100, disability: 0 }); assert.equal(r.score, 50);
assert.equal(S('spadi', [...fill(5, 5), ...fill(8, 5)]).score, 50);
assert.equal(S('spadi', [5, 5, 5, 5, null, ...fill(8, 10)]).sub.pain, 50);      // manquant : moyenne des répondus
assert.equal(S('spadi', [...fill(5, 5), ...fill(8, null)]).valid, false);
assert.equal(S('lefs', fill(20, 4)).score, 80);
assert.equal(S('lefs', fill(20, 2)).score, 40);
assert.equal(S('lefs', [...fill(18, 2), null, null]).score, 40);                // proratisé
assert.equal(S('lefs', [...fill(17, 2), null, null, null]).valid, false);
assert.equal(S('odi', fill(10, 5)).score, 100);
assert.equal(S('odi', fill(10, 1)).score, 20);
assert.equal(S('odi', [...fill(9, 1), null]).score, 20);                         // 9 sections : valide
assert.equal(S('odi', [...fill(8, 1), null, null]).valid, false);
assert.equal(S('ndi', [5, 5, 5, 5, 5, 0, 0, 0, 0, 0]).score, 50);

// ---- licence : import
assert.equal(validateLicense({ instrument: 'koos12', items: fill(11, 'x') }).ok, false);
assert.equal(validateLicense({ instrument: 'nprs', items: [] }).ok, false);
assert.equal(validateLicense('pas du json').ok, false);
const v = validateLicense({ instrument: 'lefs', items: Array.from({ length: 20 }, (_, i) => ({ fr: 'item ' + i, en: 'item ' + i })), options: ['a', 'b', 'c', 'd', 'e'] });
assert.ok(v.ok && v.id === 'lefs');
assert.equal(isAvailable('lefs', { licenses: { lefs: v.entry } }), true);
assert.equal(resolveDef('lefs', { licenses: { lefs: v.entry } }).items.length, 20);
assert.equal(validateLicense({ instrument: 'lefs', items: fill(20, 'x'), options: ['a'] }).ok, false);

// ---- constructeur personnalisé
let c = { id: 'c_1', title: 'Test', questions: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], scale: '0-10', score: 'sum', higherIsBetter: false };
assert.equal(score(customToDef(c), [3, 4, 5]).score, 12);
assert.equal(score(customToDef(c), [3, 4, null]).valid, false);          // somme : tout répondu
c = { ...c, score: 'mean' }; assert.equal(score(customToDef(c), [3, 4, 5]).score, 4);
assert.equal(score(customToDef(c), [3, null, 5]).score, 4);
c = { ...c, scale: 'likert', score: 'pct' }; assert.equal(score(customToDef(c), [4, 4, 0]).score, 66.7);
c = { ...c, scale: 'yesno', score: 'sum' }; assert.equal(score(customToDef(c), [1, 0, 1]).score, 2);
assert.deepEqual(customToDef(c).range, [0, 3]);
assert.equal(customToDef({ ...c, score: 'pct' }).range[1], 100);

// ---- échéances : dimanche 2026-11-01 comme départ, midi local
const at = (k, h = 12) => new Date(k + 'T' + String(h).padStart(2, '0') + ':00').getTime();
const start = at('2026-11-01');
const plan = [{ id: 'nprs', every: 0, first: 0 }, { id: 'sane', every: 2, first: 7 }];
let d = due(plan, [], start, at('2026-11-01', 9));
assert.deepEqual(d.map((x) => x.id), ['nprs']);                           // une fois, tout de suite ; sane pas avant J+7
d = due(plan, [], start, at('2026-11-08', 8));
assert.deepEqual(d.map((x) => x.id), ['nprs', 'sane']);                   // sane dû à J+7 (le matin)
d = due(plan, [{ id: 'nprs', ts: at('2026-11-01') }], start, at('2026-11-20'));
assert.deepEqual(d.map((x) => x.id), ['sane']);                           // « une fois » déjà fait : plus dû
d = due(plan, [{ id: 'sane', ts: at('2026-11-08') }], start, at('2026-11-21'));
assert.ok(!d.some((x) => x.id === 'sane'));                               // fait il y a 13 j, toutes les 2 sem.
d = due(plan, [{ id: 'sane', ts: at('2026-11-08') }], start, at('2026-11-22', 7));
assert.ok(d.some((x) => x.id === 'sane'));                                // 14 j plus tard
assert.equal(d.find((x) => x.id === 'sane').overdueDays, 0);
d = due([{ id: 'sleep', every: 1, first: 0 }], [{ id: 'sleep', ts: at('2026-11-02') }], start, at('2026-11-12'));
assert.equal(d[0].overdueDays, 3);               // dû le 9 nov.
assert.deepEqual(due(null, null, start, start), []);
assert.deepEqual(due([{ id: 'x', every: 4, first: 0 }], [{ id: 'y', ts: start }], start, at('2026-11-05')).map((x) => x.id), ['x']); // log d'un autre id ignoré

// ---- tendance / DMCI
const L = (id, ...pairs) => pairs.map(([k, s]) => ({ id, ts: at(k), score: s }));
let t = trend(L('nprs', ['2026-11-01', 7], ['2026-11-15', 4]), 'nprs');
assert.deepEqual([t.baseline, t.last, t.delta, t.improvement, t.mcidReached], [7, 4, -3, 3, true]);
t = trend(L('nprs', ['2026-11-01', 7], ['2026-11-15', 6]), 'nprs');
assert.equal(t.mcidReached, false);
t = trend(L('nprs', ['2026-11-01', 3], ['2026-11-15', 2]), 'nprs');
assert.equal(t.mcidReached, true);                                        // 1 point sur 3 = 33 % (règle « 2 points ou 30 % »)
t = trend(L('nprs', ['2026-11-01', 8], ['2026-11-15', 10]), 'nprs'); assert.equal(t.worsened, true);
t = trend(L('sane', ['2026-11-01', 40], ['2026-11-15', 60], ['2026-11-29', 58]), 'sane');
assert.deepEqual([t.baseline, t.last, t.delta, t.mcidReached], [40, 58, 18, true]);
t = trend(L('odi', ['2026-11-01', 50], ['2026-11-15', 44]), 'odi'); assert.equal(t.mcidReached, false); assert.equal(t.improvement, 6);
t = trend(L('lefs', ['2026-11-01', 30], ['2026-11-15', 40]), 'lefs'); assert.equal(t.mcidReached, true);
t = trend(L('pgic', ['2026-11-15', 2]), 'pgic'); assert.equal(t.mcidReached, true); assert.equal(t.delta, null);
t = trend(L('pgic', ['2026-11-15', 4]), 'pgic'); assert.equal(t.mcidReached, false);
t = trend(L('nprs', ['2026-11-01', 5]), 'nprs'); assert.deepEqual([t.n, t.delta, t.mcidReached], [1, null, false]);
t = trend([], 'nprs'); assert.equal(t.n, 0);
t = trend(L('c_1', ['2026-11-01', 5], ['2026-11-15', 9]), 'c_1', customToDef({ id: 'c_1', questions: ['a'], higherIsBetter: true })); assert.equal(t.improvement, 4); assert.equal(t.mcidReached, false); // pas de DMCI

// ---- résumé clinicien
const sp = summaryPart({ promLog: [...L('nprs', ['2026-11-01', 7], ['2026-11-15', 4]), ...L('c_1', ['2026-11-02', 1])], promCustom: [{ id: 'c_1', title: 'Mon test', questions: ['a'], scale: '0-10', score: 'mean' }] });
assert.equal(sp.prom.length, 2);
assert.equal(sp.prom[0].mcidReached, true); assert.equal(sp.prom[0].series.length, 2);
assert.equal(sp.prom[1].name, 'Mon test');
assert.deepEqual(summaryPart({}), { prom: [] });

// ---- divers
assert.ok(suggestFor('knee').region.includes('mfq_knee') && suggestFor('knee').region.includes('koos12') && suggestFor('knee').region.includes('lefs'));
assert.ok(suggestFor('lumbar').region.includes('mfq_trunk') && suggestFor('lumbar').region.includes('odi'));
assert.equal(band(INSTRUMENTS.sane, 90), 0); assert.equal(band(INSTRUMENTS.nprs, 8), 3); assert.equal(band(INSTRUMENTS.nprs, 1), 0);
// ---- textes sous licence embarqués dans la prescription (aller-retour JSON du lien) : le patient peut répondre sans les avoir importés
{
  const lic = validateLicense({ instrument: 'lefs', items: Array.from({ length: 20 }, (_, i) => 'item ' + i), options: ['a', 'b', 'c', 'd', 'e'] });
  const rx = JSON.parse(JSON.stringify({ prom: [{ id: 'lefs', every: 4 }], promTexts: { lefs: lic.entry } }));
  assert.equal(isAvailable('lefs', { licenses: {} }), false);
  const merged = mergeLicenses(rx.promTexts, {});
  assert.equal(isAvailable('lefs', { licenses: merged }), true);
  assert.equal(resolveDef('lefs', { licenses: merged }).items.length, 20);
  assert.deepEqual(mergeLicenses({ lefs: { items: ['x'] }, nprs: { items: [] } }, null), {}); // entrées invalides ou instruments libres ignorés
  const local = { ...lic.entry, items: lic.entry.items.map((x) => ({ ...x, fr: 'local' })) };
  assert.equal(mergeLicenses(rx.promTexts, { lefs: local }).lefs.items[0].fr, 'local'); // l'import local prime
}
console.log('proms tests OK');
