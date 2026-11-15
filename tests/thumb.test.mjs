// Opposition du pouce : compte des contacts pouce–doigt.
//  1. Vraie main (tests/fixtures/thumb_opp_real.json) : points du vrai modèle sur l'enregistrement d'un patient pour qui
//     l'app ne comptait que 2 contacts sur 7 (le compteur attendait un retour complet à la position de départ).
//     Le suivi est rejoué comme dans train.js (main suivie, vote gauche / droite, images hors cadre ignorées).
//  2. Cas fabriqués : réouverture partielle, contact maintenu, poing fermé, tremblement, départ pendant un contact.
//   MOBILIS_WWW=/autre/www : tester une autre copie de l'app
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW = pathToFileURL(path.resolve(process.env.MOBILIS_WWW || path.join(HERE, '../www'))).href;
const { Tracker } = await import(`${WWW}/js/pose.js`);
const { pickHand, handPx, handInFrame, HandSideVote } = await import(`${WWW}/js/hand.js`);
const { EXERCISES } = await import(`${WWW}/js/data/exercises.js`);

const bad = [];
const check = (ok, what, info = '') => { console.log(`${ok ? '  ok ' : ' ÉCHEC'}  ${what}${info ? ' — ' + info : ''}`); if (!ok) bad.push(what); };

// ---------- 1. Vraie main ----------
const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/thumb_opp_real.json'), 'utf8'));
const hands = FX.frames.map(([t, label, score, lm, world]) => ({ t, hand: lm ? {
  label, score: score / 100,
  lm: Array.from({ length: 21 }, (_, i) => ({ x: lm[2 * i] / 1000, y: lm[2 * i + 1] / 1000, z: 0 })),
  world: Array.from({ length: 21 }, (_, i) => ({ x: world[3 * i] / 1e4, y: world[3 * i + 1] / 1e4, z: world[3 * i + 2] / 1e4 })),
} : null }));
/** Rejoue l'enregistrement comme la boucle de train.js. `every` : 1 = 15 analyses/s, 2 = 7,5/s (téléphone lent) ; `use3d` : points 3D transmis. */
function replay({ side = null, every = 1, use3d = true, from = 0 } = {}) {
  const times = [], tr = new Tracker(EXERCISES.thumb_opp, 'hand', { side, onRep: () => times.push(now / 1000) });
  const vote = new HandSideVote(); let prev = null, now = 0, wrongMs = 0, wrongT = 0;
  hands.forEach((f, i) => {
    if (i % every || f.t < from) return;
    now = f.t;
    const hd = pickHand(f.hand ? [f.hand] : [], side, prev); prev = hd;
    if (!hd) return;
    const wrong = !tr.calibrated && vote.push(hd, side);
    if (side && hd.label && !tr.calibrated && !vote.ready) return;
    if (wrong && wrongMs < 6000) { wrongMs += Math.min(200, now - (wrongT || now)); wrongT = now; return; }
    wrongT = 0;
    if (!handInFrame(hd.lm, 0.04)) return;
    tr.update({ hand: handPx(hd.lm, FX.w, FX.h), hand3: use3d ? hd.world : undefined }, now);
  });
  return { reps: tr.reps, times };
}
const TRUTH = FX.contacts.length; // 7 oppositions réelles (11–24 s), après 7 poings fermés (0–10,3 s) qui ne comptent pas
console.log(`Opposition du pouce — vraie main (${hands.length} images, ${TRUTH} contacts réels)`);
for (const side of [null, 'L', 'R']) for (const every of [1, 2]) for (const use3d of [true, false]) {
  const r = replay({ side, every, use3d });
  const fists = r.times.filter((t) => t < 10.5).length;
  // chaque répétition comptée correspond à un contact réel distinct (comptée à la réouverture : 0,3 à 2 s après le contact)
  const matched = new Set(r.times.filter((t) => t >= 10.5).map((t) => FX.contacts.findIndex((c) => t - c > 0.2 && t - c < 2.2)));
  const label = `côté ${side || 'auto'}, ${every === 1 ? '15' : '7,5'} analyses/s, ${use3d ? '3D' : '2D'}`;
  check(Math.abs(r.reps - TRUTH) <= 1 && fists === 0 && !matched.has(-1) && matched.size === r.reps, label, `${r.reps}/${TRUTH} (${r.times.map((t) => t.toFixed(1)).join(' ')})`);
}
// série lancée en cours d'exercice (le « zéro » ne peut pas être pris sur une main bien ouverte et immobile)
for (const from of [11400, 13200]) {
  const r = replay({ from }), expect = FX.contacts.filter((c) => c * 1000 > from + 1500).length;
  check(r.reps >= expect - 1 && r.reps <= expect + 1, `départ à ${(from / 1000).toFixed(1)} s, pendant un contact`, `${r.reps} (attendu ${expect} ± 1)`);
}

// ---------- 2. Cas fabriqués ----------
// Main minimale : poignet, tête du 3e métacarpien (paume = 1), bouts des doigts à la distance `open` du poignet, bout du pouce
// à la distance `pinch` de l'index. Seuls ces points servent aux mesures hPinch / hClose.
function hand(pinch, open, noise = 0) {
  const h = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const n = () => (noise ? (rnd() - 0.5) * 2 * noise : 0);
  h[9] = { x: 0, y: -100 };
  [8, 12, 16, 20].forEach((k, i) => { const x = -30 + 20 * i; h[k] = { x: x + n(), y: -Math.sqrt(Math.max(0, (open * 100) ** 2 - x * x)) + n() }; });
  h[4] = { x: h[8].x - pinch * 100 + n(), y: h[8].y + n() };
  return h;
}
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
/** segs : [durée s, pincement, ouverture] ; passage linéaire d'une étape à la suivante en `ramp` s. */
function synth(id, segs, { hz = 15, noise = 0, ramp = 0.25 } = {}) {
  const tr = new Tracker(EXERCISES[id], 'hand'); let t = 0, cur = segs[0];
  for (const sg of segs) {
    const n = Math.round(sg[0] * hz), nr = Math.max(1, Math.round(ramp * hz));
    for (let i = 0; i < n; i++) { t += 1000 / hz; const k = Math.min(1, (i + 1) / nr); tr.update({ hand: hand(cur[1] + (sg[1] - cur[1]) * k, cur[2] + (sg[2] - cur[2]) * k, noise) }, t); }
    cur = sg;
  }
  return tr;
}
const OPEN = [1.5, 1.1, 1.75], rep = (n, ...cycle) => Array.from({ length: n }, () => cycle).flat();
console.log('Opposition du pouce — cas fabriqués');
for (const hz of [9, 15, 30]) {
  let tr = synth('thumb_opp', [OPEN, ...rep(8, [0.5, 0.12, 1.5], [0.5, 0.75, 1.7])], { hz, noise: 0.02 });
  check(tr.reps === 8, `8 contacts, un par seconde, main à demi rouverte entre deux (${hz}/s)`, `${tr.reps}`);
  tr = synth('thumb_opp', [OPEN, ...rep(8, [0.45, 0.12, 1.5], [0.45, 1.0, 1.75])], { hz, noise: 0.02 });
  check(tr.reps === 8, `8 contacts rapides, main rouverte un peu moins qu'au départ (${hz}/s)`, `${tr.reps}`);
  tr = synth('thumb_opp', [OPEN, [6, 0.12, 1.5], [2, 1.1, 1.75]], { hz, noise: 0.03 });
  check(tr.reps === 1, `contact maintenu 6 s = 1 répétition (${hz}/s)`, `${tr.reps}`);
  tr = synth('thumb_opp', [OPEN, [1, 0.12, 1.5], [2.5, 0.7, 1.7], [2, 1.1, 1.75]], { hz, noise: 0.02 });
  check(tr.reps === 1, `réouverture en deux temps = 1 répétition (${hz}/s)`, `${tr.reps}`);
  tr = synth('thumb_opp', [OPEN, ...rep(6, [0.7, 0.3, 0.8], [0.7, 0.95, 1.7])], { hz, noise: 0.02 });
  check(tr.reps === 0, `6 poings fermés = 0 (${hz}/s)`, `${tr.reps}`);
  tr = synth('thumb_opp', [OPEN, [8, 1.05, 1.72]], { hz, noise: 0.1 });
  check(tr.reps === 0, `main ouverte qui tremble = 0 (${hz}/s)`, `${tr.reps}`);
  tr = synth('thumb_opp', [[1.5, 0.12, 1.5], ...rep(8, [0.5, 1.05, 1.75], [0.5, 0.12, 1.5]), [1, 1.05, 1.75]], { hz, noise: 0.02 });
  check(tr.reps >= 5 && tr.reps <= 8, `« zéro » pris pendant un contact : le compte reprend (${hz}/s)`, `${tr.reps}/8`);
  tr = synth('thumb_opp', [[2, 0.3, 0.8], OPEN, ...rep(5, [0.6, 0.12, 1.5], [0.6, 1.05, 1.75])], { hz, noise: 0.02 });
  check(tr.reps === 5, `départ poing fermé, puis 5 contacts (${hz}/s)`, `${tr.reps}`);
  // poing à la pâte (hClose, tenue 3 s) : relâchement incomplet entre deux serrages
  tr = synth('grip_putty', [OPEN, ...rep(5, [3.6, 0.4, 1.0], [1.2, 0.9, 1.5])], { hz, noise: 0.02, ramp: 0.5 });
  check(tr.reps === 5, `pâte : 5 serrages tenus, main à demi relâchée entre deux (${hz}/s)`, `${tr.reps} (${tr.full} complets)`);
}
console.log(bad.length ? `Opposition du pouce : ${bad.length} cas à revoir` : 'Opposition du pouce : OK');
if (bad.length) process.exit(1);
