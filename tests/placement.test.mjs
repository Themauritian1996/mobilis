// Assistant de placement : un jeu de points synthétiques par problème + le cas « tout va bien » + l'hystérésis.
import { assessPlacement, PlacementGate, TH, scopeOf, palmNeed, guideRect, issueIcon, requiredJoints } from '../www/js/placement.js';

let fails = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('  ÉCHEC', m, '— obtenu', JSON.stringify(a), 'attendu', JSON.stringify(b)); } else console.log('  ok ', m); };
const W = 720, H = 1280;
const keys = (r) => r.issues.map((i) => i.key);
const has = (r, k) => keys(r).includes(k);
const GOOD = { mean: 120, center: 120, edges: 130 };
const UP = { beta: 88, gamma: 2 };

// Corps debout : h = hauteur du sujet (fraction de l'image), top = y du nez, cx = centre horizontal, plane = 'front' | 'side'
function body({ h = 0.7, top = 0.12, cx = 0.5, plane = 'front', hide = [], vis = 0.95, shW, hipW, torsoK = 1 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: top, z: 0, visibility: vis }));
  const Y = (f) => top + f * h;
  const sw = (shW ?? (plane === 'front' ? 0.26 : 0.04)) * h * H / W, hw = (hipW ?? (plane === 'front' ? 0.19 : 0.035)) * h * H / W;
  const set = (i, x, y) => { lm[i] = { ...lm[i], x, y }; };
  set(0, cx, Y(0)); set(7, cx - 0.03, Y(0)); set(8, cx + 0.03, Y(0));
  set(11, cx + sw / 2, Y(0.18)); set(12, cx - sw / 2, Y(0.18));     // gauche du patient = droite de l'image brute (11 = gauche)
  set(13, cx + sw / 2, Y(0.34)); set(14, cx - sw / 2, Y(0.34)); set(15, cx + sw / 2, Y(0.48)); set(16, cx - sw / 2, Y(0.48));
  const hy = Y(0.18 + 0.34 * torsoK);
  set(23, cx + hw / 2, hy); set(24, cx - hw / 2, hy);
  set(25, cx + hw / 2, Y(0.76)); set(26, cx - hw / 2, Y(0.76)); set(27, cx + hw / 2, Y(1)); set(28, cx - hw / 2, Y(1));
  set(29, cx + hw / 2, Y(1.02)); set(30, cx - hw / 2, Y(1.02)); set(31, cx + hw / 2 + 0.01, Y(1.03)); set(32, cx - hw / 2 + 0.01, Y(1.03));
  for (const i of hide) lm[i] = { ...lm[i], visibility: 0.1 };
  return lm;
}
const A = (o) => assessPlacement({ kind: 'body', plane: 'front', side: null, frameW: W, frameH: H, mirror: true, luma: GOOD, tilt: UP, ...o });

console.log('Corps');
{
  const ok = A({ lm: body() });
  eq([ok.ok, keys(ok), ok.score], [true, [], 1], 'cas parfait de face');
  const side = A({ plane: 'side', side: 'L', lm: body({ plane: 'side' }) });
  eq([side.ok, keys(side)], [true, []], 'cas parfait de profil');
  eq(keys(A({ lm: body({ h: 0.97, top: 0.015 }) }))[0], 'moveBack', 'trop près (sujet quasi hors image)');
  eq(has(A({ lm: body({ h: 0.9, top: 0.06, hide: [27, 28, 29, 30, 31, 32] }) }), 'moveBack'), false, 'chevilles non vues mais sujet loin du bord : pas « recule »');
  eq(keys(A({ lm: body({ h: 0.9, top: 0.1, hide: [27, 28, 29, 30, 31, 32] }) })).includes('showBody'), true, 'chevilles non vues, sujet dans le cadre : « montre-toi en entier »');
  eq(keys(A({ lm: body({ h: 0.95, top: 0.05, hide: [27, 28] }) }))[0], 'moveBack', 'chevilles coupées par le bord : recule');
  eq(keys(A({ lm: body({ h: 0.3, top: 0.3 }) })), ['moveCloser'], 'trop loin (corps entier)');
  eq(keys(A({ lm: body({ h: 0.4, top: 0.3 }) }))[0], 'moveCloser', 'limite basse corps entier (0,40 < 0,45)');
  // Décentrage : image brute, x > 0,5 = côté gauche du patient de la caméra → il va vers SA droite, indépendamment du miroir
  for (const mirror of [true, false]) {
    const r = A({ mirror, lm: body({ cx: 0.75 }) }), l = A({ mirror, lm: body({ cx: 0.25 }) });
    eq([keys(r), r.issues[0].dir], [['moveRight'], mirror ? 'right' : 'left'], `décalé à droite de l’image brute, miroir=${mirror} : va à ta droite, flèche à l’écran`);
    eq([keys(l), l.issues[0].dir], [['moveLeft'], mirror ? 'left' : 'right'], `décalé à gauche de l’image brute, miroir=${mirror} : va à ta gauche, flèche à l’écran`);
  }
  eq(keys(A({ lm: body({ cx: 0.62 }) })), [], 'léger décalage (0,12) toléré');
  eq(keys(A({ plane: 'side', side: 'L', lm: body({ plane: 'front' }) })), ['turnSide'], 'face montrée alors que le profil est demandé');
  eq(keys(A({ plane: 'front', lm: body({ plane: 'side' }) })), ['turnFront'], 'profil montré alors que la face est demandée');
  // Articulations manquantes
  const miss = A({ plane: 'side', side: 'R', lm: body({ plane: 'side', hide: [26] }) });
  eq([keys(miss), miss.issues[0].joints], [['showBody'], ['knR']], 'genou du côté travaillé invisible (profil, côté R)');
  eq(keys(A({ plane: 'side', side: 'R', lm: body({ plane: 'side', hide: [25, 27] }) })), [], 'côté non travaillé invisible : sans importance de profil');
  eq(keys(A({ lm: body({ hide: [28] }) })), ['showBody'], 'face : les deux côtés sont exigés');
  eq(requiredJoints('side', 'upper', 'L', null), ['shL', 'elL', 'hipL', 'earL'], 'haut du corps de profil : côté L seulement');
  eq(keys(A({ metric: 'shFlex', plane: 'side', side: 'L', lm: body({ plane: 'side', h: 0.75, top: 0.1, hide: [25, 26, 27, 28, 29, 30, 31, 32] }) })), [], 'haut du corps : les jambes ne sont pas exigées (et la taille est jugée sur le haut)');
  eq(scopeOf('shFlex') + scopeOf('knee'), 'upperfull', 'zone d’après la métrique');
  eq(keys(A({ lm: null })), ['noBody'], 'personne dans l’image');
  // Hauteur / angle du téléphone
  eq(keys(A({ lm: body({ shW: 0.36, hipW: 0.19 }) })), ['phoneLower'], 'caméra haute (épaules très larges / hanches)');
  eq(keys(A({ lm: body({ shW: 0.19, hipW: 0.24 }) })), ['phoneHigher'], 'caméra basse');
  eq(keys(A({ plane: 'side', side: 'L', lm: body({ plane: 'side', torsoK: 1.5 }) })), ['phoneLower'], 'profil : tronc trop long devant la jambe = caméra haute');
  // Inclinaison : capteurs
  eq(keys(A({ lm: body(), tilt: { beta: 88, gamma: 14 } })), ['straightenPhone'], 'roulis du téléphone > 8°');
  eq(keys(A({ lm: body(), tilt: { beta: 88, gamma: 6 } })), [], 'roulis de 6° toléré');
  eq(keys(A({ lm: body(), tilt: { beta: 62, gamma: 0 } })), ['phoneUpright'], 'téléphone trop incliné en arrière');
  eq(keys(A({ lm: body(), tilt: { beta: 5, gamma: 3 } })), ['phoneUpright'], 'téléphone à plat');
  eq(keys(A({ lm: body(), tilt: { beta: 1, gamma: 89 } })), [], 'paysage bien tenu');
  eq(keys(A({ lm: body(), tilt: null })), [], 'pas de capteur : rien à signaler');
  // Sans capteur : corps penché dans l'image (tronc et jambes alignés)
  const lean = body(); const sh = 0.35; // tout le corps penché de la même façon
  const tilted = lean.map((l) => ({ ...l, x: l.x + (l.y - 0.12) * sh * (H / W) * 0.8 }));
  eq(has(A({ lm: tilted, tilt: null }), 'straightenPhone'), true, 'image penchée (corps entier) sans capteur : redresse le téléphone');
  eq(has(A({ lm: tilted, tilt: UP }), 'straightenPhone'), false, 'avec capteur, c’est lui qui décide');
}

console.log('Lumière');
{
  eq(keys(A({ lm: body(), luma: { mean: 45, center: 45, edges: 50 } })), ['moreLight'], 'trop sombre');
  eq(keys(A({ lm: body(), luma: { mean: 130, center: 60, edges: 190 } })), ['backlight'], 'contre-jour (bords > 1,6 × centre)');
  eq(keys(A({ lm: body(), luma: { mean: 130, center: 100, edges: 140 } })), [], 'bords un peu plus clairs : normal');
  eq(keys(A({ lm: body(), luma: { mean: 20, center: 10, edges: 40 } }))[0], 'moreLight', 'très sombre : la lumière passe devant');
  eq(keys(A({ lm: null, luma: { mean: 20, center: 10, edges: 40 } })), ['moreLight', 'noBody'], 'sombre et personne détectée');
}

console.log('Main');
// Main synthétique : poignet en bas, doigts vers le haut ; w = largeur de la paume (fraction de l'image), L = longueur de la paume
function hand({ cx = 0.5, cy = 0.5, size = 0.4, palmW = 0.72 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const palmL = size * 0.42 * W / H * (H / W); // longueur de paume (≈ 0,42 de la taille) en fraction de la hauteur
  const wr = { x: cx, y: cy + size / 2 };
  pts[0] = wr;
  const fy = (f) => wr.y - f * size; // f : fraction de la taille de la main
  const mcpY = fy(0.42), halfW = (palmW * palmL * H / W) / 2;
  pts[5] = { x: cx - halfW, y: mcpY }; pts[9] = { x: cx, y: mcpY - 0.005 }; pts[13] = { x: cx + halfW * 0.33, y: mcpY }; pts[17] = { x: cx + halfW, y: mcpY };
  // L réelle de la paume : |poignet → pts[9]| ≈ palmL ; on ajuste pts[9].y pour que palmL soit cohérente avec la taille
  pts[9].y = wr.y - palmL;
  pts[5].y = pts[17].y = pts[9].y; pts[13].y = pts[9].y;
  for (const tip of [4, 8, 12, 16, 20]) pts[tip] = { x: cx + (tip - 12) * 0.01, y: wr.y - size };
  for (const i of [1, 2, 3, 6, 7, 10, 11, 14, 15, 18, 19]) pts[i] = { x: cx, y: wr.y - size * 0.6 };
  return pts;
}
const Hh = (o) => assessPlacement({ kind: 'hand', side: 'R', frameW: W, frameH: H, mirror: true, luma: GOOD, tilt: UP, palm: 'front', ...o });
{
  const ok = Hh({ hand: hand() });
  eq([ok.ok, keys(ok)], [true, []], 'main parfaite, paume face caméra');
  eq(keys(Hh({ hand: hand({ size: 0.12 }) })), ['handCloser'], 'main trop petite');
  eq(keys(Hh({ hand: hand({ size: 0.82, cy: 0.5 }) })).includes('handFarther'), true, 'main trop grande');
  eq(keys(Hh({ hand: hand({ cx: 0.995, size: 0.3 }) }))[0], 'handFarther', 'main coupée par le bord');
  // image affichée : miroir → l’image brute est retournée
  const r = Hh({ hand: hand({ cx: 0.8, size: 0.3 }), mirror: false }), m = Hh({ hand: hand({ cx: 0.8, size: 0.3 }), mirror: true });
  eq([keys(r), r.issues[0].dir], [['handLeft'], 'left'], 'main à droite de l’écran (caméra arrière) : vers la gauche');
  eq([keys(m), m.issues[0].dir], [['handRight'], 'right'], 'même point brut en miroir : affiché à gauche → vers la droite');
  eq(keys(Hh({ hand: hand({ cy: 0.2, size: 0.3 }) })), ['handDown'], 'main trop haute → descends-la');
  eq(keys(Hh({ hand: hand({ cy: 0.8, size: 0.3 }) })), ['handUp'], 'main trop basse → monte-la');
  eq(keys(Hh({ hand: hand({ palmW: 0.15 }) })), ['showPalm'], 'main de profil alors que la paume est exigée');
  eq(keys(Hh({ hand: hand({ palmW: 0.15 }), palm: 'side' })), [], 'main de profil exigée : ok');
  eq(keys(Hh({ hand: hand({ palmW: 0.8 }), palm: 'side' })), ['turnHandSide'], 'paume face caméra alors que le profil est exigé');
  eq(keys(Hh({ hand: hand(), palm: null })), [], 'aucune orientation exigée');
  eq(keys(Hh({ hand: hand(), side: 'L', handLabel: 'R', handScore: 0.95 })), ['wrongHandL'], 'mauvaise main (côté gauche demandé) : clé existante wrongHandL');
  eq(keys(Hh({ hand: hand(), side: 'R', wrongHand: true })), ['wrongHandR'], 'mauvaise main signalée par l’appelant');
  eq(keys(Hh({ hand: null })), ['noHand'], 'pas de main');
  eq(keys(Hh({ hand: hand(), luma: { mean: 40, center: 40, edges: 40 } })), ['moreLight'], 'main : trop sombre');
  eq(palmNeed('hAxis') + palmNeed('hPinch') + palmNeed('hRoll'), 'sidefrontnull', 'orientation exigée d’après la métrique');
}

console.log('Hystérésis et divers');
{
  const good = { ok: true, issues: [] }, bad = (k) => ({ ok: false, issues: [{ key: k }] });
  const g = new PlacementGate();
  let r = g.push(good, 0); r = g.push(good, 600);
  eq(r.stable, false, 'pas encore 1,2 s');
  r = g.push(good, 1250); eq(r.stable, true, 'stable après 1,2 s');
  g.reset(); g.push(good, 0); g.push(bad('moveBack'), 500); r = g.push(good, 700); // 200 ms de problème < grâce
  eq(r.progress > 0.5, true, 'un écart bref ne remet pas à zéro');
  g.reset(); g.push(good, 0); g.push(bad('moveBack'), 500); g.push(bad('moveBack'), 900); r = g.push(good, 1000);
  eq(r.progress < 0.2, true, 'un écart ≥ 300 ms remet à zéro');
  // le problème affiché n'apparaît qu'après 500 ms et ne clignote pas
  const g2 = new PlacementGate();
  eq(g2.push(bad('moveBack'), 0).issue, null, 'problème pas encore affiché');
  eq(g2.push(bad('moveBack'), 550).issue?.key, 'moveBack', 'affiché après 500 ms');
  g2.push(bad('moveLeft'), 600); eq(g2.push(bad('moveBack'), 700).issue?.key, 'moveBack', 'un autre problème fugitif ne remplace pas l’affiché');
  g2.push(bad('moveLeft'), 800); eq(g2.push(bad('moveLeft'), 1400).issue?.key, 'moveLeft', 'il le remplace s’il dure');
  eq(g2.push(good, 1450).issue?.key, 'moveLeft', 'la disparition elle aussi est temporisée');
  eq(g2.push(good, 2000).issue, null, '… puis le problème disparaît');
  eq(issueIcon({ key: 'moveRight', dir: 'left' }) + issueIcon({ key: 'moreLight' }) + issueIcon(null), 'leftsunok', 'icônes');
  const gr = guideRect('body', 'side', 'full'); eq(gr.x + gr.w < 1 && gr.y + gr.h <= 1, true, 'rectangle guide dans l’image');
  eq(TH.OK_HOLD_MS, 1200, 'durée de maintien');
}
console.log(fails ? `\n${fails} échec(s)` : '\nplacement : tout est bon');
process.exit(fails ? 1 : 0);
