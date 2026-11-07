// « Patients simulés » : chaque exercice filmé est exécuté CORRECTEMENT par des patients différents
// (taille du corps, côté face à la caméra, téléphone un peu tourné ou penché, amplitude 85–100 %, rythme variable,
// bras ou jambes non concernés placés autrement que sur la démonstration, tremblement des points MediaPipe).
// On vérifie que le compte est exact et que l'app ne signale presque jamais une « mauvaise répétition » à tort.
// Puis on vérifie qu'elle détecte toujours les vrais mauvais mouvements.
import { pose, interpParams } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
import { Tracker, toPx } from '../www/js/pose.js';
import { MoveMatcher } from '../www/js/movematch.js';

// Générateur pseudo-aléatoire reproductible
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const U = (a, b) => a + (b - a) * rnd();
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3; };

const ARM = /^(uarm|farm|shAbd|elbow(R|L)|farmScale)/;
const LEG = /^(thigh|shank|foot|hipAbd|knee|lift|ankle|ts|ss)/;
function lmFrom(fig, prm, cam) {
  const j = pose(fig, prm), L = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const cx = 120, cy = 120, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  const set = (i, p, dx = 0, dy = 0) => {
    let x = (p[0] + dx - cx) * cam.sx * (cam.mirror ? -1 : 1), y = (p[1] + dy - cy) * cam.sy;
    const X = x * cr - y * sr, Y = x * sr + y * cr;
    L[i] = { x: (cx + X) / 240 + gauss() * cam.noise, y: (cy + Y) / 200 + gauss() * cam.noise, visibility: 0.95 };
  };
  if ((fig.view || 'side') === 'side') {
    set(0, j.head, 8, 0); set(7, j.head, -2, 0); set(8, j.head, -1, 0);
    set(11, j.shoulder); set(12, j.shoulder, 1, 0); set(13, j.elbow); set(14, j.elbow2); set(15, j.wrist); set(16, j.wrist2);
    set(23, j.pelvis); set(24, j.pelvis, 1, 0); set(25, j.knee); set(26, j.knee2); set(27, j.ankle); set(28, j.ankle2);
    set(29, j.ankle, -4, 3); set(30, j.ankle2, -4, 3); set(31, j.toe); set(32, j.toe2);
    // le côté loin de la caméra est moins visible
    for (const i of [12, 14, 16, 24, 26, 28, 30, 32]) L[i].visibility = 0.8;
  } else {
    set(0, j.head, (j.headRot || 0) * 6, 1); set(7, j.head, 6, 0); set(8, j.head, -6, 0);
    set(11, j.shL); set(12, j.shR); set(13, j.elbowL); set(14, j.elbowR); set(15, j.wristL); set(16, j.wristR);
    set(23, j.hipL); set(24, j.hipR); set(25, j.kneeL); set(26, j.kneeR); set(27, j.ankleL); set(28, j.ankleR);
    set(29, j.ankleL, 0, 3); set(30, j.ankleR, 0, 3); set(31, j.ankleL, 2, 6); set(32, j.ankleR, -2, 6);
  }
  return L;
}

// Un patient : variations de posture sur les articulations qui ne bougent pas dans l'exercice
function patient(fig) {
  // images de départ / d'arrivée complètes (valeurs par défaut du schéma comprises)
  const f1 = fig.frames[1] || fig.frames[0];
  const A = interpParams(fig.frames[0], f1, 0), B = interpParams(fig.frames[0], f1, 1);
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  const moving = [...keys].filter((k) => typeof (B[k] ?? A[k]) === 'number' && Math.abs((B[k] ?? 0) - (A[k] ?? 0)) > 1e-6);
  const armsMove = moving.some((k) => ARM.test(k)), legsMove = moving.some((k) => LEG.test(k));
  const off = {};
  const view = fig.view || 'side';
  const armKeys = view === 'front' ? ['shAbdR', 'shAbdL', 'elbowR', 'elbowL'] : ['uarm', 'farm', 'uarm2', 'farm2'];
  // bras non concernés : le long du corps, croisés, mains sur les hanches… (debout seulement)
  const standing = view === 'front' || Math.abs(((A.trunk ?? 0) + 540) % 360 - 180) < 30;
  if (!armsMove && standing) { const d = U(-25, 25); for (const k of armKeys) off[k] = d + U(-12, 12); }
  for (const k of keys) {
    if (moving.includes(k) || off[k] != null || typeof (A[k] ?? B[k]) !== 'number') continue;
    if (/Scale|^ts|^ss|^opp|^lift/.test(k)) continue;
    off[k] = LEG.test(k) && !legsMove ? U(-6, 6) : U(-7, 7);
  }
  off.trunk = (off.trunk || 0) + U(-5, 5);
  const add = (fr) => { const o = { ...fr }; for (const [k, d] of Object.entries(off)) o[k] = (fr[k] ?? pose.defaults?.[k] ?? 0) + d; return o; };
  // les paramètres absents des images prennent la valeur par défaut du schéma : on ne décale que ceux qui sont définis
  const addDefined = (fr) => { const o = { ...fr }; for (const [k, d] of Object.entries(off)) if (fr[k] != null || A[k] != null || B[k] != null) o[k] = (fr[k] ?? A[k] ?? B[k]) + d; return o; };
  return { A: addDefined(A), B: addDefined(B), moving, add };
}

function simulate(id, plane, { reps = 6, wrong = null } = {}) {
  const ex = EXERCISES[id], fig = wrong?.fig || ex.fig, spec = ex.track.planes[plane];
  const pt = patient(fig);
  const cam = { mirror: rnd() < 0.5, sx: U(0.86, 1), sy: U(0.94, 1.06), roll: U(-5, 5) * Math.PI / 180, noise: U(0.002, 0.005) * Number(process.env.NOISE || 1) };
  const romF = 0.85; // niveau 3
  const amp = U(0.88, 1.0); // amplitude du patient (fraction de la démonstration)
  const [ca, ho, ec] = String(ex.dose.tempo || '2-1-2').split('-').map(Number);
  const holdTop = Math.max(spec.holdTop || 0, ex.dose.holdTop || 0);
  const tr = new Tracker(ex, plane, { romFactor: romF });
  const mm = new MoveMatcher(ex);
  const fps = U(24, 30), dt = 1000 / fps;
  let t = 0, wrongMs = 0, flagged = 0, lastRepT = -1e9;
  const frame = (prm) => {
    t += dt;
    const p = toPx(lmFrom(fig, prm, cam), 240, 200);
    const before = tr.reps;
    tr.update(p, t);
    if (process.env.TR && id === process.env.TR) (globalThis.__T = globalThis.__T || []).push(`${(t / 1000).toFixed(2)} P=${tr.p.toFixed(2)} ${tr.state} r=${tr.reps}`);
    if (tr.calibrated && mm.usable) { const st = mm.update(p, t, { progressing: tr.state === 'moving' || t - lastRepT < 10000 }); if (st.status === 'wrong') wrongMs += dt; }
    // même règle que l'app : « mauvais mouvement » pendant ≥ 35 % de la répétition
    if (tr.reps > before) { lastRepT = t; const r = tr.repLog[tr.repLog.length - 1]; if (wrongMs >= 350 * r.dur) { tr.flagRep('wrongMove'); flagged++; } wrongMs = 0; }
  };
  const Bp = interpParams(pt.A, pt.B, amp);
  for (let i = 0; i < fps * 1.2; i++) frame(pt.A);
  if (ex.track.mode === 'hold') {
    for (let i = 0; i <= fps * 1.2; i++) frame(interpParams(pt.A, Bp, i / (fps * 1.2)));
    for (let i = 0; i < fps * 12; i++) frame(Bp);
    const s = tr.summary();
    return { id, plane, ok: s.holdSec >= 9, holdSec: s.holdSec, flagged: mm.usable && mm.wrongShare > 0.3 ? 1 : 0, wrongShare: mm.wrongShare };
  }
  for (let r = 0; r < reps; r++) {
    const up = Math.max(0.8, ca * U(0.7, 1.3)), top = Math.max(holdTop + U(0.3, 0.8), ho * U(0.6, 1.4), 0.15), down = Math.max(1, ec * U(0.7, 1.3)), rest = U(0.3, 1);
    const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
    for (let i = 0; i <= fps * up; i++) frame(interpParams(pt.A, Bp, ease(i / (fps * up))));
    for (let i = 0; i < fps * top; i++) frame(Bp);
    for (let i = 0; i <= fps * down; i++) frame(interpParams(Bp, pt.A, ease(i / (fps * down))));
    for (let i = 0; i < fps * rest; i++) frame(pt.A);
  }
  const s = tr.summary();
  if (process.env.TR === id) { if (s.reps !== 6) console.log(globalThis.__T.filter((x, i) => i % 3 === 0).join('\n')); globalThis.__T = []; }
  const bad = s.reps_detail.filter((r) => !r.full || r.faults.length);
  const why = {};
  for (const r of bad) { if (!r.full && !r.faults.includes('wrongMove')) why.depth = (why.depth || 0) + 1; for (const f of r.faults) why[f] = (why[f] || 0) + 1; }
  return { id, plane, reps: s.reps, bad: bad.length, flagged, why, log: process.env.V ? s.reps_detail.map((r) => `${r.peak}/${r.dur}s/${r.full ? 'ok' : 'part'}`).join(' ') : undefined, cam: `${cam.mirror ? 'G' : 'D'} sx${cam.sx.toFixed(2)} amp${amp.toFixed(2)}`, mmIssue: mm.state.issues?.[0] ? `${mm.state.issues[0].k}:${mm.state.issues[0].kind}` : '' };
}

const N = Number(process.env.N || 12);
const rows = [], detail = [];
let totalReps = 0, totalBad = 0, countErr = 0;
for (const [id, ex] of Object.entries(EXERCISES)) {
  if (!ex.track || ex.track.kind === 'hand' || (ex.fig.frames.length < 2 && ex.track.mode !== 'hold')) continue;
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) continue;
  const v = ex.fig.view || 'side', plane = v === 'front' ? 'front' : 'side';
  if (!ex.track.planes[plane]) continue;
  let reps = 0, bad = 0, cnt = 0, holdsOk = 0; const why = {};
  for (let k = 0; k < N; k++) {
    const r = simulate(id, plane);
    if (ex.track.mode === 'hold') { if (r.ok && !r.flagged) holdsOk++; else detail.push(r); continue; }
    reps += r.reps; bad += r.bad; if (r.reps !== 6) { cnt++; detail.push(r); } else if (r.bad) detail.push(r);
    for (const [w, n] of Object.entries(r.why)) why[w] = (why[w] || 0) + n;
  }
  if (ex.track.mode === 'hold') { rows.push({ id, plane, mode: 'maintien', ok: `${holdsOk}/${N}` }); if (holdsOk < N) countErr += N - holdsOk; continue; }
  totalReps += reps; totalBad += bad; countErr += cnt;
  rows.push({ id, plane, compte: cnt ? `${N - cnt}/${N} exact` : 'exact', 'faux « mauvais »': `${Math.round((bad / Math.max(1, reps)) * 100)} %`, causes: Object.entries(why).map(([k, n]) => `${k}×${n}`).join(' ') || '-' });
}
console.table(rows);
if (process.env.V) console.log(detail.slice(0, 40));
// Exercices guidés (miroir) : le contrôle « bon mouvement » ne doit pas crier au mauvais mouvement à tort
const guided = [];
for (const [id, ex] of Object.entries(EXERCISES)) {
  if (ex.track || ex.fig.frames.length < 2) continue;
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) continue;
  const mm0 = new MoveMatcher(ex); if (!mm0.usable) continue;
  let worst = 0;
  for (let k = 0; k < Math.max(4, N >> 1); k++) {
    const fig = ex.fig, pt = patient(fig), mm = new MoveMatcher(ex);
    const cam = { mirror: rnd() < 0.5, sx: U(0.86, 1), sy: U(0.94, 1.06), roll: U(-5, 5) * Math.PI / 180, noise: U(0.002, 0.005) };
    const amp = U(0.88, 1), Bp = interpParams(pt.A, pt.B, amp), fps = 28, dt = 1000 / fps; let t = 0;
    const holdTop = ex.dose.holdTop || 0;
    const fr = (prm) => { t += dt; mm.update(toPx(lmFrom(fig, prm, cam), 240, 200), t, { progressing: holdTop > 0 || ex.dose.type === 'hold' }); };
    for (let i = 0; i < fps; i++) fr(pt.A);
    for (let r = 0; r < 6; r++) {
      const up = U(1, 2.5), dn = U(1, 3);
      for (let i = 0; i <= fps * up; i++) fr(interpParams(pt.A, Bp, 0.5 - 0.5 * Math.cos(Math.PI * i / (fps * up))));
      for (let i = 0; i < fps * Math.max(0.3, holdTop); i++) fr(Bp);
      for (let i = 0; i <= fps * dn; i++) fr(interpParams(Bp, pt.A, 0.5 - 0.5 * Math.cos(Math.PI * i / (fps * dn))));
    }
    worst = Math.max(worst, mm.wrongShare);
  }
  guided.push({ id, 'pire « mauvais mouvement »': `${Math.round(worst * 100)} %` });
  if (worst > 0.1) countErr++;
}
console.table(guided);
const rate = totalBad / Math.max(1, totalReps);
console.log(`Répétitions correctes signalées à tort : ${(rate * 100).toFixed(1)} % (${totalBad}/${totalReps}) ; séries mal comptées : ${countErr}`);

// Vrais mauvais mouvements : toujours détectés
const F = (id, B) => ({ ...EXERCISES[id].fig, frames: [EXERCISES[id].fig.frames[0], { ...EXERCISES[id].fig.frames[1], ...B }] });
const wrongCases = [
  // squat le tronc penché à 70° → « tronc »
  ['squat', 'side', F('squat', { trunk: 72 }), (r) => r.why.trunk],
  // flexion du coude en levant tout le bras (épaule qui balance) → mauvais mouvement
  ['elbow_curl', 'side', F('elbow_curl', { uarm: 95 }), (r) => r.flagged || r.why.elbowPin || r.reps === 0],
  // montée sur pointes en pliant les genoux → « genoux tendus »
  ['heel_raise', 'side', F('heel_raise', { thigh: 160, shank: 205, thigh2: 160, shank2: 205 }), (r) => r.why.kneeStraight || r.flagged],
  // pont fessier : seulement les bras bougent → aucune répétition comptée
  ['glute_bridge', 'side', { ...EXERCISES.glute_bridge.fig, frames: [EXERCISES.glute_bridge.fig.frames[0], { ...EXERCISES.glute_bridge.fig.frames[0], uarm: 0, farm: 0 }] }, (r) => r.reps === 0],
];
let missed = 0;
for (const [id, plane, fig, hit] of wrongCases) {
  let det = 0;
  for (let k = 0; k < 6; k++) { const r = simulate(id, plane, { wrong: { fig } }); if (hit(r)) det++; }
  console.log(`Mauvais mouvement « ${id} » détecté : ${det}/6`);
  if (det < 5) missed++;
}
if (rate > 0.08 || countErr > 0 || missed) { console.log('ÉCHEC'); process.exit(1); }
console.log('Patients simulés : OK');
