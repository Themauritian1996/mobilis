// Test : on anime le bonhomme du schéma, on le convertit en points MediaPipe et on vérifie le compte des répétitions.
import { pose, interpParams } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
import { Tracker, toPx } from '../www/js/pose.js';

const lerpP = interpParams;
function toLm(fig, prm) {
  const j = pose(fig, prm); const L = new Array(33).fill(null).map(() => ({ x: 0, y: 0, visibility: 1 }));
  const set = (i, p, dx = 0, dy = 0) => { L[i] = { x: (p[0] + dx) / 240, y: (p[1] + dy) / 200, visibility: 1 }; };
  if ((fig.view || 'side') === 'side') {
    set(0, j.head, 8, 0); set(7, j.head, -2, 0); set(8, j.head, -1, 0);
    set(11, j.shoulder); set(12, j.shoulder, 1, 0); set(13, j.elbow); set(14, j.elbow2); set(15, j.wrist); set(16, j.wrist2);
    set(23, j.pelvis); set(24, j.pelvis, 1, 0); set(25, j.knee); set(26, j.knee2); set(27, j.ankle); set(28, j.ankle2);
    set(29, j.ankle, -4, 3); set(30, j.ankle2, -4, 3); set(31, j.toe); set(32, j.toe2);
  } else {
    set(0, j.head, (j.headRot || 0) * 6, 1); set(7, j.head, 6, 0); set(8, j.head, -6, 0);
    set(11, j.shL); set(12, j.shR); set(13, j.elbowL); set(14, j.elbowR); set(15, j.wristL); set(16, j.wristR);
    set(23, j.hipL); set(24, j.hipR); set(25, j.kneeL); set(26, j.kneeR); set(27, j.ankleL); set(28, j.ankleR);
    set(29, j.ankleL, 0, 3); set(30, j.ankleR, 0, 3); set(31, j.ankleL, 2, 6); set(32, j.ankleR, -2, 6);
  }
  return L;
}
const FRONT_SIM = {
  squat: { view: 'front', anchor: { j: 'ankleL', x: 131, y: 180 }, frames: [{}, { thighScaleR: 0.25, thighScaleL: 0.25, hipAbdR: 10, hipAbdL: 10, shAbdR: 0, shAbdL: 0 }] },
  sit_stand: { view: 'front', anchor: { j: 'ankleL', x: 131, y: 180 }, frames: [{}, { thighScaleR: 0.2, thighScaleL: 0.2, hipAbdR: 8, hipAbdL: 8 }] },
};
function run(id, plane, fig, cycles = 5) {
  const ex = EXERCISES[id]; fig = fig || ex.fig;
  const [A, B] = [fig.frames[0], fig.frames[1]];
  const tr = new Tracker(ex, plane, { romFactor: 1 });
  let t = 0; const dt = 33;
  const step = (prm) => { t += dt; return tr.update(toPx(toLm(fig, prm), 240, 200), t); };
  for (let i = 0; i < 30; i++) step(A);
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i <= 45; i++) step(lerpP(A, B, i / 45));
    for (let i = 0; i < 190; i++) step(B); // tenir en haut ~6 s
    for (let i = 0; i <= 45; i++) step(lerpP(B, A, i / 45));
    for (let i = 0; i < 10; i++) step(A);
  }
  const s = tr.summary();
  const m = tr.repLog[0]?.meas;
  if (s.reps && (!m || m.romPct < 50 || !Number.isFinite(m.peakValue))) throw new Error(`mesures manquantes : ${id}`);
  return { id, plane, reps: s.reps, full: s.full, rom: m ? m.romPct + '%' : '-', faults: Object.keys(s.faults).join(',') || '-' };
}
const cases = [];
for (const [id, ex] of Object.entries(EXERCISES)) {
  if (!ex.track || ex.track.mode !== 'reps' || ex.fig.frames.length < 2) continue;
  const v = ex.fig.view || 'side';
  const plane = v === 'front' ? 'front' : 'side';
  if (!ex.track.planes[plane]) continue;
  cases.push(run(id, plane));
  // vue de face simulée pour les exercices debout filmés dans les deux plans
  if (plane === 'side' && ex.track.planes.front && FRONT_SIM[id]) cases.push(run(id, 'front', FRONT_SIM[id]));
}
console.table(cases);
const bad = cases.filter((c) => c.reps !== 5);
console.log(bad.length ? `À revoir : ${bad.map((b) => b.id).join(', ')}` : 'Tous les exercices comptent 5/5');

// Détection d'erreurs : tronc trop penché au squat (vue de côté) et genoux en valgus (vue de face)
const leanFig = { ...EXERCISES.squat.fig, frames: [EXERCISES.squat.fig.frames[0], { ...EXERCISES.squat.fig.frames[1], trunk: 65 }] };
const valgusFig = { view: 'front', anchor: { j: 'ankleL', x: 131, y: 180 }, frames: [{}, { thighScaleR: 0.3, thighScaleL: 0.3, hipAbdR: -14, hipAbdL: -14, shankR: 22, shankL: 22 }] };
const r1 = run('squat', 'side', leanFig), r2 = run('squat', 'front', valgusFig);
{ // la pire valeur du contrôle « tronc » doit dépasser la limite de 45°
  const ex = EXERCISES.squat; const tr = new Tracker(ex, 'side'); let t = 0;
  const [A, B] = leanFig.frames; const st = (prm) => { t += 33; tr.update(toPx(toLm(leanFig, prm), 240, 200), t); };
  for (let i = 0; i < 30; i++) st(A); for (let i = 0; i <= 45; i++) st(lerpP(A, B, i / 45)); for (let i = 0; i < 30; i++) st(B); for (let i = 0; i <= 45; i++) st(lerpP(B, A, i / 45)); for (let i = 0; i < 10; i++) st(A);
  const c = tr.repLog[0].meas.checks.find((x) => x.cue === 'trunk');
  if (!(c && c.value > 45)) throw new Error('mesure du tronc incorrecte ' + JSON.stringify(c));
  console.log('Mesure tronc au squat penché :', c.value.toFixed(1), '° (limite 45°)');
}
console.log('Tronc penché →', r1.faults, '| Valgus →', r2.faults);
if (!r1.faults.includes('trunk') || !r2.faults.includes('valgus')) { console.error('Détection d’erreur ÉCHOUÉE'); process.exit(1); }
console.log('Détection d’erreurs OK');
