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

// ---------- Main filmée de biais (3D) ----------
// La main du schéma (plan z = 0) est tournée en 3D de ±35° autour des axes horizontal et vertical (en plus de la rotation
// dans l'image) ; l'image 2D est sa projection, et les points « monde » (worldLandmarks de MediaPipe : mètres, centrés sur
// la main, z moins précis) sont fournis au Tracker comme dans l'app ({ hand, hand3 }).
// Attendu : comptes exacts et pas plus de répétitions signalées à tort qu'avant, quelle que soit l'orientation.
const D2R = Math.PI / 180;
const { metric: metricFn, tiltCorrect } = await import('../www/js/pose.js');
function rot3(pt, yaw, pitch, roll) {
  let { x, y, z } = pt;
  [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
  return { x, y, z };
}
export function tilted(L, { yaw, pitch, roll = 0, sc = 1, mir = 1, noise = 0, noise3 = 0 }, gaussFn = () => 0) {
  const palm = Math.hypot(L[9].x - L[0].x, L[9].y - L[0].y) || 1, m = 0.095 / palm; // paume ≈ 9,5 cm
  const c = { x: (L[0].x + L[9].x) / 2, y: (L[0].y + L[9].y) / 2 };
  const R = L.map((p) => rot3({ x: (p.x - c.x) * mir, y: p.y - c.y, z: 0 }, yaw, pitch, roll));
  return {
    hand: R.map((p) => ({ x: (p.x + c.x) * sc + gaussFn() * noise, y: (p.y + c.y) * sc + gaussFn() * noise, z: p.z * sc })),
    hand3: R.map((p) => ({ x: p.x * m + gaussFn() * noise3, y: p.y * m + gaussFn() * noise3, z: p.z * m + gaussFn() * noise3 * 2 })),
  };
}
// Fraction du trajet du schéma qui donne exactement `share` × l'amplitude cible de l'exercice (main bien de face)
function fracFor(id, share) {
  const ex = EXERCISES[id], fig = ex.fig, spec = ex.track.planes.hand, fr = fig.frames, A = fr[0], B0 = id === 'thumb_opp' ? fr[1] : fr[fr.length - 1];
  const val = (prm) => metricFn(spec.metric, tilted(handLm(fig, prm), { yaw: 0, pitch: 0 }));
  const d = (f) => { let x = val(interpParams(A, B0, f)) - val(A); if (spec.angular) x = ((x + 540) % 360) - 180; return Math.abs(x) / Math.abs(spec.delta); };
  let lo = 0, hi = 1; if (d(1) <= share) return 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (d(m) < share) lo = m; else hi = m; }
  return hi;
}
// exact = true : le patient fait juste l'amplitude demandée (95–105 % de la cible), cas où une mesure faussée par
// l'orientation transforme une bonne répétition en « répétition incomplète »
function tiltSeries(use3d, romFactor = 0.85, exact = false) {
  seed = 11; let wrong = 0, bad = 0, tot = 0, minAmp = 9; const worst = {};
  for (const [id, ex] of Object.entries(EXERCISES)) {
    if (ex.track?.kind !== 'hand' || ex.track.mode !== 'reps') continue;
    for (let k = 0; k < 12; k++) {
      const fig = ex.fig, fr = fig.frames, A = fr[0], B0 = id === 'thumb_opp' ? fr[1] : fr[fr.length - 1];
      const amp = exact ? fracFor(id, U(0.95, 1.05)) : U(0.88, 1), B = interpParams(A, B0, amp);
      // k = 0…3 : orientations extrêmes (±35° sur les deux axes) ; ensuite tirées au hasard dans ±35°
      const ext = [[35, 35], [-35, 35], [35, -35], [-35, -35]][k];
      const o = { yaw: (ext ? ext[0] : U(-35, 35)) * D2R, pitch: (ext ? ext[1] : U(-35, 35)) * D2R, roll: U(-0.4, 0.4), sc: U(0.7, 1.3), mir: rnd() < 0.5 ? -1 : 1, noise: U(0.4, 1.0), noise3: U(0.0015, 0.003) };
      const tr = new Tracker(ex, 'hand', { romFactor });
      const spec = ex.track.planes.hand, hold = (spec.holdTop || 0) + U(0.3, 0.8);
      // 18 images/s : cadence d'analyse de la main dans l'app (train.js)
      let t = 0; const dt = 55, fps = 1000 / dt;
      const step = (prm) => { t += dt; const h = tilted(handLm(fig, prm), o, gauss); tr.update(use3d ? h : { hand: h.hand }, t); };
      for (let i = 0; i < 2.2 * fps; i++) step(A);
      for (let r = 0; r < 6; r++) {
        const up = U(0.8, 2) * fps, dn = (U(1, 3) + (spec.minRepSec || 0) * 0.67) * fps;
        for (let i = 0; i <= up; i++) step(interpParams(A, B, 0.5 - 0.5 * Math.cos(Math.PI * i / up)));
        for (let i = 0; i < hold * fps; i++) step(B);
        for (let i = 0; i <= dn; i++) step(interpParams(B, A, 0.5 - 0.5 * Math.cos(Math.PI * i / dn)));
        for (let i = 0; i < U(0.4, 1) * fps; i++) step(A);
      }
      const nb = tr.repLog.filter((r) => !r.full || r.faults.length).length;
      if (tr.reps !== 6) { wrong++; worst[id] = `${worst[id] || ''} ${tr.reps}`; }
      tot += tr.reps; bad += nb;
      if (nb) worst[id] = `${worst[id] || ''} (${nb} signalées)`;
    }
  }
  return { wrong, bad, tot, worst };
}
const t2 = tiltSeries(false), t3 = tiltSeries(true);
console.log(`Main de biais ±35°, 2D seule (avant) : séries mal comptées ${t2.wrong}, répétitions signalées à tort ${t2.bad}/${t2.tot}`, t2.worst);
console.log(`Main de biais ±35°, avec points 3D   : séries mal comptées ${t3.wrong}, répétitions signalées à tort ${t3.bad}/${t3.tot}`, t3.worst);
if (t3.wrong || t3.bad > t3.tot * 0.05) process.exit(1);
// Patient qui fait juste l'amplitude demandée, niveau le plus exigeant (cible entière)
const f2 = tiltSeries(false, 1, true), f3 = tiltSeries(true, 1, true);
console.log(`Amplitude juste (95–105 % de la cible), main de biais : 2D seule ${f2.bad}/${f2.tot} signalées à tort, ${f2.wrong} séries mal comptées`, f2.worst);
console.log(`                                                       avec 3D  ${f3.bad}/${f3.tot} signalées à tort, ${f3.wrong} séries mal comptées`, f3.worst);
if (f3.wrong || f3.bad > f3.tot * 0.05) process.exit(1);

// Invariance pure : les mesures 3D des doigts / du pouce ne changent pas quand on tourne la main (sans bruit)
{
  const metric = metricFn;
  let maxRel = 0;
  for (const [id, name] of [['grip_putty', 'hClose'], ['thumb_opp', 'hPinch'], ['thumb_cmc', 'hThumbAbd']]) {
    const fig = EXERCISES[id].fig;
    for (const prm of [fig.frames[0], fig.frames[1], interpParams(fig.frames[0], fig.frames[1], 0.5)]) {
      const L = handLm(fig, prm);
      const ref = metric(name, tilted(L, { yaw: 0, pitch: 0 }));
      for (const [yw, pt] of [[35, 0], [0, 35], [-35, 35], [35, -35], [20, -30]]) {
        const v = metric(name, tilted(L, { yaw: yw * D2R, pitch: pt * D2R, roll: 0.3, sc: 1.2 }));
        maxRel = Math.max(maxRel, Math.abs(v - ref) / (Math.abs(ref) || 1));
      }
    }
  }
  console.log(`Invariance 3D (poing, opposition, ouverture du pouce) : écart max ${(maxRel * 100).toFixed(3)} %`);
  if (maxRel > 1e-6) process.exit(1);
}
