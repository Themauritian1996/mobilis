import assert from 'node:assert/strict';
import * as B from '../www/js/badges.js';
import * as P from '../www/js/program.js';

// Dimanche 15 nov. 2026, 20 h (heure locale). Jours prévus du profil : lundi, mercredi, vendredi.
const NOW = new Date('2026-11-15T20:00').getTime();
const DAYS = [1, 3, 5];
const prof = (o = {}) => ({ days: DAYS, startDate: new Date('2026-07-01T10:00').getTime(), ...o });
const at = (k, h = 10) => new Date(`${k}T${String(h).padStart(2, '0')}:00`).getTime();
const addDays = (k, n) => { const d = new Date(k + 'T12:00'); d.setDate(d.getDate() + n); return P.todayKey(d.getTime()); };
const sess = (k, items = []) => ({ id: 's' + k, date: at(k), items });
const item = (k, o = {}) => ({ id: 'chin_tuck', level: 2, sets: [{ full: 10, partial: 0, quality: 0.9 }], pain: 1, difficulty: 3, ts: at(k, 11), change: 0, ...o });
// n jours prévus réalisés se terminant au jour `end` (inclus)
function lastPlanned(p, end, n) {
  const out = []; let k = end;
  for (let guard = 0; out.length < n && guard < 1000; guard++, k = addDays(k, -1)) if (P.isPlannedDay(p, k)) out.push(k);
  return out.reverse().map((x) => sess(x));
}
// n jours consécutifs à partir de `start`
const consecutive = (start, n) => Array.from({ length: n }, (_, i) => sess(addDays(start, i)));
const ev = (p, s, now = NOW) => B.evaluateBadges(p, s, now);

// --- structure
assert.equal(B.BADGES.length, 14);
assert.equal(new Set(B.BADGES.map((b) => b.id)).size, B.BADGES.length, 'ids uniques');
for (const b of B.BADGES) assert.equal(typeof b.when, 'function', b.id);

// --- vide
assert.deepEqual(ev({}, []), { earned: {}, newOnes: [] });
assert.deepEqual(ev(prof(), []).newOnes, []);

// --- première séance
let r = ev(prof(), [sess('2026-11-09')]);
assert.equal(r.earned.first, at('2026-11-09'));
assert.ok(!r.earned.streak3 && !r.earned.sessions10);

// --- séries (jours prévus consécutifs)
r = ev(prof(), lastPlanned(prof(), '2026-11-13', 2));
assert.equal(r.earned.streak3, undefined, 'deux jours ne suffisent pas');
r = ev(prof(), lastPlanned(prof(), '2026-11-13', 3));
assert.equal(r.earned.streak3, at('2026-11-13'), 'ts = jour où la série atteint 3');
for (const [id, n] of [['streak7', 7], ['streak14', 14], ['streak30', 30]]) {
  const p = prof();
  assert.equal(ev(p, lastPlanned(p, '2026-11-13', n - 1)).earned[id], undefined, id + ' non atteint');
  assert.ok(ev(p, lastPlanned(p, '2026-11-13', n)).earned[id] != null, id + ' atteint');
}
// une série cassée par un jour prévu manqué ne compte pas
{
  const p = prof();
  const s = lastPlanned(p, '2026-11-13', 7).filter((x) => x.date !== at('2026-11-11'));
  assert.equal(ev(p, s).earned.streak7, undefined);
}
// progression d'une série
assert.deepEqual(B.badgeProgress(B.BADGES.find((b) => b.id === 'streak7'), prof(), lastPlanned(prof(), '2026-11-13', 3), NOW), { n: 3, of: 7, unit: 'bdgUnitDays' });

// --- nombre de séances
const c10 = consecutive('2026-10-01', 10);
assert.equal(ev(prof(), c10.slice(0, 9)).earned.sessions10, undefined);
assert.equal(ev(prof(), c10).earned.sessions10, at('2026-10-10'));
assert.ok(ev(prof(), consecutive('2026-09-01', 50)).earned.sessions50 != null);
assert.equal(ev(prof(), consecutive('2026-09-01', 49)).earned.sessions50, undefined);
assert.ok(ev(prof(), consecutive('2026-07-01', 100)).earned.sessions100 != null);
assert.equal(ev(prof(), consecutive('2026-07-01', 99)).earned.sessions100, undefined);
assert.deepEqual(B.badgeProgress(B.BADGES.find((b) => b.id === 'sessions10'), prof(), c10.slice(0, 4), NOW), { n: 4, of: 10, unit: 'bdgUnitSess' });

// --- semaine complète (jours de repos inclus)
{
  const p = prof();
  const full = [sess('2026-11-09'), sess('2026-11-11'), sess('2026-11-13')];
  assert.equal(ev(p, full).earned.fullWeek, at('2026-11-13'));
  assert.equal(ev(p, [sess('2026-11-09'), sess('2026-11-11')]).earned.fullWeek, undefined, 'vendredi manquant');
  assert.equal(ev(p, [sess('2026-11-09'), sess('2026-11-13')]).earned.fullWeek, undefined, 'mercredi prévu manquant');
  const rest = prof({ calSkip: ['2026-11-11'] }); // mercredi : jour de repos choisi
  assert.equal(ev(rest, [sess('2026-11-09'), sess('2026-11-13')]).earned.fullWeek, at('2026-11-13'), 'repos ne compte pas');
  assert.equal(ev(rest, [sess('2026-11-09')]).earned.fullWeek, undefined);
  // séance ajoutée un jour de repos : ne compte pas comme prévu mais ne bloque pas
  const extra = prof({ calSkip: ['2026-11-11'] });
  assert.equal(ev(extra, [sess('2026-11-09'), sess('2026-11-11'), sess('2026-11-13')]).earned.fullWeek, at('2026-11-13'));
}

// --- niveau supérieur
{
  const s = [sess('2026-11-08', [item('2026-11-08', { change: -1 })]), sess('2026-11-10', [item('2026-11-10', { change: 1 })])];
  assert.equal(ev(prof(), s).earned.levelUp, at('2026-11-10', 11));
  assert.equal(ev(prof(), [sess('2026-11-08', [item('2026-11-08', { change: -1 })])]).earned.levelUp, undefined);
}

// --- amplitude (+10° sur la dernière valeur, confiance >= 0,5)
const rom = (...rows) => rows.map(([test, side, d, k, conf = 0.9]) => ({ test, side, deg: d, ts: at(k), conf, method: 'camera' }));
{
  const base = rom(['sh_flex', 'L', 120, '2026-10-01'], ['sh_flex', 'L', 128, '2026-11-01']);
  assert.equal(ev(prof({ romLog: base }), []).earned.rangeUp, undefined, '+8° non');
  const ok = rom(['sh_flex', 'L', 120, '2026-10-01'], ['sh_flex', 'L', 128, '2026-11-01'], ['sh_flex', 'L', 131, '2026-11-10']);
  assert.equal(ev(prof({ romLog: ok }), []).earned.rangeUp, at('2026-11-10'));
  const lowConf = rom(['sh_flex', 'L', 120, '2026-10-01'], ['sh_flex', 'L', 150, '2026-11-01', 0.3]);
  assert.equal(ev(prof({ romLog: lowConf }), []).earned.rangeUp, undefined, 'faible confiance ignorée');
  const otherSide = rom(['sh_flex', 'L', 120, '2026-10-01'], ['sh_flex', 'R', 140, '2026-11-01']);
  assert.equal(ev(prof({ romLog: otherSide }), []).earned.rangeUp, undefined, 'côtés séparés');
  const single = rom(['sh_flex', 'L', 160, '2026-11-01']);
  assert.equal(ev(prof({ romLog: single }), []).earned.rangeUp, undefined, 'une seule mesure');
}

// --- questionnaire, rapport
{
  const p = prof({ promLog: [{ id: 'nprs', ts: at('2026-11-02'), answers: [3], score: 3 }], reportLog: [{ ts: at('2026-11-05'), fields: {}, pdfName: 'r.pdf' }] });
  const r2 = ev(p, []);
  assert.equal(r2.earned.prom, at('2026-11-02'));
  assert.equal(r2.earned.report, at('2026-11-05'));
  assert.equal(ev(prof({ promLog: [], reportLog: [] }), []).earned.prom, undefined);
}

// --- retour après pause (>= 7 jours)
{
  const s = [sess('2026-10-01'), sess('2026-10-09')];
  assert.equal(ev(prof(), s).earned.comeback, at('2026-10-09'));
  assert.equal(ev(prof(), [sess('2026-10-01'), sess('2026-10-07')]).earned.comeback, undefined, '6 jours');
  assert.equal(ev(prof(), [sess('2026-10-01'), sess('2026-10-08')]).earned.comeback, at('2026-10-08'), '7 jours exactement');
  assert.equal(ev(prof(), [sess('2026-10-01'), sess('2026-10-08'), sess('2026-10-09')]).earned.comeback, at('2026-10-08'));
}

// --- pas de doublon, newOnes une seule fois, persistance
{
  const p = prof({ promLog: [{ id: 'nprs', ts: at('2026-11-02'), answers: [3], score: 3 }] });
  const s = [...consecutive('2026-10-01', 10), ...lastPlanned(prof(), '2026-11-13', 3)];
  const before = JSON.stringify({ p, s });
  const first = ev(p, s);
  assert.equal(new Set(first.newOnes).size, first.newOnes.length, 'newOnes sans doublon');
  assert.ok(first.newOnes.includes('first') && first.newOnes.includes('sessions10') && first.newOnes.includes('prom'));
  assert.equal(JSON.stringify({ p, s }), before, 'entrées non modifiées');
  const saved = { ...p, badges: first.earned };
  const again = ev(saved, s);
  assert.deepEqual(again.newOnes, [], 'rien de nouveau après persistance');
  assert.deepEqual(again.earned, first.earned);
  // badge déjà enregistré : ni recalculé, ni retiré
  const kept = ev(prof({ badges: { sessions10: 999 } }), c10.slice(0, 3));
  assert.equal(kept.earned.sessions10, 999);
  assert.ok(!kept.newOnes.includes('sessions10'));
  const gone = ev(prof({ badges: { first: 12345 } }), []);
  assert.equal(gone.earned.first, 12345);
  assert.ok(!gone.newOnes.includes('first'));
}

// --- chip d'accueil
assert.ok(B.homeChipBadges({ badges: { first: 1, prom: 2 } }).includes(`2 / ${B.BADGES.length}`));
assert.ok(B.homeChipBadges({}).includes(`0 / ${B.BADGES.length}`));

console.log('badges tests ok');
