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
