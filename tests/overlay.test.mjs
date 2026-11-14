// Projection vidéo → canevas (cover / contain, miroir, DPR, portrait / paysage), filtre One Euro, garde-fou de sujet,
// cadence d'analyse et choix de la main suivie.
import { canvasSize, fitRect, toCanvas, fromCanvas, projectLandmarks, OneEuro, LandmarkSmoother, SubjectGuard, Pacer } from '../www/js/overlay.js';
import { pickHand, parseHands, HandSideVote, handInFrame } from '../www/js/hand.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// --- Référence indépendante : où le navigateur affiche-t-il un pixel de la vidéo ? (définition CSS de object-fit) ---
function cssRef(pt, vw, vh, W, H, fit, mirror) {
  const boxR = W / H, vidR = vw / vh;
  let dw, dh; // taille de l'image affichée
  if ((fit === 'cover') === (vidR > boxR)) { dh = H; dw = H * vidR; } else { dw = W; dh = W / vidR; }
  let x = (W - dw) / 2 + pt.x * dw; const y = (H - dh) / 2 + pt.y * dh;
  if (mirror) x = W - x; // transform: scaleX(-1) autour du centre de la boîte
  return { x, y };
}
const videos = [[960, 720], [720, 960], [1280, 720], [480, 640], [640, 480], [1080, 1920]];
const boxes = [[412, 780], [915, 300], [360, 640], [800, 600], [1024, 1366], [393, 700.5]];
const dprs = [1, 1.5, 2, 2.625, 3];
const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0.73, y: 0.11 }];
let n = 0, maxErr = 0;
for (const [vw, vh] of videos) for (const [cw, ch] of boxes) for (const dpr of dprs) for (const fit of ['cover', 'contain']) for (const mirror of [false, true]) {
  const { W, H, k } = canvasSize(cw, ch, dpr);
  ok(k <= 2 && k >= 1, 'DPR plafonné à 2');
  ok(Math.abs(W - cw * k) <= 0.5 && Math.abs(H - ch * k) <= 0.5, 'taille du canevas = boîte × DPR');
  for (const pt of pts) {
    const a = toCanvas(pt, vw, vh, W, H, { fit, mirror });
    // position CSS attendue (en pixels CSS) × échelle réelle du canevas (étiré « fill » sur sa boîte)
    const r = cssRef(pt, vw, vh, cw, ch, fit, mirror);
    const ex = Math.abs(a.x / (W / cw) - r.x), ey = Math.abs(a.y / (H / ch) - r.y);
    maxErr = Math.max(maxErr, ex / cw, ey / cw); n++;
    // aller-retour
    const back = fromCanvas(a, vw, vh, W, H, { fit, mirror });
    ok(near(back.x, pt.x, 1e-9) && near(back.y, pt.y, 1e-9), 'aller-retour canevas → image');
    // projectLandmarks (sans miroir : appliqué au dessin par (1 − x)) donne le même pixel
    const [pl] = projectLandmarks([{ ...pt, visibility: 0.9 }], vw, vh, W, H, fit);
    const px = mirror ? (1 - pl.x) * W : pl.x * W;
    ok(near(px, a.x, 1e-6) && near(pl.y * H, a.y, 1e-6) && pl.visibility === 0.9, 'projectLandmarks cohérent avec toCanvas');
  }
}
ok(maxErr < 0.002, `projection : écart max ${(maxErr * 100).toFixed(3)} % de la largeur (attendu < 0,2 %)`);
console.log(`Projection vidéo → canevas : ${n} cas (cover/contain × miroir × DPR × portrait/paysage), écart max ${(maxErr * 100).toFixed(4)} % de la largeur`);

// cover : l'image remplit toute la boîte ; contain : entièrement visible
{
  const c = fitRect(960, 720, 400, 800, 'cover'), k = fitRect(960, 720, 400, 800, 'contain');
  ok(c.ox <= 0 && c.oy <= 0 && c.w >= 400 && c.h >= 800 && near(c.h, 800), 'cover remplit');
  ok(k.ox >= 0 && k.oy >= 0 && near(k.w, 400) && k.h <= 800, 'contain entier');
  ok(near(toCanvas({ x: 0.5, y: 0.5 }, 960, 720, 400, 800, { mirror: true }).x, 200), 'centre inchangé par le miroir');
  ok(toCanvas({ x: 0.6, y: 0.5 }, 960, 720, 400, 800).x > 200 && toCanvas({ x: 0.6, y: 0.5 }, 960, 720, 400, 800, { mirror: true }).x < 200, 'miroir : droite ↔ gauche');
}

// --- One Euro : au repos le tremblement est réduit ; en mouvement le retard reste faible ---
{
  let seed = 3; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / 0.707; };
  const f = new OneEuro(); let t = 0; const raw = [], out = [];
  for (let i = 0; i < 200; i++) { t += 55; const v = 0.5 + gauss() * 0.003; raw.push(v); out.push(f.filter(v, t)); }
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const gain = sd(out.slice(20)) / sd(raw.slice(20));
  ok(gain < 0.6, `One Euro : tremblement au repos × ${gain.toFixed(2)} (attendu < 0,6)`);
  // doigt qui traverse 40 % de l'image en 0,5 s : retard d'affichage < 1,5 % de la largeur
  const f2 = new OneEuro(); t = 0; let lag = 0;
  for (let i = 0; i < 40; i++) { t += 55; const x = 0.3 + Math.min(1, Math.max(0, (i - 10) / 9)) * 0.4; const y = f2.filter(x, t); if (i > 10) lag = Math.max(lag, Math.abs(x - y)); }
  ok(lag < 0.015, `One Euro : retard max en mouvement ${(lag * 100).toFixed(2)} % (attendu < 1,5 %)`);
  console.log(`One Euro : tremblement au repos × ${gain.toFixed(2)}, retard max en mouvement rapide ${(lag * 100).toFixed(2)} % de la largeur`);
  // lissage d'affichage : jamais plus de 0,4 % d'écart avec le point détecté, même à 4 analyses / s et en mouvement rapide
  for (const dtm of [55, 125, 240]) {
    const s2 = new LandmarkSmoother(); let tt = 0, worst = 0;
    for (let i = 0; i < 60; i++) { tt += dtm; const x = 0.5 + 0.3 * Math.sin(tt / 320) + gauss() * 0.002; const [q] = s2.apply([{ x, y: 0.5 }], tt); worst = Math.max(worst, Math.abs(q.x - x)); }
    ok(worst <= 0.004 + 1e-9, `lissage : écart max ${(worst * 100).toFixed(2)} % à ${dtm} ms par analyse`);
  }
  const sm = new LandmarkSmoother(); const a = sm.apply([{ x: 0.1, y: 0.2, visibility: 0.7 }], 100);
  ok(a[0].x === 0.1 && a[0].visibility === 0.7 && sm.apply(null, 200) === null, 'LandmarkSmoother conserve les champs');
}

// --- Garde-fou : une autre personne détectée d'un coup ailleurs → on garde le patient (700 ms au plus) ---
{
  const body = (cx, cy, s) => { const lm = []; lm[11] = { x: cx - s / 4, y: cy - s / 2 }; lm[12] = { x: cx + s / 4, y: cy - s / 2 }; lm[23] = { x: cx - s / 5, y: cy + s / 2 }; lm[24] = { x: cx + s / 5, y: cy + s / 2 }; return lm; };
  const gd = new SubjectGuard(); let t = 0;
  for (let i = 0; i < 20; i++) { t += 40; const r = gd.check(body(0.4 + i * 0.002, 0.5, 0.3), t, 0.75); ok(!r.jumped, 'déplacement normal accepté'); }
  const patient = gd.prev.lm;
  let held = 0;
  for (let i = 0; i < 10; i++) { t += 40; const r = gd.check(body(0.85, 0.45, 0.2), t, 0.75); if (r.jumped) { held++; ok(r.lm === patient, 'squelette du patient conservé'); } }
  ok(held === 10, `saut vers une autre personne ignoré (${held}/10 images)`);
  t += 40; ok(!gd.check(body(0.44, 0.5, 0.3), t, 0.75).jumped, 'retour au patient');
  // le patient s'est vraiment déplacé : accepté après 700 ms
  let acc = 0; for (let i = 0; i < 30; i++) { t += 40; if (!gd.check(body(0.9, 0.5, 0.3), t, 0.75).jumped) acc++; }
  ok(acc >= 10 && acc <= 14, `déplacement réel accepté après ~0,7 s (${acc}/30)`);
  ok(gd.check(null, t + 40).lm === null, 'personne : rien');
}

// --- Cadence : 18 analyses / s au plus ; analyse lente (80 ms) → ≤ 75 % du temps ---
{
  const run = (hz, cost) => { const p = new Pacer(hz); let nb = 0, busy = 0; for (let t = 0; t < 10000; t += 16.7) { if (t < busy) continue; if (p.due(t)) { p.done(t, t + cost); busy = t + cost; nb++; } } return nb / 10; };
  const a = run(18, 20), b = run(18, 80), c = run(25, 12);
  ok(a >= 14 && a <= 20.5, `main : ${a} analyses/s`); ok(b <= 10.5 && b >= 7, `téléphone lent : ${b}/s`); ok(c >= 19 && c <= 30.5, `corps : ${c}/s`);
  console.log(`Cadence d'analyse : main ${a}/s (20 ms), main sur téléphone lent ${b}/s (80 ms), corps ${c}/s (12 ms)`);
}

// --- Main suivie : étiquette non inversée, côté travaillé, continuité, vote « mauvaise main » ---
{
  const mk = (x, size, label, score = 0.95) => { const lm = Array.from({ length: 21 }, () => ({ x, y: 0.5 })); lm[9] = { x, y: 0.5 - size }; return { lm, label, score }; };
  const res = { landmarks: [mk(0.3, 0.2).lm], worldLandmarks: [Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))], handedness: [[{ categoryName: 'Right', score: 0.9 }]] };
  const ph = parseHands(res);
  ok(ph[0].label === 'R' && ph[0].world?.length === 21 && ph[0].score === 0.9, 'parseHands : « Right » = main droite (image non retournée), points 3D transmis');
  ok(parseHands({ landmarks: [res.landmarks[0]], handedness: [[{ categoryName: 'Left', score: 0.8 }]] })[0].world === null, 'parseHands sans points 3D');
  const R = mk(0.3, 0.15, 'R'), L = mk(0.7, 0.25, 'L');
  ok(pickHand([R, L], 'R') === R, 'côté travaillé choisi même si l’autre main est plus grande');
  ok(pickHand([R, L], null) === L, 'sans côté : la plus grande');
  ok(pickHand([mk(0.3, 0.15, 'R', 0.55), L], 'R') === L, 'étiquette peu sûre : la plus grande');
  // continuité : l'étiquette de la main suivie hésite une image → on garde la même main
  const Rflip = mk(0.31, 0.15, 'L', 0.6);
  ok(pickHand([Rflip, mk(0.7, 0.25, 'L')], 'R', R) === Rflip, 'continuité : même main malgré une étiquette qui hésite');
  ok(pickHand([mk(0.31, 0.15, 'L'), mk(0.7, 0.25, 'R')], 'R', R).label === 'R', 'la bonne main apparaît : on la prend');
  ok(pickHand([], 'R', R) === null, 'aucune main');
  const v = new HandSideVote(); let w = false;
  for (let i = 0; i < 5; i++) w = v.push(mk(0.3, 0.2, 'L', 0.97), 'R'); ok(!w && !v.ready, 'vote : pas avant 6 images');
  w = v.push(mk(0.3, 0.2, 'L', 0.97), 'R'); ok(w && v.ready, 'vote : mauvaise main sûre');
  for (let i = 0; i < 2; i++) w = v.push(mk(0.3, 0.2, 'R', 0.97), 'R'); ok(!w, 'vote : la bonne main revient → on compte');
  const v2 = new HandSideVote(); for (let i = 0; i < 20; i++) w = v2.push(mk(0.3, 0.2, 'L', 0.7), 'R'); ok(!w, 'vote : étiquette peu sûre → pas de blocage');
  const lm = mk(0.5, 0.2).lm; ok(handInFrame(lm) && !handInFrame(mk(1.02, 0.2).lm) && handInFrame(mk(1.02, 0.2).lm, 0.04), 'handInFrame + tolérance');
}

console.log(fails ? `Superposition : ${fails} échec(s)` : 'Superposition : projection, lissage, garde-fou, cadence et main suivie OK');
if (fails) process.exit(1);
