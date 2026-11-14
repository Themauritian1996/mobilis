import assert from 'node:assert/strict';
import { isPlannedDay, streak, monthAdherence, exceptionPatch, todayKey } from '../www/js/program.js';

// 2026-11-09 = lundi
const at = (k) => new Date(k + 'T12:00').getTime();
const base = { days: [1, 3, 5], joinedAt: at('2026-10-01') };

// jours de base
assert.equal(isPlannedDay(base, '2026-11-09'), true);   // lundi
assert.equal(isPlannedDay(base, '2026-11-10'), false);  // mardi
assert.equal(isPlannedDay(base, '2026-09-28'), false);  // avant l'inscription
// repos volontaire
assert.equal(isPlannedDay({ ...base, calSkip: ['2026-11-09'] }, '2026-11-09'), false);
// séance ajoutée
assert.equal(isPlannedDay({ ...base, calExtra: ['2026-11-10'] }, '2026-11-10'), true);
// déplacement : l'ancien jour n'est plus prévu, le nouveau l'est
const mv = { ...base, calMoves: { '2026-11-09': '2026-11-10' } };
assert.equal(isPlannedDay(mv, '2026-11-09'), false);
assert.equal(isPlannedDay(mv, '2026-11-10'), true);
// skip prioritaire sur extra
assert.equal(isPlannedDay({ ...base, calExtra: ['2026-11-10'], calSkip: ['2026-11-10'] }, '2026-11-10'), false);
// profil vide : défaut lundi/mercredi/vendredi
assert.equal(isPlannedDay({}, '2026-11-11'), true);

// exceptionPatch
let p = { ...base, ...exceptionPatch(base, 'move', '2026-11-09', '2026-11-10') };
assert.deepEqual(p.calMoves, { '2026-11-09': '2026-11-10' });
p = { ...p, ...exceptionPatch(p, 'move', '2026-11-10', '2026-11-12') }; // redéplacer le jour déplacé
assert.deepEqual(p.calMoves, { '2026-11-09': '2026-11-12' });
p = { ...p, ...exceptionPatch(p, 'undo', '2026-11-12') };
assert.equal(isPlannedDay(p, '2026-11-09'), true);
p = { ...p, ...exceptionPatch(p, 'add', '2026-11-10') };
assert.deepEqual(p.calExtra, ['2026-11-10']);
p = { ...p, ...exceptionPatch(p, 'move', '2026-11-10', '2026-11-11') };
assert.deepEqual(p.calExtra, ['2026-11-11']);
p = { ...p, ...exceptionPatch(p, 'rest', '2026-11-11') };
assert.equal(isPlannedDay(p, '2026-11-11'), false);

// série : mercredi 11 nov 2026 ; séances lun 9, ven 6, mer 4
const S = (k) => ({ date: at(k), items: [] });
const now = at('2026-11-11'); // mercredi, pas encore fait
const sess = [S('2026-11-04'), S('2026-11-06'), S('2026-11-09')];
assert.equal(streak(base, sess, now), 3);
assert.equal(streak(base, [S('2026-11-04'), S('2026-11-09')], now), 1);       // vendredi 6 manqué
// ... mais pas manqué si repos volontaire
assert.equal(streak({ ...base, calSkip: ['2026-11-06'] }, [S('2026-11-04'), S('2026-11-09')], now), 2);
// ... ou si déplacé vers un jour où c'est fait
assert.equal(streak({ ...base, calMoves: { '2026-11-06': '2026-11-07' } }, [S('2026-11-04'), S('2026-11-07'), S('2026-11-09')], now), 3);
// séance ajoutée non faite (passé) casse la série
assert.equal(streak({ ...base, calExtra: ['2026-11-10'] }, sess, now), 0);
// aujourd'hui fait compte aussi
assert.equal(streak(base, sess.concat(S('2026-11-11')), now), 4);

// adhérence de novembre 2026 au 12 : prévus lun 2, mer 4, ven 6, lun 9, mer 11 = 5
let a = monthAdherence(base, [S('2026-11-02'), S('2026-11-04'), S('2026-11-06')], 2026, 10, now);
assert.deepEqual([a.planned, a.hit, a.sessions, a.pct], [5, 3, 3, 60]);
a = monthAdherence({ ...base, calSkip: ['2026-11-09', '2026-11-11'] }, [S('2026-11-02'), S('2026-11-04'), S('2026-11-06')], 2026, 10, now);
assert.deepEqual([a.planned, a.hit, a.pct], [3, 3, 100]);
a = monthAdherence({ ...base, calExtra: ['2026-11-10'] }, [S('2026-11-10')], 2026, 10, now);
assert.equal(a.planned, 6); assert.equal(a.hit, 1);
assert.equal(todayKey(at('2026-11-12')), '2026-11-12');
console.log('calendar tests OK');
