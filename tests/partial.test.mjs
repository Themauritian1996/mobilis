// Répétitions partielles : comptées dès 35 % de la cible (marquées partielles), pas à 25 %, ancien seuil (60 %) si désactivé ;
// la progression n'est pas trompée par des séries surtout partielles. Immobile / bruit : aucune répétition fantôme.
import { pose, interpParams } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
import { Tracker, toPx, setPartialPolicy } from '../www/js/pose.js';
import { itemQuality, adjustLevel } from '../www/js/program.js';

function toLm(fig, prm) {
  const j = pose(fig, prm); const L = new Array(33).fill(null).map(() => ({ x: 0, y: 0, visibility: 1 }));
  const set = (i, p, dx = 0, dy = 0) => { L[i] = { x: (p[0] + dx) / 240, y: (p[1] + dy) / 200, visibility: 1 }; };
  set(0, j.head, 8, 0); set(7, j.head, -2, 0); set(8, j.head, -1, 0);
  set(11, j.shoulder); set(12, j.shoulder, 1, 0); set(13, j.elbow); set(14, j.elbow2); set(15, j.wrist); set(16, j.wrist2);
  set(23, j.pelvis); set(24, j.pelvis, 1, 0); set(25, j.knee); set(26, j.knee2); set(27, j.ankle); set(28, j.ankle2);
  set(29, j.ankle, -4, 3); set(30, j.ankle2, -4, 3); set(31, j.toe); set(32, j.toe2);
  return L;
}
function run(amp, opts = {}, cycles = 4, id = 'squat') {
  const ex = EXERCISES[id], fig = ex.fig, [A, B] = fig.frames;
  const tr = new Tracker(ex, 'side', { romFactor: 1, ...opts });
  let t = 0; const step = (prm) => { t += 33; tr.update(toPx(toLm(fig, prm), 240, 200), t); };
  for (let i = 0; i < 30; i++) step(A);
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i <= 45; i++) step(interpParams(A, B, (amp * i) / 45));
    for (let i = 0; i < 25; i++) step(interpParams(A, B, amp));
    for (let i = 0; i <= 45; i++) step(interpParams(A, B, amp * (1 - i / 45)));
    for (let i = 0; i < 20; i++) step(A);
  }
  return tr;
}
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('ÉCHEC :', m); } };

// trouver l'amplitude qui donne ~40 % et ~25 % de la cible (mesure réelle du suiveur)
const rom = (amp) => { const tr = run(amp, { partialMin: 0.01 }, 1); return tr.repLog[0]?.meas.romPct ?? 0; };
let a40 = 0.3, a25 = 0.2;
for (let a = 0.1; a <= 1; a += 0.01) { if (rom(a) >= 40) { a40 = a; break; } }
for (let a = 0.1; a <= 1; a += 0.01) { if (rom(a) >= 25) { a25 = a; break; } }
console.log('amplitudes simulées : 40 % →', a40.toFixed(2), '| 25 % →', a25.toFixed(2));

const t40 = run(a40); ok(t40.reps === 4 && t40.partial === 4 && t40.full === 0, `40 % : 4 partielles attendues, reçu reps=${t40.reps} partial=${t40.partial}`);
ok(t40.repLog.every((r) => !r.full && r.meas.romPct >= 35 && r.meas.romPct < 60 && r.quality <= 0.7), '40 % : romPct, full=false, qualité ≤ 0,7');
const t25 = run(a25); ok(t25.reps === 0, `25 % : aucune répétition attendue, reçu ${t25.reps}`);
const off = run(a40, { partialMin: false }); ok(off.reps === 0, 'countPartial=false : 40 % ne compte pas (ancien seuil)');
setPartialPolicy((ex) => (ex === EXERCISES.squat ? false : true));
ok(run(a40).reps === 0, 'politique par exercice : false → ne compte pas');
setPartialPolicy(null);
ok(run(a40).reps === 4, 'sans politique : compte');
ok(run(1).full === 4 && run(1).partial === 0, 'amplitude pleine : 4 complètes');
// « depth » : première partielle puis une sur trois
{ const cues = []; run(a40, { onCue: (k) => cues.push(k) }, 7); const n = cues.filter((c) => c === 'depth').length; ok(n === 3, `depth : 3 conseils sur 7 partielles attendus, reçu ${n}`); }
// immobile et bruit : aucune répétition fantôme
{ const ex = EXERCISES.squat, fig = ex.fig, A = fig.frames[0]; const tr = new Tracker(ex, 'side'); let t = 0, seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < 900; i++) { t += 33; const lm = toLm(fig, A); for (const p of lm) { p.x += rnd() * 0.006; p.y += rnd() * 0.006; } tr.update(toPx(lm, 240, 200), t); }
  ok(tr.reps === 0, `bruit/immobile : 0 répétition attendue, reçu ${tr.reps}`); }
// progression : séries surtout partielles → pas de montée de niveau (qualité < 0,8)
{ const q = (full, part) => itemQuality({ sets: [{ quality: full * 1 + part * 0.7 ? (full + part * 0.7) / (full + part) : null }] });
  ok(q(1, 9) < 0.8 && q(0, 10) < 0.8, 'séries surtout partielles : qualité < 0,8');
  const prof = { pathology: null, levels: { squat: 2 } };
  const item = (qq) => ({ id: 'squat', difficulty: 1, pain: 0, ts: Date.now(), sets: [{ quality: qq }] });
  const prior = [{ date: Date.now() - 2 * 864e5, items: [{ ...item(0.7), ts: Date.now() - 2 * 864e5 }] }];
  ok(adjustLevel(prof, item(0.7), prior).change <= 0, 'adjustLevel : partielles ne montent pas');
  const prior2 = [{ date: Date.now() - 2 * 864e5, items: [{ ...item(1), ts: Date.now() - 2 * 864e5 }] }];
  ok(adjustLevel(prof, item(1), prior2).change === 1, 'adjustLevel : séries complètes montent (témoin)'); }
if (fails) process.exit(1);
console.log('Répétitions partielles : OK');
