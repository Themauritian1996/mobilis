// Mesure d'amplitude : calculs d'angle sur des points synthétiques (angles connus, miroir, côtés), détecteur de maintien,
// confiance, échéances, évolution, résumé, crochets de l'éditeur. Aucun navigateur requis.
import { START, TESTS, TEST_IDS, measure, facing, planeRatio, jointIdx, angleBetween, SUGGESTED } from '../www/js/data/romtests.js';
import fs from 'node:fs';
import { getLang, t as tt } from '../www/js/i18n.js';
import { sideBig, orientation, orientText, sampleOf, checkStart, nearSide, StartGate, startCue, Voicer, SIDE_COLOR, segmentAngle, startInstr, goInstr, HoldDetector, findHold, bestTrial, confidence, planeScore, due, trend, summaryPart, planItems, rxExtrasRom, rxSectionRom, suggestFor, homeCardRom, clinicPanelRom, romChartSvg, seriesOf, fmtVal, fmtGain, romHash } from '../www/js/rom.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ÉCHEC', m); } else console.log('  ok ', m); };
const near = (a, b, tol, m) => { const good = Number.isFinite(a) && Math.abs(a - b) <= tol; if (!good) { fails++; console.log('  ÉCHEC', m, '— obtenu', a, 'attendu', b, '±', tol); } else console.log('  ok ', m, `(${a.toFixed(1)})`); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('  ÉCHEC', m, '— obtenu', JSON.stringify(a), 'attendu', JSON.stringify(b)); } else console.log('  ok ', m); };

const W = 720, H = 1280, rad = (d) => (d * Math.PI) / 180;
// Construit 33 points (px → normalisé) ; les points non définis sont invisibles. `pts` = { index: [x, y] } en pixels.
function lmOf(pts, v = 0.95) { const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 })); for (const [i, p] of Object.entries(pts)) lm[i] = { x: p[0] / W, y: p[1] / H, z: 0, visibility: v }; return lm; }
const F = (pts, extra = {}) => ({ lm: lmOf(pts), w: W, h: H, ...extra });
// point à l'angle a (degrés d'écran : 0 = droite, 90 = bas) et distance d du point c
const at = (c, a, d) => [c[0] + d * Math.cos(rad(a)), c[1] + d * Math.sin(rad(a))];
const mirrorX = (pts) => Object.fromEntries(Object.entries(pts).map(([i, p]) => [i, [W - p[0], p[1]]]));

console.log('Catalogue');
ok(TEST_IDS.length >= 13, `${TEST_IDS.length} tests`);
for (const id of TEST_IDS) {
  const T = TESTS[id];
  ok(T.id === id && T.name.fr && T.name.en && T.pos.fr && T.how.en && T.cam.fr && T.note.en && T.normal.src && typeof T.calc === 'function' && ['side', 'front'].includes(T.view) && T.region && T.joints.length, `${id} : champs complets`);
}
ok(['sh_flex', 'sh_abd', 'sh_er', 'el_flex', 'el_ext', 'wr_flex', 'wr_ext', 'hip_flex', 'kn_flex', 'kn_ext', 'an_df', 'cerv_rot', 'lumb_flex'].every((id) => TESTS[id]), 'tous les tests demandés');
eq(jointIdx('kn_flex', 'R'), [24, 26, 28], 'indices des articulations (côté D)');

// ---------- Flexion d'épaule (profil, patient tourné vers la droite de l'image) ----------
console.log('Épaule — flexion (profil)');
for (const [a, name] of [[0, '0°'], [45, '45°'], [90, '90°'], [135, '135°'], [170, '170°']]) {
  // tronc vertical : épaule (350, 400), hanche (350, 800) ; bras : part vers le bas (a = 0) et monte vers l'avant (droite)
  const sh = [350, 400], hip = [350, 800], el = at(sh, 90 - a, 250);
  const pts = { 0: [400, 300], 7: [340, 300], 11: sh, 23: hip, 13: el };
  const r = measure('sh_flex', F(pts), 'L');
  near(r.deg, a, 1, `flexion ${name}`);
  const m = measure('sh_flex', F(mirrorX(pts)), 'L'); // patient tourné vers la gauche de l'image
  near(m.deg, a, 1, `flexion ${name}, image miroir`);
}
near(measure('sh_flex', F({ 0: [400, 300], 7: [340, 300], 11: [350, 400], 23: [350, 800], 13: at([350, 400], 90 + 30, 250) }), 'L').deg, -30, 1, 'extension (bras en arrière) = négatif');
near(measure('sh_flex', F({ 0: [400, 300], 7: [340, 300], 12: [350, 400], 24: [350, 800], 14: at([350, 400], 0, 250) }), 'R').deg, 90, 1, 'côté R : lit les points 12 / 14 / 24');
// tronc penché : la référence est le tronc
{
  const sh = [350, 400], hip = at(sh, 90 + 20, 400), el = at(sh, 90 - 60 + 20, 250); // tronc incliné de 20° vers l'arrière, bras à 60° du tronc
  near(measure('sh_flex', F({ 0: [400, 300], 7: [340, 300], 11: sh, 23: hip, 13: el }), 'L').deg, 60, 1, 'flexion mesurée par rapport au tronc penché');
}
eq(measure('sh_flex', F({ 11: [350, 400], 23: [350, 800], 13: [450, 500] }), 'L'), null, 'sans orientation (nez / oreille / pied) : pas de mesure');
ok(measure('sh_flex', { lm: lmOf({ 0: [400, 300], 7: [340, 300], 11: [350, 400], 23: [350, 800] }), w: W, h: H }, 'L').vis === 0, 'coude non vu : visibilité 0 (la mesure sera ignorée)');
// visibilité
{
  const r = measure('sh_flex', { lm: lmOf({ 0: [400, 300], 7: [340, 300], 11: [350, 400], 23: [350, 800], 13: [450, 500] }, 0.7), w: W, h: H }, 'L');
  near(r.vis, 0.7, 0.001, 'vis = visibilité minimale des points utilisés');
}

// ---------- Abduction (face) ----------
console.log('Épaule — abduction (face)');
for (const a of [0, 45, 90, 135, 170]) {
  // patient de face : épaule gauche (11) à droite de l'image
  const shL = [450, 400], shR = [270, 400], hipL = [430, 800], hipR = [290, 800];
  // direction du tronc ≈ verticale ; bras gauche : vers le bas (a=0) puis vers l'extérieur (droite de l'image) puis le haut
  const elL = at(shL, 90 - a, 250);
  const pts = { 11: shL, 12: shR, 23: hipL, 24: hipR, 13: elL };
  near(measure('sh_abd', F({ ...pts, 13: elL }), 'L').deg, a + Math.atan2(20, 400) * 0 , 3, `abduction ${a}° côté L`);
  const elR = at(shR, 90 + a, 250);
  near(measure('sh_abd', F({ ...pts, 14: elR }), 'R').deg, a, 3, `abduction ${a}° côté R`);
  near(measure('sh_abd', F(mirrorX({ ...pts, 13: elL })), 'L').deg, a, 3, `abduction ${a}° côté L, miroir (épaule L à gauche de l'image)`);
}
near(measure('sh_abd', F({ 11: [450, 400], 12: [270, 400], 23: [430, 800], 24: [290, 800], 13: at([450, 400], 90 + 25, 250) }), 'L').deg, -25, 3, 'adduction (bras croisé vers le corps) = négatif');

// ---------- Rotation externe (face) ----------
console.log('Épaule — rotation externe (face, 2D)');
for (const a of [0, 30, 60]) {
  const shL = [450, 400], shR = [270, 400], elL = [470, 600], upper = Math.hypot(20, 200), fl = 0.79 * upper;
  const wr = [elL[0] + fl * Math.sin(rad(a)), 650];
  near(measure('sh_er', F({ 11: shL, 12: shR, 13: elL, 15: wr }), 'L').deg, a, 2, `RE ${a}° côté L`);
  const elR = [250, 600], wrR = [elR[0] - fl * Math.sin(rad(a)), 650];
  near(measure('sh_er', F({ 11: shL, 12: shR, 14: elR, 16: wrR }), 'R').deg, a, 2, `RE ${a}° côté R`);
}
near(measure('sh_er', F({ 11: [450, 400], 12: [270, 400], 13: [470, 600], 15: [400, 650] }), 'L').deg, -Math.asin(70 / (0.79 * Math.hypot(20, 200))) * 180 / Math.PI, 2, 'rotation interne = négatif');
{
  // 3D : worldLandmarks cohérents (RE 40°), patient de face (avant = −z)
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  world[11] = { x: 0.2, y: 0, z: 0 }; world[12] = { x: -0.2, y: 0, z: 0 }; world[13] = { x: 0.22, y: 0.3, z: 0 };
  const a = 40; world[15] = { x: 0.22 + 0.25 * Math.sin(rad(a)), y: 0.3, z: -0.25 * Math.cos(rad(a)) };
  const upper = Math.hypot(20, 200), fl = 0.79 * upper, wr = [470 + fl * Math.sin(rad(a)), 650];
  const r = measure('sh_er', F({ 11: [450, 400], 12: [270, 400], 13: [470, 600], 15: wr }, { world }), 'L');
  near(r.deg, a, 2, 'RE 2D + 3D concordants'); ok((r.q ?? 1) === 1, 'qualité pleine quand 2D et 3D concordent');
  world[15] = { x: 0.22 + 0.25 * Math.sin(rad(85)), y: 0.3, z: -0.25 * Math.cos(rad(85)) };
  const r2 = measure('sh_er', F({ 11: [450, 400], 12: [270, 400], 13: [470, 600], 15: wr }, { world }), 'L');
  ok(r2.q < 1 && Math.abs(r2.deg - a) <= 2, '2D / 3D divergents : on garde la 2D, qualité réduite');
}

// ---------- Coude, genou, hanche ----------
console.log('Coude / genou / hanche');
for (const f of [0, 45, 90, 135, 150]) {
  const sh = [350, 400], el = [350, 650], wr = at(el, 90 - f - 0, 200); // avant-bras : de 90 (vers le bas, tendu) vers le haut
  near(measure('el_flex', F({ 11: sh, 13: el, 15: wr }), 'L').deg, f, 1, `coude flexion ${f}°`);
  near(measure('el_ext', F({ 11: sh, 13: el, 15: wr }), 'L').deg, f, 1, `coude déficit d'extension ${f}°`);
  const hip = [350, 600], kn = [350, 950], an = at(kn, 90 + f, 300);
  near(measure('kn_flex', F({ 23: hip, 25: kn, 27: an }), 'L').deg, f, 1, `genou flexion ${f}°`);
  near(measure('kn_flex', F(mirrorX({ 23: hip, 25: kn, 27: an })), 'L').deg, f, 1, `genou flexion ${f}°, miroir`);
  near(measure('kn_ext', F({ 24: hip, 26: kn, 28: an }), 'R').deg, f, 1, `genou déficit ${f}°, côté R`);
}
for (const f of [0, 45, 90, 120, 170]) {
  const hip = [400, 700], sh = [150, 700]; // couché sur le dos, tête à gauche de l'image
  const kn = at(hip, 0 + f * 0 + (-f), 300); // jambe tendue vers la droite (0°) ; la flexion la remonte
  near(measure('hip_flex', F({ 11: sh, 23: hip, 25: kn }), 'L').deg, f, 1, `hanche flexion ${f}° (couché)`);
}

// ---------- Cheville ----------
console.log('Cheville (fente)');
for (const a of [0, 20, 40, 55]) {
  const an = [400, 1000], kn = [400 + 300 * Math.tan(rad(a)), 700];
  // pied vers la droite de l'image
  const pts = { 27: an, 25: kn, 29: [340, 1030], 31: [520, 1030] };
  near(measure('an_df', F(pts), 'L').deg, a, 1, `tibia ${a}° vers la droite`);
  near(measure('an_df', F(mirrorX(pts)), 'L').deg, a, 1, `tibia ${a}°, patient tourné vers la gauche`);
}
near(measure('an_df', F({ 27: [400, 1000], 25: [350, 700], 29: [340, 1030], 31: [520, 1030] }), 'L').deg, -Math.atan(50 / 300) * 180 / Math.PI, 1, 'genou en arrière de la cheville = négatif');

// ---------- Poignet ----------
console.log('Poignet');
for (const a of [0, 30, 60]) {
  // avant-bras horizontal vers la droite de l'image, paume vers le bas ; main relevée de a (extension)
  const el = [200, 700], wr = [500, 700];
  const up = at(wr, -a, 150), down = at(wr, a, 150);
  const mk = (h) => ({ 13: el, 15: wr, 19: [h[0], h[1] - 4], 17: [h[0], h[1] + 4] });
  near(measure('wr_ext', F(mk(up)), 'L').deg, a, 2, `extension ${a}° (pose seule)`);
  near(measure('wr_flex', F(mk(down)), 'L').deg, a, 2, `flexion ${a}° (pose seule)`);
  near(measure('wr_flex', F(mk(up)), 'L').deg, -a, 2, `flexion = −extension (${a}°)`);
  near(measure('wr_ext', F(mirrorX(mk(up))), 'L').deg, a, 2, `extension ${a}° miroir (avant-bras vers la gauche)`);
  // avec les points de la main (0 = poignet, 9 = base du majeur)
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })); hand[0] = { x: wr[0] / W, y: wr[1] / H, z: 0 }; hand[9] = { x: up[0] / W, y: up[1] / H, z: 0 };
  near(measure('wr_ext', F({ 13: el, 15: wr }, { hand: { lm: hand } }), 'L').deg, a, 2, `extension ${a}° avec les points de la main`);
}
{
  const hand = Array.from({ length: 21 }, () => ({ x: 0.9, y: 0.1, z: 0 }));
  ok(measure('wr_ext', F({ 13: [200, 700], 15: [500, 700] }, { hand: { lm: hand } }), 'L').vis < 0.5, 'main trop loin du poignet de la pose et repli invisible : visibilité basse');
}

// ---------- Rotation cervicale ----------
console.log('Rotation cervicale (face)');
for (const a of [0, 30, 60, 80]) {
  const shW = 300, cx = 360, off = 0.30 * shW * Math.sin(rad(a));
  const pts = { 0: [cx + off, 250], 7: [cx + 30, 250], 8: [cx - 30, 250], 11: [cx + shW / 2, 400], 12: [cx - shW / 2, 400] };
  const L = measure('cerv_rot', F(pts), 'L'), R = measure('cerv_rot', F(pts), 'R');
  near(L.deg, a, 1, `rotation à gauche ${a}°`); near(R.deg, -a, 1, `même visage vu comme rotation à droite = −${a}°`);
  near(measure('cerv_rot', F(mirrorX(pts)), 'R').deg, a, 1, `rotation à droite ${a}° (image miroir)`);
}
ok(TESTS.cerv_rot.maxConf <= 0.7 && TESTS.cerv_rot.lowConfidence, 'rotation cervicale : confiance plafonnée / signalée');

// ---------- Flexion lombaire ----------
console.log('Flexion lombaire (doigts–sol)');
{
  const hip = [400, 700], an = [400, 1100], heel = [370, 1120], ft = [480, 1120], leg = 400;
  for (const d of [0, 25, 60]) {
    const tipY = 1120 - (d / 100) * leg;
    near(measure('lumb_flex', F({ 23: hip, 27: an, 29: heel, 31: ft, 19: [500, tipY], 15: [480, tipY - 10] }), 'L').deg, d, 1, `doigts à ${d} % de la jambe du sol`);
  }
  near(measure('lumb_flex', F({ 23: hip, 27: an, 29: heel, 31: ft, 19: [500, 1160] }), 'L').deg, 0, 0.001, 'sous le sol : plancher à 0');
}

// ---------- Plan / confiance ----------
console.log('Confiance');
ok(confidence({ vis: 0.95, ratio: 0.1, view: 'side', sd: 0.5 }) >= 0.99, 'bonne mesure ≈ 1');
ok(confidence({ vis: 0.5, ratio: 0.1, view: 'side', sd: 0.5 }) < 0.5, 'visibilité 0,5 → refus');
ok(confidence({ vis: 0.95, ratio: 0.8, view: 'side', sd: 0.5 }) < 0.5, 'vue de face alors que le profil est demandé → refus');
ok(confidence({ vis: 0.95, ratio: 0.1, view: 'front', sd: 0.5 }) < 0.5, 'vue de profil alors que la face est demandée → refus');
ok(confidence({ vis: 0.95, ratio: 0.7, view: 'front', sd: 0.5 }) >= 0.99, 'face correcte');
ok(confidence({ vis: 0.95, ratio: 0.1, view: 'side', sd: 5 }) < confidence({ vis: 0.95, ratio: 0.1, view: 'side', sd: 0.5 }), 'tremblement → confiance plus basse');
near(confidence({ vis: 0.95, ratio: 0.7, view: 'front', sd: 0.5, maxConf: 0.7 }), 0.7, 0.001, 'plafond du test');
near(confidence({ vis: 0.95, ratio: 0.1, view: 'side', q: 0.7 }), 0.7, 0.001, 'facteur de qualité 2D/3D');
ok(planeScore('side', null) === 0.85, 'vue inconnue : 0,85');
{
  // rapport de vue calculé depuis des points
  const side = lmOf({ 11: [350, 400], 12: [360, 400], 23: [350, 800], 24: [360, 800] }), front = lmOf({ 11: [450, 400], 12: [270, 400], 23: [430, 800], 24: [290, 800] });
  ok(planeRatio(side, W, H) < 0.1 && planeRatio(front, W, H) > 0.4, 'planeRatio profil / face');
}

// ---------- Détecteur de maintien ----------
console.log('Détecteur de maintien');
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 - 0.5; };
// flux à 20 Hz : repos (start), montée linéaire (rise s), plateau (hold s) à `peak`, retour
function stream({ start = 5, peak = 100, rest = 1, rise = 1.5, hold = 2.2, back = 1.2, noise = 0, over = 0, vis = 0.9 } = {}) {
  const out = []; let t = 0; const dt = 50;
  const push = (deg) => { out.push({ t, deg: deg + noise * 2 * rnd(), vis }); t += dt; };
  for (let i = 0; i < rest * 20; i++) push(start);
  for (let i = 0; i < rise * 20; i++) push(start + ((peak + over - start) * (i + 1)) / (rise * 20));
  for (let i = 0; i < 0.4 * 20 && over; i++) push(peak + over * (1 - i / 8)); // dépassement bref
  for (let i = 0; i < hold * 20; i++) push(peak);
  for (let i = 0; i < back * 20; i++) push(peak - ((peak - start) * (i + 1)) / (back * 20));
  return out;
}
{
  const r = findHold(stream({ noise: 1 }), { minTravel: 25 });
  ok(r != null, 'maintien trouvé avec du bruit ± 1°'); near(r.deg, 100, 2, 'médiane du maintien');
  ok(r.t1 - r.t0 >= 1450, `fenêtre ≥ 1,5 s (${r.t1 - r.t0} ms)`);
}
{
  const r = findHold(stream({ over: 8, noise: 0.5 }), { minTravel: 25 });
  ok(r != null, 'dépassement de 8° puis stabilisation : maintien trouvé'); near(r.deg, 100, 2, 'la médiane ignore le pic de dépassement');
}
ok(findHold(stream({ hold: 0.8 }), { minTravel: 25 }) == null, 'maintien trop court (0,8 s) : rien');
{
  // mouvement continu sans arrêt : aller-retour sinusoïdal
  const s = []; for (let i = 0; i < 200; i++) s.push({ t: i * 50, deg: 50 + 50 * Math.sin(i / 12), vis: 0.9 });
  ok(findHold(s, { minTravel: 25 }) == null, 'mouvement continu : pas de maintien');
}
ok(findHold(stream({ peak: 12, start: 5 }), { minTravel: 25 }) == null, 'immobile près du départ (course < minTravel) : rien');
{
  const s = stream({ vis: 0.3 }); ok(findHold(s, { minTravel: 25 }) == null, 'visibilité trop basse : rien');
  const s2 = stream({ noise: 0.5, hold: 3.6 }); for (let i = 60; i < 75; i++) s2[i].vis = 0.2; // trou court dans le maintien (0,75 s) : la fenêtre est interrompue
  const r = findHold(s2, { minTravel: 25 }); ok(r != null && Math.abs(r.deg - 100) < 3, 'trous de visibilité : le maintien suivant est retrouvé');
}
{
  // deux essais : la détection se réarme au retour, le meilleur est gardé
  const a = stream({ peak: 90, noise: 0.5 }), b = stream({ peak: 105, noise: 0.5 }), end = a[a.length - 1].t;
  const all = [...a, ...b.map((x) => ({ ...x, t: x.t + end + 50 }))];
  const det = new HoldDetector({ minTravel: 25 }); let fired = 0; for (const x of all) if (det.push(x).state === 'fired') fired++;
  eq(fired, 2, 'deux essais détectés (réarmement au retour)');
  near(findHold(all, { minTravel: 25 }).deg, 105, 2, 'findHold garde le meilleur (le plus grand)');
  eq(bestTrial([{ deg: 90, conf: 0.9 }, { deg: 105, conf: 0.4 }, { deg: 100, conf: 0.8 }]), { deg: 100, conf: 0.8 }, 'bestTrial ignore la confiance < 0,5');
  eq(bestTrial([{ deg: 20, conf: 0.9 }, { deg: 8, conf: 0.8 }], { dir: -1 }), { deg: 8, conf: 0.8 }, 'bestTrial dir −1 : le plus petit');
  eq(bestTrial([{ deg: 90, conf: 0.2 }]), null, 'aucun essai fiable : null');
}
{
  // déficit d'extension : on part fléchi (90°) et on tend jusqu'à 12°
  const r = findHold(stream({ start: 90, peak: 12, noise: 0.5 }), { dir: -1, minTravel: 15 });
  ok(r != null, 'minimum stable (dir −1)'); near(r.deg, 12, 2, 'déficit 12°');
  const det = new HoldDetector({ minTravel: 25 }); let st; for (const x of stream({ noise: 0 }).slice(0, 55)) st = det.push(x);
  ok(['moving', 'holding'].includes(st.state) && st.progress >= 0, 'état intermédiaire avec progression');
}

// ---------- Échéances, évolution ----------
console.log('Échéances et évolution');
const DAY = 86400000, t0 = Date.UTC(2026, 0, 5);
const plan = { tests: ['sh_flex_L', { test: 'sh_er', side: 'R' }, { test: 'kn_flex' }, 'lumb_flex'], every: 2 };
eq(planItems(plan).map((p) => `${p.test}:${p.side}`), ['sh_flex:L', 'sh_er:R', 'kn_flex:L', 'kn_flex:R', 'lumb_flex:null'], 'plan normalisé (chaîne, objet, deux côtés, sans côté)');
{
  const d0 = due(plan, [], t0, t0 + DAY);
  eq(d0.length, 5, 'rien mesuré : tout est dû (départ)'); ok(d0.every((d) => d.reason === 'baseline'), 'raison = départ');
  eq(due(plan, [], t0, t0 - DAY).length, 0, 'avant la date de début : rien');
  const log = [{ test: 'sh_flex', side: 'L', ts: t0 + DAY, deg: 80, conf: 0.9, method: 'camera' }, { test: 'kn_flex', side: 'L', ts: t0 + DAY, deg: 100, conf: 0.9 }];
  eq(due(plan, log, t0, t0 + 10 * DAY).map((d) => `${d.test}:${d.side}:${d.reason}`), ['sh_er:R:baseline', 'kn_flex:R:baseline', 'lumb_flex:null:baseline'], '9 jours après (toutes les 2 sem.) : seulement ceux jamais mesurés');
  eq(due(plan, log, t0, t0 + 16 * DAY).map((d) => `${d.test}:${d.side}:${d.reason}`), ['sh_flex:L:recurring', 'sh_er:R:baseline', 'kn_flex:L:recurring', 'kn_flex:R:baseline', 'lumb_flex:null:baseline'], '15 jours après : les mesurés reviennent');
}
{
  const log = [{ test: 'sh_flex', side: 'L', ts: t0, deg: 80 }];
  eq(due({ tests: ['sh_flex_L'], every: 2 }, log, t0, t0 + 13 * DAY).length, 0, 'avant 2 semaines : pas dû');
  eq(due({ tests: ['sh_flex_L'], every: 2 }, log, t0, t0 + 14 * DAY).length, 1, 'à 2 semaines : dû');
  eq(due({ tests: ['sh_flex_L'], every: 0 }, log, t0, t0 + 200 * DAY).length, 0, 'départ seulement : jamais redû');
  eq(due(null, log, t0, t0).length, 0, 'sans plan : rien');
}
{
  const log = [
    { test: 'sh_flex', side: 'L', ts: t0, deg: 80 }, { test: 'sh_flex', side: 'L', ts: t0 + 14 * DAY, deg: 100 }, { test: 'sh_flex', side: 'L', ts: t0 + 28 * DAY, deg: 126 },
    { test: 'sh_flex', side: 'R', ts: t0, deg: 170 }, { test: 'sh_flex', side: 'R', ts: t0 + 14 * DAY, deg: 172 },
    { test: 'kn_ext', side: 'L', ts: t0, deg: 20 }, { test: 'kn_ext', side: 'L', ts: t0 + 7 * DAY, deg: 8 },
    { test: 'lumb_flex', side: null, ts: t0, deg: 40 }, { test: 'lumb_flex', side: null, ts: t0 + 7 * DAY, deg: 25 },
  ];
  const tr = trend(log, 'sh_flex', 'L');
  eq([tr.n, tr.baseline, tr.last, tr.prev, tr.gain, tr.pctNormal, tr.sideDiff], [3, 80, 126, 100, 46, 70, -46], 'tendance épaule L : gain +46°, 70 % de la norme, écart −46° avec D');
  eq(trend(log, 'sh_flex', 'R').sideDiff, 46, 'écart vu depuis le côté D');
  const k = trend(log, 'kn_ext', 'L'); eq([k.gain, k.pctNormal], [12, null], 'déficit d\'extension : −12° = gain +12°, pas de % de la norme');
  eq(trend(log, 'lumb_flex', null).gain, 15, 'test sans côté');
  eq(trend([], 'sh_flex', 'L').n, 0, 'journal vide');
  eq(trend(log, 'sh_abd', 'L').last, null, 'test jamais fait');
  eq(seriesOf(log, 'sh_flex', 'R').length, 2, 'séries par côté');
  const sp = summaryPart({ romLog: log });
  ok(sp.rom.length === 4 && sp.rom.every((r) => r.t && r.p.length >= 2), 'summaryPart : 4 séries avec points'); eq(summaryPart({}), {}, 'summaryPart vide');
  ok(JSON.stringify(sp).length < 1500, 'résumé compact');
  const html = clinicPanelRom(sp); ok(html.includes('Shoulder') || html.includes('Épaule') || html.includes('rom_'), 'panneau clinicien : HTML'); ok(html.includes('46'), 'panneau : gain affiché');
  ok(clinicPanelRom({}).includes('card'), 'panneau vide');
  const svg = romChartSvg('sh_flex', log); ok(svg.startsWith('<svg') && svg.includes('rom-band') && svg.includes('polyline') && svg.includes('<rect') && svg.includes('<circle'), 'graphique SVG : bande normale, 2 côtés (cercles / carrés)');
  eq(romChartSvg('sh_abd', log), '', 'pas de données : pas de graphique');
  ok(homeCardRom({ romPlan: { tests: ['sh_flex_L'], every: 2 }, romLog: log, startDate: t0 }, t0 + 43 * DAY).includes('#/rom/sh_flex/L'), 'carte d\'accueil : mesure due → lien');
  eq(homeCardRom({ romPlan: { tests: ['sh_flex_L'], every: 2 }, romLog: log, startDate: t0 }, t0 + 30 * DAY), '', 'carte d\'accueil : rien de dû → vide');
  eq(homeCardRom({}), '', 'sans plan : vide');
}
eq([fmtVal(92.4, TESTS.sh_flex), fmtVal(30, TESTS.lumb_flex), fmtGain(5, TESTS.sh_flex), fmtGain(-4.6, TESTS.sh_flex), romHash('lumb_flex', null)], ['92°', '30 %', '+5°', '−5°', '#/rom/lumb_flex/-'], 'formats');

// ---------- Éditeur de programme ----------
console.log('Éditeur de programme');
{
  eq(rxExtrasRom({}), { romPlan: null }, 'sans rom : romPlan nul');
  const ex = rxExtrasRom({ rom: { tests: [{ test: 'sh_flex', side: 'L' }, { test: 'sh_abd' }], every: 4 } });
  eq([ex.romPlan.tests.length, ex.romPlan.every], [3, 4], 'rxExtrasRom normalise (abduction = 2 côtés)');
  const sug = suggestFor({ pathology: 'frozen' });
  eq(sug.map((p) => p.test + p.side), ['sh_flexL', 'sh_flexR', 'sh_absL'.replace('abs', 'abd'), 'sh_abdR', 'sh_erL', 'sh_erR'], 'capsulite rétractile → flexion / abduction / RE, deux côtés');
  eq(suggestFor({ region: 'knee' }).length, 4, 'repli par région'); eq(suggestFor({ pathology: 'lbp_chronic' }).map((p) => p.test), ['lumb_flex'], 'lombalgie → flexion lombaire');
  ok(Object.keys(SUGGESTED).every((id) => SUGGESTED[id].every(([tid]) => TESTS[tid])), 'suggestions : tests existants');
  const sec = rxSectionRom({ pathology: 'frozen', rom: { tests: ['sh_flex_L'], every: 6 } });
  ok(sec.html.includes('data-rom-t="sh_flex"') && sec.html.includes('value="6" selected') && sec.html.includes('data-path="frozen"'), 'HTML : tests, fréquence sélectionnée, pathologie');
  ok(sec.html.split('data-rom-t="sh_flex"').length === 3, 'deux boutons (G / D) pour l\'épaule');
  eq(sec.read({ querySelector: () => null }), { rom: { tests: ['sh_flex_L'], every: 6 } }, 'read sans DOM : garde rx.rom');
  // DOM minimal factice
  const btn = (t_, s, on) => ({ dataset: { romT: t_, romS: s }, classList: { contains: () => on } });
  const secEl = { querySelectorAll: () => [btn('sh_flex', 'L', true), btn('sh_er', 'R', true)], querySelector: () => ({ value: '8' }) };
  eq(sec.read({ querySelector: () => secEl }), { rom: { tests: [{ test: 'sh_flex', side: 'L' }, { test: 'sh_er', side: 'R' }], every: 8 } }, 'read : tests actifs + fréquence');
  const none = { querySelectorAll: () => [], querySelector: () => ({ value: '4' }) };
  eq(sec.read({ querySelector: () => none }), { rom: null }, 'aucun test : rom = null');
}


// ---------- Position de départ guidée ----------
console.log('Position de départ — données');
for (const id of TEST_IDS) {
  const st = TESTS[id].start;
  ok(st && st.instr.fr && st.instr.en && st.go.fr && st.go.en && st.lo < st.hi && ['near', 'front', 'dir', 'profile'].includes(st.mode) && st.fixed.length === 2 && 'part' in st, `${id} : consigne de départ, plage, segment fixe`);
  ok(TESTS[id].dir > 0 ? st.hi <= 100 : st.lo > 0, `${id} : plage de départ cohérente avec le sens du test`);
}
eq(Object.keys(START).sort(), [...TEST_IDS].sort(), 'un départ par test');
{
  const src = fs.readFileSync(new URL('../www/js/rom.js', import.meta.url), 'utf8'), keys = [...new Set([...src.matchAll(/\bt\('(rom_[A-Za-z0-9_]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('_')))];
  const miss = keys.filter((k) => tt(k) === k); eq(miss, [], `toutes les clés rom_ du code existent (${keys.length})`);
  const dyn = ['rom_p_arm', 'rom_p_elbow', 'rom_p_wrist', 'rom_p_hip', 'rom_p_knee', 'rom_p_ankle', 'rom_pg_arm', 'rom_pg_wrist', 'rom_rightM', 'rom_rightF', 'rom_leftM', 'rom_leftF', 'rom_dirR', 'rom_dirL'];
  eq(dyn.filter((k) => tt(k) === k), [], 'clés construites dynamiquement présentes');
}
const FR = getLang() === 'fr';

console.log('Position de départ — côté et orientation');
ok(SIDE_COLOR.L !== SIDE_COLOR.R, 'couleurs gauche / droite distinctes');
if (FR) {
  eq(sideBig(TESTS.sh_flex, 'R').text, 'Bras DROIT', 'gros libellé : Bras DROIT');
  eq(sideBig(TESTS.kn_flex, 'L').text, 'Genou GAUCHE', 'gros libellé : Genou GAUCHE');
  eq(sideBig(TESTS.hip_flex, 'R').text, 'Hanche DROITE', 'accord au féminin : Hanche DROITE');
  eq(sideBig(TESTS.an_df, 'L').text, 'Cheville GAUCHE', 'Cheville GAUCHE');
  eq(sideBig(TESTS.cerv_rot, 'R').text, 'Tête à DROITE', 'rotation cervicale : sens de la rotation');
}
eq(sideBig(TESTS.lumb_flex, null), null, 'test sans côté : pas de libellé');
eq(sideBig(TESTS.sh_flex, 'R').color, SIDE_COLOR.R, 'couleur du côté D');
// profil : côté D vers le téléphone → l'image brute le montre tourné vers la droite ; avec le miroir (caméra avant) il se voit tourné vers la gauche
eq(orientation(TESTS.sh_flex, 'R', true), { mode: 'near', side: 'R', seen: 'left', lying: false }, 'profil, côté D, miroir : on se voit tourné à gauche');
eq(orientation(TESTS.sh_flex, 'R', false), { mode: 'near', side: 'R', seen: 'right', lying: false }, 'profil, côté D, sans miroir : à droite');
eq(orientation(TESTS.kn_flex, 'L', true).seen, 'right', 'profil, côté G, miroir : à droite');
eq(orientation(TESTS.kn_flex, 'L', false).seen, 'left', 'profil, côté G, sans miroir : à gauche');
// face : le côté D du patient s'affiche à droite de l'écran avec le miroir, à gauche sans
eq([orientation(TESTS.sh_abd, 'R', true).scr, orientation(TESTS.sh_abd, 'R', false).scr, orientation(TESTS.sh_abd, 'L', true).scr, orientation(TESTS.sh_abd, 'L', false).scr], ['right', 'left', 'left', 'right'], 'face : côté à l\'écran selon côté + miroir');
eq(orientation(TESTS.cerv_rot, 'L', true).mode, 'dir', 'rotation cervicale : face, sens');
eq(orientation(TESTS.lumb_flex, null, true), { mode: 'profile' }, 'flexion lombaire : de profil sans côté');
if (FR) {
  const a = orientText(orientation(TESTS.sh_flex, 'R', true)), b = orientText(orientation(TESTS.sh_flex, 'R', false));
  ok(a.startsWith('Tourne ton côté droit vers le téléphone.') && a.includes('vers la gauche') && b.includes('vers la droite') && a !== b, 'texte : « Tourne ton côté droit vers le téléphone » + sens vu à l\'écran selon le miroir');
  ok(orientText(orientation(TESTS.kn_flex, 'L', true)).startsWith('Tourne ton côté gauche'), 'texte côté gauche');
  ok(orientText(orientation(TESTS.sh_abd, 'L', true)).includes('Fais face au téléphone') && orientText(orientation(TESTS.sh_abd, 'L', true)).includes('à gauche'), 'face, côté G, miroir : à gauche de l\'écran');
  ok(orientText(orientation(TESTS.sh_abd, 'L', false)).includes('à droite'), 'face, côté G, sans miroir : à droite de l\'écran');
  eq(orientText(orientation(TESTS.cerv_rot, 'R', true)), 'Fais face au téléphone.', 'rotation cervicale : fais face');
  ok(!orientText(orientation(TESTS.hip_flex, 'R', true)).includes('écran'), 'couché : pas de sens à l\'écran');
  ok(goInstr(TESTS.cerv_rot, 'R').includes('vers ta droite') && goInstr(TESTS.cerv_rot, 'L').includes('vers ta gauche'), 'consigne de mouvement avec le sens');
  ok(startInstr(TESTS.sh_flex).includes('bras le long du corps'), 'consigne de départ de l\'épaule');
}

console.log('Position de départ — vérification par la pose');
{
  // épaule, profil : patient tourné vers la droite de l'image brute (côté D vers la caméra) ; bras le long du corps / levé / en arrière
  const prof = (armDeg, face = 1) => { const sh = [350, 400], pts = { 0: [350 + 50 * face, 300], 7: [350 - 10 * face, 300], 8: [350 - 10 * face, 300], 11: [352, 402], 12: sh, 23: [352, 802], 24: [350, 800], 14: at(sh, 90 - armDeg, 250) }; return pts; };
  const S_ = (T_, sd, pts) => sampleOf(T_, sd, lmOf(pts), W, H);
  const T = TESTS.sh_flex;
  let c = checkStart(T, 'R', S_(T, 'R', prof(5)));
  ok(c.ok && c.inRange && c.near === 'R', 'bras le long du corps, bon côté : départ valide');
  c = checkStart(T, 'R', S_(T, 'R', prof(80)));
  ok(!c.ok && c.issues[0] === 'startHigh', 'bras déjà levé à 80° : hors plage (trop haut)');
  c = checkStart(T, 'R', S_(T, 'R', prof(-45)));
  ok(!c.ok && c.issues[0] === 'startLow', 'bras en arrière : hors plage (trop bas)');
  ok(checkStart(T, 'R', S_(T, 'R', prof(22))).ok && !checkStart(T, 'R', S_(T, 'R', prof(30))).ok && checkStart(T, 'R', S_(T, 'R', prof(-18))).ok && !checkStart(T, 'R', S_(T, 'R', prof(-25))).ok, 'bornes de la plage (−20° à 22°)');
  // mauvais côté : le patient montre son côté gauche (regarde vers la gauche de l'image) alors qu'on mesure le côté D
  const left = prof(5, -1);
  c = checkStart(T, 'R', S_(T, 'R', left));
  ok(!c.ok && c.issues[0] === 'wrongSide' && c.near === 'L' && !c.side, 'mauvais côté vers la caméra : wrongSide');
  c = checkStart(T, 'L', S_(T, 'L', { 0: [300, 300], 7: [360, 300], 8: [360, 300], 11: [350, 400], 12: [352, 402], 23: [350, 800], 24: [352, 802], 13: at([350, 400], 90, 250) }));
  ok(c.ok && c.near === 'L', 'côté G vers la caméra (regard vers la gauche de l\'image) : valide pour le côté G');
  eq(nearSide({ facing: 0, visL: 0.9, visR: 0.4 }), 'L', 'sans regard : le côté le mieux vu');
  eq(nearSide({ facing: 0, visL: 0.8, visR: 0.7 }), null, 'sans regard ni écart de visibilité : inconnu');
  // vue : épaules de face alors qu'un profil est demandé
  const frontPts = { ...prof(5), 11: [250, 400], 12: [450, 400], 23: [290, 800], 24: [410, 800] };
  c = checkStart(T, 'R', S_(T, 'R', frontPts));
  ok(!c.ok && c.issues[0] === 'turnSide' && !c.view, 'de face au lieu de profil : turnSide (avant le côté)');
  // test de face : abduction
  const TA = TESTS.sh_abd, fr = (armDeg, w = 220) => { const shL = [360 + w / 2, 400]; return { 0: [360, 300], 7: [330, 300], 8: [390, 300], 11: shL, 12: [360 - w / 2, 400], 23: [380, 800], 24: [340, 800], 13: at(shL, 90 - armDeg, 250) }; };
  c = checkStart(TA, 'L', S_(TA, 'L', fr(5)));
  ok(c.ok && c.view, 'abduction, de face, bras le long du corps : valide');
  c = checkStart(TA, 'L', S_(TA, 'L', fr(5, 20)));
  ok(!c.ok && c.issues[0] === 'turnFront', 'abduction, patient de profil : turnFront');
  c = checkStart(TA, 'L', S_(TA, 'L', fr(100)));
  ok(c.issues[0] === 'startHigh', 'abduction, bras déjà levé : hors plage');
  ok(checkStart(TA, 'R', S_(TA, 'R', fr(5))).side, 'de face : pas de contrôle du côté tourné');
  // départ « déficit » (coude, extension) : doit partir fléchi
  const TE = TESTS.el_ext, elb = (flex) => ({ 0: [400, 300], 7: [340, 300], 8: [340, 300], 11: [352, 402], 12: [350, 400], 23: [352, 802], 24: [350, 800], 14: at([350, 400], 90, 200), 16: at(at([350, 400], 90, 200), 90 - flex, 180) });
  ok(checkStart(TE, 'R', S_(TE, 'R', elb(90))).ok, 'extension du coude : départ plié à 90° valide');
  eq(checkStart(TE, 'R', S_(TE, 'R', elb(5))).issues[0], 'startLow', 'extension du coude : déjà tendu = hors plage');
  // couché : pas de contrôle du côté par la tête
  const lying = { ...prof(5, -1), 24: [350, 400], 23: [352, 402] };
  ok(START.hip_flex.lying && !checkStart(TESTS.hip_flex, 'R', { deg: 5, vis: 0.9, ratio: 0.1, facing: -1, visL: 0.9, visR: 0.9, seg: 0 }).issues.includes('wrongSide'), 'couché : le sens du regard n\'invalide pas le côté');
  eq(checkStart(T, 'R', null).issues, ['lost'], 'pas de personne : lost');
  eq(checkStart(T, 'R', { deg: null, vis: 0, ratio: 0.1, facing: 1 }).issues, ['lost'], 'angle introuvable : lost');
  ok(typeof segmentAngle(T, 'R', { lm: lmOf(prof(5)), w: W, h: H }) === 'number', 'segment fixe (tronc) mesurable');
}

console.log('Position de départ — immobilité');
{
  const T = TESTS.sh_flex, good = { ok: true }, s0 = (deg, seg) => ({ deg, seg });
  let g = new StartGate({ holdMs: 1200 }), r;
  for (let i = 0; i <= 30; i++) r = g.push(i * 50, good, s0(3 + (i % 2) * 0.5, 90));
  ok(r.ready && r.still && r.progress === 1, 'position stable 1,2 s : prête');
  g = new StartGate(); for (let i = 0; i <= 12; i++) r = g.push(i * 50, good, s0(3, 90));
  ok(!r.ready && r.progress > 0.3 && r.progress < 0.7, 'à mi-parcours : pas encore prête');
  g = new StartGate(); for (let i = 0; i <= 40; i++) r = g.push(i * 50, good, s0(i % 2 ? 0 : 14, 90));
  ok(!r.ready && !r.still, 'l\'angle bouge de 14° : pas immobile');
  g = new StartGate(); for (let i = 0; i <= 40; i++) r = g.push(i * 50, good, s0(3, i % 2 ? 80 : 95));
  ok(!r.ready && !r.still, 'le segment fixe bouge de 15° : pas immobile');
  g = new StartGate(); for (let i = 0; i <= 40; i++) r = g.push(i * 50, good, s0(3, 179 + (i % 2 ? 0 : 3) - (i % 2 ? 0 : 360 * 0)));
  ok(r.ready, 'segment fixe vers ±180° : le passage de l\'angle est géré');
  g = new StartGate(); for (let i = 0; i <= 30; i++) r = g.push(i * 50, i === 28 ? { ok: false } : good, s0(3, 90));
  ok(!r.ready, 'une sortie de plage remet le compte à zéro');
  g = new StartGate(); for (let i = 0; i <= 30; i++) r = g.push(i * 50, good, s0(3, 90 + i * 1.2));
  ok(!r.ready, 'le segment fixe dérive lentement (36° en 1,5 s) : pas immobile');
  // consignes selon la situation
  const gate = (still, ready) => ({ still, ready, progress: ready ? 1 : 0.5 });
  eq(startCue(T, 'R', { issues: ['lost'] }, gate(false, false), true).say, null, 'corps perdu : pas de voix (le placement s\'en occupe)');
  eq(startCue(T, 'R', { issues: ['wrongSide'] }, gate(false, false), true).key, 'side', 'mauvais côté : consigne d\'orientation');
  if (FR) ok(startCue(T, 'R', { issues: ['wrongSide'] }, gate(false, false), true).say.startsWith('Tourne ton côté droit'), 'dite : « Tourne ton côté droit vers le téléphone »');
  eq(startCue(T, 'R', { issues: ['startHigh'] }, gate(false, false), true).say, startInstr(T), 'hors plage : on redit la consigne de départ');
  eq(startCue(T, 'R', { issues: [] }, gate(false, false), true).key, 'still', 'dans la plage mais bouge : reste immobile');
  eq(startCue(T, 'R', { issues: [] }, gate(true, false), true).say, null, 'dans la plage, stable : on attend en silence');
  const go = startCue(T, 'R', { issues: [] }, gate(true, true), true);
  ok(go.key === 'go' && go.say.includes(goInstr(T, 'R')), '« Bien, maintenant » + consigne du mouvement');
  if (FR) ok(go.say.startsWith('Bien. Maintenant, lève le bras tendu'), 'épaule : « Bien. Maintenant, lève le bras tendu… »');
}

console.log('Position de départ — voix');
{
  let v = new Voicer({ minGap: 2500, repeatMs: 9000 });
  ok(v.offer('a', 'Bonjour', 0), 'première consigne dite');
  ok(!v.offer('a', 'Bonjour', 3000), 'la même consigne n\'est pas répétée');
  ok(!v.offer('b', 'Autre', 1000), 'une autre consigne attend 2,5 s');
  ok(!v.offer('b', 'Autre', 2400), '… toujours pas à 2,4 s');
  ok(v.offer('b', 'Autre', 2500), '… dite à 2,5 s');
  ok(!v.offer('b', 'Autre', 9000), 'pas de répétition avant 9 s');
  ok(v.offer('b', 'Autre', 12000), 'rappel de la même consigne après 9 s');
  ok(!v.offer('c', '', 30000), 'texte vide : rien');
  v = new Voicer(); v.offer('long', 'x'.repeat(100), 0);
  ok(!v.offer('n', 'Suite', 5000) && v.offer('n', 'Suite', 6200), 'phrase longue : on attend la fin estimée (pas de chevauchement)');
  v = new Voicer(); v.offer('k', 'Deux', 0, { gap: 300 });
  ok(!v.offer('k2', 'Un', 200) && v.offer('k2', 'Un', 300), 'décompte : intervalle court');
  v = new Voicer({ muted: true }); ok(v.offer('a', 'texte', 0) && v.offer('b', 'texte', 0), 'voix coupée : aucune attente');
  v = new Voicer(); v.mark('res', 'Noté', 1000); ok(!v.idle(1500) && v.idle(3600), 'mark : bloque les consignes suivantes 2,5 s');
}

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est vert.');
process.exit(fails ? 1 : 0);
