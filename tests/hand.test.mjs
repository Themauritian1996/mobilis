// Test du suivi de la main : on anime la main du schéma, on la convertit en 21 points MediaPipe Hands
// et on vérifie le compte des répétitions (ou le temps de maintien) de chaque exercice du poignet / de la main.
import { pose, interpParams } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
import { Tracker } from '../www/js/pose.js';

const P = (p) => ({ x: p[0], y: p[1] });
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function handLm(fig, prm) {
  const j = pose(fig, prm), v = fig.view;
  const L = new Array(21);
  if (v === 'palm') {
    L[0] = P(j.wrist); L[1] = P(j.thumbBase); L[2] = P(mid(j.thumbBase, j.thumbMcp)); L[3] = P(j.thumbMcp); L[4] = P(j.thumbTip);
    j.fingers.forEach((f, i) => f.forEach((pt, k) => { L[5 + 4 * i + k] = P(pt); }));
  } else if (v === 'end') {
    const a = ((j.forearmRot || 0) * Math.PI) / 180, c = j.wrist;
    const R = (x, y) => ({ x: c[0] + x * Math.cos(a) - y * Math.sin(a), y: c[1] + x * Math.sin(a) + y * Math.cos(a) });
    L[0] = R(4, 0);
    for (let i = 0; i < 4; i++) { const y = -12 + i * 9.5; L[5 + 4 * i] = R(-13, y); L[6 + 4 * i] = R(-6, y); L[7 + 4 * i] = R(0, y); L[8 + 4 * i] = R(4, y); }
    L[1] = R(0, -18); L[2] = R(3, -22); L[3] = R(6, -24); L[4] = R(9, -24);
  } else { // vue de côté de la main
    L[0] = P(j.wrist); L[1] = P(j.thumbBase); L[2] = P(mid(j.thumbBase, j.thumbMcp)); L[3] = P(j.thumbMcp); L[4] = P(j.thumbTip);
    for (let i = 0; i < 4; i++) ['mcp', 'pip', 'dip', 'tip'].forEach((n, k) => { L[5 + 4 * i + k] = { x: j[n][0] + i * 0.8, y: j[n][1] - i * 0.8 }; });
  }
  return L;
}
function run(id, cycles = 5) {
  const ex = EXERCISES[id], fig = ex.fig, spec = ex.track.planes.hand;
  const fr = fig.frames, A = fr[0];
  // amplitude à tester : du départ à la position la plus éloignée du schéma (opposition : jusqu'au contact avec l'index)
  const B = id === 'thumb_opp' ? fr[1] : fr[fr.length - 1];
  const tr = new Tracker(ex, 'hand', { romFactor: 1 });
  let t = 0; const dt = 33, step = (prm) => { t += dt; return tr.update({ hand: handLm(fig, prm) }, t); };
  if (ex.track.mode === 'hold') {
    for (let i = 0; i < 30 * 12; i++) step(A);
    const s = tr.summary();
    return { id, mode: 'hold', reps: s.holdSec >= 10 ? 5 : 0, info: `${s.holdSec}s` };
  }
  for (let i = 0; i < 30; i++) step(A);
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i <= 90; i++) step(interpParams(A, B, i / 90));
    for (let i = 0; i < 190; i++) step(B);
    for (let i = 0; i <= 90; i++) step(interpParams(B, A, i / 90));
    for (let i = 0; i < 20; i++) step(A);
  }
  const s = tr.summary(), m = tr.repLog[0]?.meas;
  if (s.reps && (!m || !Number.isFinite(m.peakValue))) throw new Error('mesures manquantes ' + id);
  return { id, mode: 'reps', reps: s.reps, full: s.full, rom: m ? m.romPct + '%' : '-', peak: m?.peakValue, faults: Object.keys(s.faults).join(',') || '-' };
}
const cases = Object.entries(EXERCISES).filter(([, e]) => e.track?.kind === 'hand').map(([id]) => run(id));
console.table(cases);
const bad = cases.filter((c) => c.reps !== 5);
// immobile : aucune répétition comptée (main posée qui ne bouge pas)
for (const id of ['ecc_wrist_ext', 'thumb_opp', 'pron_sup']) {
  const ex = EXERCISES[id]; const tr = new Tracker(ex, 'hand'); let t = 0;
  for (let i = 0; i < 400; i++) { t += 33; tr.update({ hand: handLm(ex.fig, ex.fig.frames[0]) }, t); }
  if (tr.reps) bad.push({ id: id + ' (immobile)' });
}
console.log(bad.length ? `À revoir : ${bad.map((b) => b.id).join(', ')}` : 'Main : tous les exercices comptent 5/5');
if (bad.length) process.exit(1);

// Mains « réelles » : tremblement des points, main tournée / retournée, amplitude 85–100 %, rythme variable
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const U = (a, b) => a + (b - a) * rnd();
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3; };
let wrongCount = 0, badReps = 0, totReps = 0;
for (const [id, ex] of Object.entries(EXERCISES)) {
  if (ex.track?.kind !== 'hand' || ex.track.mode !== 'reps') continue;
  for (let k = 0; k < 8; k++) {
    const fig = ex.fig, fr = fig.frames, A = fr[0], B0 = id === 'thumb_opp' ? fr[1] : fr[fr.length - 1];
    const amp = U(0.85, 1), B = interpParams(A, B0, amp), rot = U(-0.4, 0.4), sc = U(0.7, 1.3), mir = rnd() < 0.5 ? -1 : 1, noise = U(0.4, 1.2);
    const tr = new Tracker(ex, 'hand', { romFactor: 0.85 });
    const spec = ex.track.planes.hand, hold = (spec.holdTop || 0) + U(0.3, 0.8);
    let t = 0;
    const step = (prm) => {
      t += 33;
      const L = handLm(fig, prm).map((p) => { const x = p.x * mir * sc, y = p.y * sc; return { x: x * Math.cos(rot) - y * Math.sin(rot) + gauss() * noise, y: x * Math.sin(rot) + y * Math.cos(rot) + gauss() * noise }; });
      tr.update({ hand: L }, t);
    };
    for (let i = 0; i < 40; i++) step(A);
    for (let r = 0; r < 6; r++) {
      const up = U(0.8, 2) * 30, dn = U(1, 3) * 30 + (spec.minRepSec || 0) * 20;
      for (let i = 0; i <= up; i++) step(interpParams(A, B, 0.5 - 0.5 * Math.cos(Math.PI * i / up)));
      for (let i = 0; i < hold * 30; i++) step(B);
      for (let i = 0; i <= dn; i++) step(interpParams(B, A, 0.5 - 0.5 * Math.cos(Math.PI * i / dn)));
      for (let i = 0; i < U(0.3, 1) * 30; i++) step(A);
    }
    if (tr.reps !== 6) { wrongCount++; console.log('compte', id, tr.reps); }
    totReps += tr.reps; badReps += tr.repLog.filter((r) => !r.full || r.faults.length).length;
  }
}
console.log(`Main réelle : séries mal comptées ${wrongCount}, répétitions signalées à tort ${badReps}/${totReps}`);
if (wrongCount || badReps > totReps * 0.05) process.exit(1);
