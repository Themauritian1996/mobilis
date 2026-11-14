import assert from 'node:assert/strict';
import * as P from '../www/js/program.js';

const at = (k, h = 10) => new Date(k + `T${String(h).padStart(2, '0')}:00`).getTime();
const prof = (o = {}) => ({ pathology: 'neck_mech', baseLevel: 2, levels: { chin_tuck: 3 }, days: [1, 3, 5], ...o }); // painMax 4
const sets = (q) => [{ quality: q }, { quality: q }];
const item = (day, difficulty, pain = 1, q = 0.9, id = 'chin_tuck', h = 10) => ({ id, level: 3, sets: sets(q), pain, difficulty, ts: at(day, h) });
const sess = (...items) => ({ id: 's' + items[0].ts, date: items[0].ts, items });
const cur = (d, pain, q, day = '2026-11-12') => item(day, d, pain, q, 'chin_tuck', 18);
const adj = (p, it, all, ck) => P.adjustLevel(p, it, all, ck);

// --- douleur / pire / difficulté 5 / qualité
let r = adj(prof(), cur(3, 5), []);
assert.deepEqual([r.level, r.change, r.reason], [2, -1, 'pain']);
r = adj(prof(), cur(2, 1), [], 'worse');
assert.deepEqual([r.level, r.change, r.reason], [2, -1, 'pain']);
r = adj(prof(), cur(5, 1), []);
assert.deepEqual([r.level, r.change, r.reason], [2, -1, 'hard']);
r = adj(prof(), cur(3, 1, 0.4), []);
assert.deepEqual([r.level, r.change, r.reason], [2, -1, 'hard']);
// plancher niveau 1
r = adj(prof({ levels: { chin_tuck: 1 } }), cur(5, 1), []);
assert.deepEqual([r.level, r.change], [1, 0]);

// --- difficulté 4 : même niveau
r = adj(prof(), cur(4, 1), [sess(item('2026-11-10', 4)), sess(item('2026-11-11', 4))]);
assert.deepEqual([r.level, r.change, r.reason], [3, 0, 'steady']);

// --- facile : 2 séances consécutives de jours différents
const e1 = sess(item('2026-11-10', 2));
r = adj(prof(), cur(2, 1), []);
assert.deepEqual([r.level, r.change, r.reason], [3, 0, 'steady']); // première séance facile
r = adj(prof(), cur(2, 1), [e1]);
assert.deepEqual([r.level, r.change, r.reason], [4, 1, 'easy']);
r = adj(prof(), cur(1, 1, 0.8), [e1]);
assert.equal(r.change, 1);
// qualité absente acceptée (exercice guidé)
const noQ = { id: 'chin_tuck', level: 3, sets: [{}, {}], pain: 1, difficulty: 2, ts: at('2026-11-12', 18) };
r = adj(prof(), noQ, [sess({ ...item('2026-11-10', 2), sets: [{}] })]);
assert.equal(r.change, 1);
// qualité < 0,8 : pas de montée
r = adj(prof(), cur(2, 1, 0.7), [e1]);
assert.deepEqual([r.change, r.reason], [0, 'steady']);
// douleur trop proche du maximum (> painMax-1)
r = adj(prof(), cur(2, 4), [e1]);
assert.equal(r.change, 0);
r = adj(prof(), cur(2, 1), [sess(item('2026-11-10', 2, 4))]);
assert.equal(r.change, 0);
// la séance précédente n'était pas facile
r = adj(prof(), cur(2, 1), [sess(item('2026-11-10', 3))]);
assert.equal(r.change, 0);
// reprise du même jour ignorée : l'item précédent est du même jour
r = adj(prof(), cur(2, 1), [sess(item('2026-11-12', 2, 1, 0.9, 'chin_tuck', 9))]);
assert.deepEqual([r.change, r.reason], [0, 'steady']);
// même jour + jour précédent facile : monte (le même jour ne compte pas, le jour précédent oui)
r = adj(prof(), cur(2, 1), [e1, sess(item('2026-11-12', 4, 1, 0.9, 'chin_tuck', 9))]);
assert.equal(r.change, 1);
// deux essais le même jour précédent comptent pour UN seul jour (le dernier essai du jour)
r = adj(prof(), cur(3, 1), [sess(item('2026-11-10', 3, 1, 0.9, 'chin_tuck', 9), item('2026-11-10', 3, 1, 0.9, 'chin_tuck', 11))]);
assert.equal(r.change, 0);
// un autre exercice ne compte pas
r = adj(prof(), cur(2, 1), [sess(item('2026-11-10', 2, 1, 0.9, 'cerv_rot'))]);
assert.equal(r.change, 0);

// --- difficulté 3 : 3 séances consécutives
const t3 = [sess(item('2026-11-08', 3)), sess(item('2026-11-10', 3))];
r = adj(prof(), cur(3, 1), t3);
assert.deepEqual([r.level, r.change, r.reason], [4, 1, 'easy']);
r = adj(prof(), cur(3, 1), [t3[1]]);
assert.equal(r.change, 0);
r = adj(prof(), cur(3, 1), [sess(item('2026-11-08', 2)), t3[1]]);
assert.equal(r.change, 0);
r = adj(prof(), cur(3, 1, 0.75), t3);
assert.equal(r.change, 0);
r = adj(prof(), cur(3, 4), t3);
assert.equal(r.change, 0); // douleur > painMax-1
r = adj(prof(), cur(3, 1), [sess(item('2026-11-08', 3, 1, 0.7)), t3[1]]);
assert.equal(r.change, 0);
// séance du même jour ne compte pas dans les 3
r = adj(prof(), cur(3, 1), [t3[1], sess(item('2026-11-12', 3, 1, 0.9, 'chin_tuck', 8))]);
assert.equal(r.change, 0);

// --- autoEx === false : aucun changement automatique
r = adj(prof({ autoEx: { chin_tuck: false } }), cur(2, 1), [e1]);
assert.deepEqual([r.level, r.change, r.reason], [3, 0, 'locked']);
// sécurité : la douleur fait quand même baisser
r = adj(prof({ autoEx: { chin_tuck: false } }), cur(5, 6), [], 'worse');
assert.deepEqual([r.level, r.change, r.reason], [2, -1, 'pain']);
r = adj(prof({ autoEx: { chin_tuck: true } }), cur(2, 1), [e1]);
assert.equal(r.change, 1);

// --- maxLevel
r = adj(prof({ maxLevel: { chin_tuck: 3 } }), cur(2, 1), [e1]);
assert.deepEqual([r.level, r.change, r.reason], [3, 0, 'max']);
r = adj(prof({ maxLevel: { chin_tuck: 4 } }), cur(2, 1), [e1]);
assert.deepEqual([r.level, r.change], [4, 1]);
r = adj(prof({ levels: { chin_tuck: 5 } }), cur(2, 1), [e1]);
assert.deepEqual([r.level, r.change, r.reason], [5, 0, 'max']);
r = adj(prof({ maxLevel: { chin_tuck: 3 } }), cur(5, 1), []);
assert.equal(r.change, -1); // baisser reste permis

// --- poussée : inchangé
r = adj(prof({ flareUntil: Date.now() + 86400000 }), cur(2, 1), [e1]);
assert.deepEqual([r.level, r.change, r.reason], [3, 0, 'flare']);

// --- priorItems / lastItem
assert.equal(P.priorItems([e1, sess(item('2026-11-12', 2))], 'chin_tuck', '2026-11-12').length, 1);
assert.equal(P.lastItem([e1], 'chin_tuck').difficulty, 2);

// --- fusion des doses : niveau -> rxDose adapté -> doseOver -> todayOver
const ID = 'chin_tuck';
const base3 = P.doseFor(ID, 3), base5 = P.doseFor(ID, 5);
const noRest = (d) => ({ sets: d.sets, reps: d.reps });
let pr = prof({ levels: { [ID]: 3 } });
let it = P.todaysProgram(pr).find((x) => x.id === ID);
assert.equal(it.dose.sets, base3.sets); assert.equal(it.dose.reps, base3.reps); assert.equal(it.dose.rest, 30); assert.ok(!it.dose.custom);
// rxDose au même niveau
pr = prof({ levels: { [ID]: 3 }, rxDose: { [ID]: { sets: 4, reps: 12, rest: 45, lv: 3 } } });
it = P.todaysProgram(pr).find((x) => x.id === ID);
assert.deepEqual([it.dose.sets, it.dose.reps, it.dose.rest, !!it.dose.custom], [4, 12, 45, false]);
// niveau monte : reps adaptées par le rapport des facteurs (1,4/1 = x1,4)
pr = prof({ levels: { [ID]: 5 }, rxDose: { [ID]: { sets: 4, reps: 10, rest: 45, lv: 3 } } });
it = P.todaysProgram(pr).find((x) => x.id === ID);
assert.deepEqual([it.dose.sets, it.dose.reps, it.dose.rest], [4, 14, 45]);
// niveau baisse
pr = prof({ levels: { [ID]: 1 }, rxDose: { [ID]: { sets: 4, reps: 10, lv: 3 } } });
assert.equal(P.todaysProgram(pr).find((x) => x.id === ID).dose.reps, 6);
// doseOver patient par-dessus
pr = prof({ levels: { [ID]: 3 }, rxDose: { [ID]: { sets: 4, reps: 12, rest: 45, lv: 3 } }, doseOver: { [ID]: { sets: 2, reps: 8, rest: 15 } } });
it = P.todaysProgram(pr).find((x) => x.id === ID);
assert.deepEqual([it.dose.sets, it.dose.reps, it.dose.rest, it.dose.custom, it.kept], [2, 8, 15, true, true]);
// todayOver par-dessus tout
pr = { ...pr, todayOver: { date: P.todayKey(), items: { [ID]: { sets: 1, reps: 5, rest: 0 } }, skip: [] } };
it = P.todaysProgram(pr).find((x) => x.id === ID);
assert.deepEqual([it.dose.sets, it.dose.reps, it.dose.rest], [1, 5, 0]);
// todayOver d'un autre jour ignoré
pr = { ...pr, todayOver: { date: '2000-01-01', items: { [ID]: { sets: 1 } }, skip: [ID] } };
it = P.todaysProgram(pr).find((x) => x.id === ID);
assert.equal(it.dose.sets, 2);
// passer aujourd'hui
pr = { ...pr, todayOver: { date: P.todayKey(), items: {}, skip: [ID] } };
assert.ok(!P.todaysProgram(pr).some((x) => x.id === ID));
assert.ok(P.todaysProgram(pr, { withSkipped: true }).some((x) => x.id === ID && x.skipped));
// maintien (exercice de type hold)
const H = 'dnf';
pr = prof({ levels: { [H]: 3 }, rxDose: { [H]: { sets: 2, hold: 20, lv: 3 } } });
it = P.todaysProgram(pr).find((x) => x.id === H) || { dose: P.doseOf(pr, H, 3) };
assert.equal(it.dose.hold, 20);
assert.equal(P.doseOf({ ...pr, levels: { [H]: 5 } }, H, 5).hold, 30); // 20 x 1,5/1 = 30
// poussée : base réduite, rxDose conservée puis réduite une seule fois
const fl = P.doseOf(prof({ rxDose: { [ID]: { sets: 4, reps: 10, lv: 3 } } }), ID, 2, true);
assert.equal(fl.sets, 3); assert.ok(fl.reps < 10);
// ordre imposé par le clinicien (plan.ids)
pr = prof({ phase: 1, plan: { phase: 1, ids: ['dnf', 'cerv_rot', 'chin_tuck'] } });
assert.deepEqual(P.todaysProgram(pr).map((x) => x.id), ['dnf', 'cerv_rot', 'chin_tuck']);
// scaleDose
assert.equal(P.scaleDose(ID, { reps: 10, sets: 3 }, 3, 3).reps, 10);
assert.equal(P.scaleDose(ID, { reps: 10, sets: 3 }, 3, 3).sets, 3);

// --- progressSummary : résumé par exercice
const ps = P.progressSummary(prof({ phase: 1, startDate: at('2026-11-01') }), [sess({ ...item('2026-11-10', 2, 3), change: 1 })], at('2026-11-12'));
assert.deepEqual(ps.ex.chin_tuck, { level: 3, lastDifficulty: 2, lastPain: 3, trend: 'up' });
assert.equal(ps.ex.dnf.lastDifficulty, null);
console.log('program tests OK');
