// Test de bout en bout de la superposition caméra / squelette, avec les VRAIS modèles MediaPipe (www/models/*.task)
// dans Chromium (Playwright) et une caméra simulée (fichier .y4m fabriqué avec ffmpeg à partir de vraies photos).
//
//   node tests/overlay.e2e.mjs            (ou : npm run test:e2e)
//   MOBILIS_WWW=/autre/www  : tester une autre copie de l'app
//   MOBILIS_E2E_MEDIA=/dossier : dossier de travail (photos téléchargées + vidéos fabriquées)
//
// Vérifie, pour une main et un corps entier, caméra avant (miroir) et arrière, en portrait et en paysage :
//  1. boîte du canevas = boîte de la vidéo (4 repères de couleur incrustés dans l'image de la caméra : même position à l'écran
//     quand la vidéo est affichée seule et quand l'image analysée est dessinée dans le canevas) ;
//  2. chaque point dessiné tombe à l'endroit où le point détecté se trouve DANS L'IMAGE AFFICHÉE (position prédite par les
//     repères, sans utiliser le code de projection de l'app) : écart < 2 % de la largeur ;
//  3. un point blanc est réellement visible à cet endroit sur la capture d'écran ;
//  4. une seconde détection indépendante, faite sur la capture d'écran de l'image affichée, retrouve les mêmes points ;
//  5. main gauche / droite : étiquette correcte (photo non retournée et photo retournée) ;
//  6. synchronisation : main qui se déplace vite + processeur ralenti 4× → le squelette reste sur la main.
// Sans modèles, sans Playwright ou sans photos (réseau coupé) : le test est ignoré (code 0).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.resolve(process.env.MOBILIS_WWW || path.join(HERE, '../www'));
const MEDIA = path.resolve(process.env.MOBILIS_E2E_MEDIA || path.join(os.tmpdir(), 'mobilis-e2e-media'));
const TOL = 0.02; // 2 % de la largeur
const skip = (why) => { console.log(`Superposition (bout en bout) : IGNORÉ — ${why}`); process.exit(0); };

for (const m of ['hand_landmarker.task', 'pose_landmarker_lite.task']) if (!fs.existsSync(path.join(WWW, 'models', m))) skip(`modèle absent : www/models/${m} (npm run fetch-model)`);
let chromium;
for (const base of [import.meta.url, '/opt/npm-tools/node_modules/']) { try { ({ chromium } = createRequire(base)('playwright')); break; } catch (_) {} }
if (!chromium) skip('Playwright non installé');
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (_) { skip('ffmpeg absent'); }

// ---------- Photos réelles (dépôts publics GitHub) ----------
const PHOTOS = {
  // homme de face, main gauche levée (paume visible) ; mains levées sur fond bleu
  hand: 'https://raw.githubusercontent.com/victordibia/handtrack.js/master/demo/images/1.jpg',
  hands: 'https://raw.githubusercontent.com/victordibia/handtrack.js/master/demo/images/4.jpg',
  // planche de mains sur fond blanc (en bas à droite : main DROITE ouverte, paume visible)
  sheet: 'https://raw.githubusercontent.com/victordibia/handtrack.js/master/demo/images/5.jpg',
  // personne debout en entier, d'autres personnes assises derrière ; joueur accroupi de côté
  body: 'https://raw.githubusercontent.com/CMU-Perceptual-Computing-Lab/openpose/master/examples/media/COCO_val2014_000000000241.jpg',
  body2: 'https://raw.githubusercontent.com/CMU-Perceptual-Computing-Lab/openpose/master/examples/media/COCO_val2014_000000000474.jpg',
};
fs.mkdirSync(MEDIA, { recursive: true });
for (const [k, url] of Object.entries(PHOTOS)) {
  const f = path.join(MEDIA, `${k}.jpg`);
  if (fs.existsSync(f) && fs.statSync(f).size > 5000) continue;
  try { execFileSync('curl', ['-sS', '-f', '-m', '40', '-o', f, url], { stdio: 'ignore' }); } catch (_) { try { fs.unlinkSync(f); } catch (__) {} }
  if (!fs.existsSync(f) || fs.statSync(f).size < 5000) skip(`photo de test indisponible (${url})`);
}

// ---------- Vidéos de la caméra simulée ----------
// Image de la caméra : fond gris-bleu, photo au centre, 4 repères carrés de couleur pure à des positions connues.
const MARK = 26;
const COLORS = { magenta: [255, 0, 255], green: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0] };
const hex = (c) => '0x' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
function fiducials(fw, fh, vis) { // vis : fraction (centrée) de l'image visible à l'écran, pour rester dans le cadrage « cover »
  const x0 = fw * (0.5 - vis.x / 2) + 14, x1 = fw * (0.5 + vis.x / 2) - 14 - MARK, y0 = fh * (0.5 - vis.y / 2) + 14, y1 = fh * (0.5 + vis.y / 2) - 14 - MARK;
  return { magenta: [x0, y0], green: [x1, y0], blue: [x0, y1], yellow: [x1, y1] };
}
function ff(args) { execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] }); }
/** photo (éventuellement rognée / retournée) posée au centre d'une image fw × fh avec les repères → .y4m (image fixe) */
function still(name, { photo, crop, flip, fw, fh, box, vis }) {
  const out = path.join(MEDIA, `${name}.y4m`);
  const fid = fiducials(fw, fh, vis);
  const pre = `${crop ? `crop=${crop},` : ''}${flip ? 'hflip,' : ''}scale=${box[0]}:${box[1]}:force_original_aspect_ratio=decrease:flags=lanczos`;
  const draw = Object.entries(fid).map(([k, [x, y]]) => `drawbox=x=${Math.round(x)}:y=${Math.round(y)}:w=${MARK}:h=${MARK}:color=${hex(COLORS[k])}:t=fill`).join(',');
  if (!fs.existsSync(out)) ff(['-f', 'lavfi', '-i', `color=c=0x5b6b7c:s=${fw}x${fh}:r=30`, '-i', path.join(MEDIA, `${photo}.jpg`), '-filter_complex', `[1:v]${pre}[p];[0:v][p]overlay=(W-w)/2:(H-h)/2,${draw},format=yuv420p`, '-frames:v', '6', '-pix_fmt', 'yuv420p', out]);
  return { file: out, fid, fw, fh };
}
/** main qui se déplace de gauche à droite (±amp px, période 2 s) avec un repère magenta collé à la photo */
function moving(name, { photo, crop, fw, fh, box, amp }) {
  const out = path.join(MEDIA, `${name}.y4m`);
  if (!fs.existsSync(out)) ff(['-f', 'lavfi', '-i', `color=c=0x5b6b7c:s=${fw}x${fh}:r=30`, '-i', path.join(MEDIA, `${photo}.jpg`), '-filter_complex',
    `[1:v]${crop ? `crop=${crop},` : ''}scale=${box[0]}:${box[1]}:force_original_aspect_ratio=decrease:flags=lanczos,drawbox=x=(iw-${MARK})/2:y=0:w=${MARK}:h=${MARK}:color=${hex(COLORS.magenta)}:t=fill[p];[0:v][p]overlay=x='(W-w)/2+${amp}*sin(2*PI*n/60)':y=(H-h)/2,format=yuv420p`, '-frames:v', '60', '-pix_fmt', 'yuv420p', out]);
  return { file: out, fw, fh };
}

// ---------- Serveur statique ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(WWW, path.normalize(u));
  if (!f.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(q.method === 'HEAD' ? undefined : d); });
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---------- Outils dans la page ----------
// Capture d'écran (PNG) → pixels, dans une page vierge (décodage par le navigateur)
async function decode(tool, png) {
  return tool.evaluate(async (b64) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    window.__shots = window.__shots || []; window.__shots.push({ c, g, w: im.width, h: im.height });
    return window.__shots.length - 1;
  }, png.toString('base64'));
}
// centre de chaque repère de couleur dans une capture
const findMarks = (tool, id) => tool.evaluate((id) => {
  const { g, w, h } = window.__shots[id]; const d = g.getImageData(0, 0, w, h).data;
  const T = { magenta: (r, gg, b) => r > 200 && gg < 90 && b > 200, green: (r, gg, b) => r < 90 && gg > 200 && b < 90, blue: (r, gg, b) => r < 80 && gg < 80 && b > 200, yellow: (r, gg, b) => r > 200 && gg > 200 && b < 90 };
  const acc = {}; for (const k in T) acc[k] = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; for (const k in T) if (T[k](d[i], d[i + 1], d[i + 2])) { acc[k][0] += x + 0.5; acc[k][1] += y + 0.5; acc[k][2]++; } }
  const out = {}; for (const k in acc) out[k] = acc[k][2] > 30 ? { x: acc[k][0] / acc[k][2], y: acc[k][1] / acc[k][2], n: acc[k][2] } : null;
  return out;
}, id);
// luminosité minimale des canaux au point le plus blanc d'un petit voisinage
const whiteAt = (tool, id, pts, rad) => tool.evaluate(({ id, pts, rad }) => {
  const { g, w, h } = window.__shots[id];
  return pts.map((p) => {
    const x0 = Math.max(0, Math.round(p.x - rad)), y0 = Math.max(0, Math.round(p.y - rad)), n = Math.min(2 * rad + 1, w - x0, h - y0);
    if (n <= 0) return 0; const d = g.getImageData(x0, y0, n, n).data; let best = 0;
    for (let i = 0; i < d.length; i += 4) best = Math.max(best, Math.min(d[i], d[i + 1], d[i + 2]));
    return best;
  });
}, { id, pts, rad });
// seconde détection, indépendante, sur une capture d'écran (mode IMAGE)
const redetect = (tool, id, kind) => tool.evaluate(async ({ id, kind }) => {
  const mp = await import('/vendor/mediapipe/vision_bundle.mjs');
  window.__fs = window.__fs || await mp.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
  const { c, w, h } = window.__shots[id];
  if (kind === 'hand') {
    window.__hl = window.__hl || await mp.HandLandmarker.createFromOptions(window.__fs, { baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numHands: 4 });
    const r = window.__hl.detect(c);
    return r.landmarks.map((lm, i) => ({ label: r.handedness[i][0].categoryName, pts: lm.map((l) => ({ x: l.x * w, y: l.y * h })) }));
  }
  window.__pl = window.__pl || await mp.PoseLandmarker.createFromOptions(window.__fs, { baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 4 });
  const r = window.__pl.detect(c);
  return r.landmarks.map((lm) => ({ pts: lm.map((l) => ({ x: l.x * w, y: l.y * h, v: l.visibility })) }));
}, { id, kind });

// ---------- Une séance dans l'app ----------
const HIDE_HUD = '.train .hud-top,.train .counter,.train .depth,.train .cue,.train .center-msg,.train .mini-fig,.train .vid-off,.toast{visibility:hidden!important}';
async function openApp(browser, { viewport, dpr, facing, exercise, side, selfView = true, place = false }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, permissions: ['camera'] });
  await ctx.addInitScript(({ facing, exercise, side, selfView }) => {
    localStorage.setItem('mobilis.delegate', 'CPU'); // pas de carte graphique ici : le moteur « GPU » logiciel met > 1 s par image
    localStorage.setItem('mobilis.localUser', JSON.stringify({ uid: 'local', local: true, name: '' }));
    localStorage.setItem('mobilis.settings', JSON.stringify({ camera: facing, selfView, guides: false, countAloud: false, vibrate: false, voice: 'off', liveAI: false }));
    localStorage.setItem('mobilis.data.local', JSON.stringify({ profile: { role: 'patient', pathology: 'lateral_epicondylalgia', lang: 'fr', side: side || 'R', sides: side ? { [exercise]: side } : {}, levels: {}, days: [1, 3, 5], painBase: 2 }, sessions: [], journal: [] }));
    try { window.speechSynthesis.speak = () => {}; } catch (_) {}
    // Un téléphone tenu debout fournit une image en portrait (720 × 960) pour la même demande « 960 × 720 » ; la caméra simulée
    // de Chromium, elle, rognerait le fichier. On laisse donc le fichier à sa taille d'origine.
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => gum({ audio: false, video: c && c.video && c.video.facingMode ? { facingMode: c.video.facingMode } : true });
  }, { facing, exercise, side, selfView });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/XNNPACK|Firebase|firebase|net::ERR|Failed to load resource|WebGL|GL_|gl_context|OpenGL/i.test(m.text())) errors.push(m.text()); });
  await page.route((u) => !u.href.startsWith(ORIGIN), (r) => r.abort());
  await page.goto(`${ORIGIN}/index.html${place ? '' : '?noplace'}#/train/${exercise}`); // ?noplace : sans l'assistant de placement (il retarde la calibration)
  await page.waitForSelector('.train [data-t="go"]', { timeout: 20000 });
  await page.addStyleTag({ content: HIDE_HUD });
  return { ctx, page, errors };
}
const overlay = (page) => page.evaluate(() => { const r = document.querySelector('.train'); return r && r.__overlay ? r.__overlay() : null; });
const stageShot = (page) => page.locator('.train .stage').screenshot({ type: 'png', scale: 'device' });

const results = []; let failed = 0;
const check = (ok, label, detail = '') => { if (!ok) failed++; results.push({ ok, label, detail }); console.log(`${ok ? '  ok ' : '  ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`); };
const pct = (v) => (v * 100).toFixed(2) + ' %';

async function overlayScenario(name, cam, kind, opts) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam.file}`] });
  try {
    const tool = await (await browser.newContext()).newPage(); await tool.goto(`${ORIGIN}/auth.html`).catch(() => {});
    for (const facing of ['user', 'environment']) {
      const tag = `${name} · caméra ${facing === 'user' ? 'avant (miroir)' : 'arrière'}`;
      console.log(`\n${tag}`);
      const { ctx, page, errors } = await openApp(browser, { ...opts, facing });
      await page.click('.train [data-t="go"]');
      // main de l'autre côté que le côté travaillé : l'app doit prévenir avant de commencer à compter
      const warned = opts.wrongSide ? page.waitForFunction(() => { const r = document.querySelector('.train'), c = r.querySelector('.cue span').textContent; return /wrongHand|main (droite|gauche)/.test(c) && !r.__overlay().calibrated ? c : false; }, null, { timeout: 45000 }).then((h) => h.jsonValue()).catch((e) => { if (process.env.E2E_DEBUG) console.log(String(e).slice(0, 300)); return null; }) : null;
      // A : la vidéo seule (compte à rebours 3-2-1, aucun squelette)
      await page.waitForFunction(() => { const v = document.querySelector('.train video'); return v && !v.hidden && v.videoWidth > 0; }, null, { timeout: 30000 });
      await page.waitForTimeout(500);
      const A = await decode(tool, await stageShot(page));
      const vinfo = await page.evaluate(() => { const v = document.querySelector('.train video'), c = document.querySelector('.train canvas.overlay'), a = v.getBoundingClientRect(), b = c.getBoundingClientRect(); return { vw: v.videoWidth, vh: v.videoHeight, v: [a.x, a.y, a.width, a.height], c: [b.x, b.y, b.width, b.height], dpr: devicePixelRatio }; });
      check(vinfo.vw === cam.fw && vinfo.vh === cam.fh, 'caméra simulée', `${vinfo.vw}×${vinfo.vh}, écran ${opts.viewport.width}×${opts.viewport.height} @${vinfo.dpr}`);
      check(vinfo.v.every((x, i) => Math.abs(x - vinfo.c[i]) < 0.01), 'boîte CSS du canevas = boîte de la vidéo', vinfo.c.map((x) => +x.toFixed(1)).join(', '));
      // B : pendant la série (image analysée + squelette dans le canevas)
      await page.waitForFunction((k) => { const o = document.querySelector('.train').__overlay(); return o.drawn && o.ticks > 25 && (k === 'hand' ? o.hand : o.lm); }, kind, { timeout: 60000 });
      const o1 = await overlay(page), png = await stageShot(page), o = await overlay(page);
      const o2 = await overlay(page);
      const B = await decode(tool, png);
      const sw = (await tool.evaluate((id) => window.__shots[id].w, B));
      const mA = await findMarks(tool, A), mB = await findMarks(tool, B);
      const keys = Object.keys(cam.fid).filter((k) => mA[k]);
      check(keys.length === 4, 'les 4 repères sont visibles dans la vidéo affichée');
      // 1. même cadrage dans le canevas que dans la vidéo
      const dBox = Math.max(...keys.map((k) => (mB[k] ? Math.hypot(mB[k].x - mA[k].x, mB[k].y - mA[k].y) : 1e9)));
      check(dBox / sw < 0.003, 'image du canevas = image de la vidéo (repères)', `écart max ${pct(dBox / sw)} de la largeur`);
      if (process.env.E2E_DEBUG) console.log(keys.map((k) => `${k}: A ${mA[k].x.toFixed(1)},${mA[k].y.toFixed(1)} n${mA[k].n} → B ${mB[k]?.x.toFixed(1)},${mB[k]?.y.toFixed(1)} n${mB[k]?.n}`).join('\n'), o.W, o.H, sw);
      // transformation image caméra → écran, mesurée sur les repères (indépendante du code de l'app)
      const fitAxis = (src, dst) => { const n = src.length, ms = src.reduce((a, b) => a + b, 0) / n, md = dst.reduce((a, b) => a + b, 0) / n; const a = src.reduce((s, v, i) => s + (v - ms) * (dst[i] - md), 0) / src.reduce((s, v) => s + (v - ms) ** 2, 0); return { a, b: md - a * ms }; };
      const cx = keys.map((k) => cam.fid[k][0] + MARK / 2), cy = keys.map((k) => cam.fid[k][1] + MARK / 2);
      const ax = fitAxis(cx, keys.map((k) => mA[k].x)), ay = fitAxis(cy, keys.map((k) => mA[k].y));
      check(Math.sign(ax.a) === (facing === 'user' ? -1 : 1) && Math.abs(Math.abs(ax.a) / ay.a - 1) < 0.01, facing === 'user' ? 'image affichée en miroir' : 'image affichée non retournée', `échelle x ${ax.a.toFixed(3)}, y ${ay.a.toFixed(3)}`);
      check(o.mirror === (facing === 'user'), 'miroir du squelette = miroir de la vidéo');
      // 2. points dessinés = points détectés, placés dans l'image affichée
      const raw = kind === 'hand' ? o.hand.map((l, i) => ({ i, ...l })) : o.lm.map((l, i) => ({ i, ...l }));
      const k2s = sw / o.W; // pixels du canevas → pixels de la capture
      const drawn = kind === 'hand' ? o.drawn.map((p, i) => ({ i, x: p.x * k2s, y: p.y * k2s })) : o.drawn.map((p) => ({ i: p.i, x: p.x * k2s, y: p.y * k2s }));
      check(drawn.length >= (kind === 'hand' ? 21 : 8), 'squelette dessiné', `${drawn.length} points`);
      let e1 = 0; for (const d of drawn) { const l = raw[d.i]; e1 = Math.max(e1, Math.hypot(ax.a * l.x * cam.fw + ax.b - d.x, ay.a * l.y * cam.fh + ay.b - d.y)); }
      check(e1 / sw < TOL, 'points dessinés sur les points détectés dans l’image affichée', `écart max ${pct(e1 / sw)} de la largeur (limite ${pct(TOL)})`);
      // 3. un point blanc est visible à cet endroit sur la capture
      const sh = await tool.evaluate((id) => window.__shots[id].h, B);
      // (corps : une articulation dont la visibilité frôle le seuil d'affichage peut apparaître / disparaître d'une image à l'autre
      //  entre la capture et la lecture de l'état : on ne contrôle au pixel que celles qui sont nettement visibles)
      const steady = (d) => kind === 'hand' || ((o1.lm?.[d.i]?.visibility ?? 0) >= 0.6 && (o.lm[d.i].visibility ?? 0) >= 0.6);
      const inView = drawn.filter((d) => steady(d) && d.x > 6 && d.y > 6 && d.x < sw - 6 && d.y < sh - 6);
      const wA = await whiteAt(tool, A, inView, 2);
      // la capture et la lecture de l'état ne sont pas simultanées : un point instable (cheville du modèle « lite ») peut avoir
      // bougé entre les deux → jusqu'à 3 captures, chacune comparée à l'état lu juste avant et juste après
      let seen = 0, tries = 0, shotId = B, before = o1, after = o;
      for (;;) {
        tries++;
        const pos = (st) => inView.map((d) => { const q = kind === 'hand' ? st.drawn?.[d.i] : st.drawn?.find((z) => z.i === d.i); return q ? { x: q.x * k2s, y: q.y * k2s } : { x: -99, y: -99 }; });
        const w1 = await whiteAt(tool, shotId, pos(before), 2), w2 = await whiteAt(tool, shotId, pos(after), 2);
        seen = inView.filter((_, k) => Math.max(w1[k], w2[k]) >= 235).length;
        if (process.env.E2E_DEBUG && seen !== inView.length) console.log(inView.map((d, k) => `${d.i}: ${d.x.toFixed(0)},${d.y.toFixed(0)} B${w1[k]}/${w2[k]} A${wA[k]}`).join('\n'));
        if (seen === inView.length || tries >= 3) break;
        before = await overlay(page); shotId = await decode(tool, await stageShot(page)); after = await overlay(page);
      }
      const already = wA.filter((v) => v >= 235).length;
      check(seen === inView.length, 'points visibles à l’écran (pixels blancs sur la capture)', `${seen}/${inView.length} (dont ${already} déjà blancs dans la photo${tries > 1 ? `, ${tries} captures` : ''})`);
      // 4. seconde détection indépendante sur la capture de l'image affichée (sans squelette)
      const re = await redetect(tool, A, kind);
      let best = null;
      // corps vu dans une capture en miroir : le modèle y échange la gauche et la droite de la personne (11 ↔ 12, 13 ↔ 14…)
      const idx = (i) => (kind === 'body' && facing === 'user' && i >= 11 ? (i % 2 ? i + 1 : i - 1) : i);
      for (const cand of re) { const errs = drawn.filter((d) => kind === 'hand' || (cand.pts[idx(d.i)].v ?? 1) > 0.5).map((d) => Math.hypot(cand.pts[idx(d.i)].x - d.x, cand.pts[idx(d.i)].y - d.y)).sort((a, b) => a - b); if (errs.length && (!best || errs[errs.length >> 1] < best.med)) best = { med: errs[errs.length >> 1], max: errs[errs.length - 1], n: errs.length, label: cand.label }; }
      check(!!best && best.med / sw < TOL, 'seconde détection indépendante sur la capture d’écran', best ? `écart médian ${pct(best.med / sw)}, max ${pct(best.max / sw)} (${best.n} points${kind === 'hand' ? '' : ' visibles'})` : 'rien détecté');
      if (kind === 'hand' && opts.expectLabel) {
        check(o.handInfo?.label === opts.expectLabel && o.handInfo.world, `main reconnue : ${opts.expectLabel === 'L' ? 'gauche' : 'droite'} (points 3D reçus)`, `étiquette ${o.handInfo?.label}, score ${o.handInfo?.score?.toFixed(2)}`);
        // la capture d'écran est en miroir avec la caméra avant : la détection indépendante y voit l'autre main
        const exp = (opts.expectLabel === 'L') !== (facing === 'user') ? 'Left' : 'Right';
        check(best?.label === exp, 'étiquette de la détection indépendante cohérente', `${best?.label} sur une capture ${facing === 'user' ? 'en miroir' : 'non retournée'}`);
      }
      if (opts.rotate) {
        // la taille de l'écran change pendant la série (rotation, écran partagé) : le canevas suit la nouvelle boîte, le squelette reste sur l'image
        await page.setViewportSize(opts.rotate); const t0 = (await overlay(page)).ticks;
        await page.waitForFunction((n) => document.querySelector('.train').__overlay().ticks > n + 6, t0, { timeout: 30000 });
        await shotCheck(page, tool, cam, kind, facing, `après changement de taille de l’écran (${opts.rotate.width}×${opts.rotate.height})`);
        await page.setViewportSize(opts.viewport);
      }
      if (opts.selfOff) {
        // vidéo selfie masquée : plus d'image (ni vidéo ni canevas), le squelette seul reste dessiné
        const t0 = (await overlay(page)).ticks;
        await page.evaluate(() => document.querySelector('.train [data-t="video"]').click());
        await page.waitForFunction((n) => { const q = document.querySelector('.train').__overlay(); return !q.selfView && q.ticks > n + 5 && q.drawn; }, t0, { timeout: 30000 });
        const q1 = await overlay(page), id = await decode(tool, await stageShot(page)), q2 = await overlay(page);
        const mk = await findMarks(tool, id), k = (await tool.evaluate((z) => window.__shots[z].w, id)) / q2.W;
        const cand = q2.drawn.filter((d) => (q1.lm?.[d.i]?.visibility ?? 0) >= 0.6 && (q2.lm?.[d.i]?.visibility ?? 0) >= 0.6);
        const w = await whiteAt(tool, id, cand.map((d) => ({ x: d.x * k, y: d.y * k })), 3);
        check(Object.values(mk).every((v) => !v) && w.filter((v) => v >= 235).length >= cand.length - 1, 'vidéo masquée : image cachée, squelette toujours dessiné', `${w.filter((v) => v >= 235).length}/${cand.length} points visibles, repères visibles : ${Object.values(mk).filter(Boolean).length}`);
      }
      if (opts.wrongSide) {
        const cueTxt = await warned;
        check(!!cueTxt, 'mauvaise main : avertissement, comptage en attente', `« ${String(cueTxt).slice(0, 60)} »`);
        await page.waitForFunction(() => document.querySelector('.train').__overlay().calibrated, null, { timeout: 40000 }).catch(() => {});
        check((await overlay(page)).calibrated, 'mauvaise main : après quelques secondes, le comptage démarre quand même');
      }
      check(o2.ticks >= o.ticks && errors.length === 0, 'aucune erreur dans la console', errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  } finally { await browser.close(); }
}

// Vérification sur une seule capture : repères lus dans l'image dessinée par le canevas → transformation image → écran,
// puis points dessinés comparés aux points détectés (utilisée après un changement de taille de l'écran et en mode guidé).
async function shotCheck(page, tool, cam, kind, facing, label) {
  let res = null;
  for (let tries = 0; tries < 3 && !(res && res.ok); tries++) {
    const o1 = await overlay(page), id = await decode(tool, await stageShot(page)), o = await overlay(page);
    if (!o.drawn || !o1.drawn) { await page.waitForTimeout(400); continue; }
    const sw = await tool.evaluate((k) => window.__shots[k].w, id), sh = await tool.evaluate((k) => window.__shots[k].h, id);
    const m = await findMarks(tool, id), keys = Object.keys(cam.fid).filter((k) => m[k]);
    if (keys.length < 4) { res = { ok: false, why: `${keys.length}/4 repères visibles` }; continue; }
    const fitAxis = (src, dst) => { const n = src.length, ms = src.reduce((a, b) => a + b, 0) / n, md = dst.reduce((a, b) => a + b, 0) / n; const a = src.reduce((q, v, i) => q + (v - ms) * (dst[i] - md), 0) / src.reduce((q, v) => q + (v - ms) ** 2, 0); return { a, b: md - a * ms }; };
    const ax = fitAxis(keys.map((k) => cam.fid[k][0] + MARK / 2), keys.map((k) => m[k].x)), ay = fitAxis(keys.map((k) => cam.fid[k][1] + MARK / 2), keys.map((k) => m[k].y));
    const k2s = sw / o.W, raw = kind === 'hand' ? o.hand : o.lm;
    const pts = (st) => (kind === 'hand' ? st.drawn.map((q, i) => ({ i, x: q.x * k2s, y: q.y * k2s })) : st.drawn.map((q) => ({ i: q.i, x: q.x * k2s, y: q.y * k2s })));
    const drawn = pts(o);
    let e = 0; for (const d of drawn) { const l = raw[d.i]; e = Math.max(e, Math.hypot(ax.a * l.x * cam.fw + ax.b - d.x, ay.a * l.y * cam.fh + ay.b - d.y)); }
    const steady = (d) => kind === 'hand' || ((o1.lm?.[d.i]?.visibility ?? 0) >= 0.6 && (o.lm[d.i].visibility ?? 0) >= 0.6);
    const inView = drawn.filter((d) => steady(d) && d.x > 6 && d.y > 6 && d.x < sw - 6 && d.y < sh - 6);
    const before = pts(o1), find = (arr, d) => arr.find((q) => q.i === d.i) || { x: -99, y: -99 };
    const w1 = await whiteAt(tool, id, inView.map((d) => find(before, d)), 2), w2 = await whiteAt(tool, id, inView, 2);
    const seen = inView.filter((_, k) => Math.max(w1[k], w2[k]) >= 235).length;
    const mirrorOk = Math.sign(ax.a) === (facing === 'user' ? -1 : 1) && o.mirror === (facing === 'user');
    res = { ok: e / sw < TOL && seen === inView.length && mirrorOk && drawn.length >= (kind === 'hand' ? 21 : 8), why: `écart max ${pct(e / sw)} de la largeur, ${seen}/${inView.length} points visibles à l’écran, canevas ${o.W}×${o.H}, miroir ${mirrorOk ? 'correct' : 'FAUX'}` };
    await tool.evaluate((k) => { window.__shots[k] = null; }, id);
  }
  check(!!res && res.ok, label, res ? res.why : 'aucun squelette dessiné');
}

// ---------- Synchronisation : main en mouvement rapide ----------
// La photo de la main va et vient (±amp px, 2 s par aller-retour) avec un repère magenta collé dessus. À chaque mesure on lit,
// dans la même tâche JavaScript, la position du poignet dessiné et celle du repère dans l'image affichée par le canevas :
// leur écart doit rester constant (le squelette « colle » à la main). On vérifie aussi sur de vraies captures d'écran.
async function syncScenario(name, cam, opts) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  console.log(`\n${name}`);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam.file}`] });
  try {
    const tool = await (await browser.newContext()).newPage(); await tool.goto(`${ORIGIN}/auth.html`).catch(() => {});
    const { ctx, page, errors } = await openApp(browser, { ...opts, facing: 'user' });
    if (opts.throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle }); }
    await page.click('.train [data-t="go"]');
    await page.waitForFunction(() => { const o = document.querySelector('.train').__overlay(); return o.drawn && o.ticks > 12 && o.hand; }, null, { timeout: 90000 });
    const samples = [];
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(90 + (i % 5) * 23);
      const sm = await page.evaluate(() => {
        const root = document.querySelector('.train'), o = root.__overlay(), c = root.querySelector('canvas.overlay');
        if (!o.drawn) return null;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let sx = 0, n = 0;
        for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 200) { sx += x + 0.5; n++; } }
        return n > 20 ? { mx: sx / n, wx: o.drawn[0].x, W: o.W, cost: o.cost, ticks: o.ticks, t: performance.now() } : null;
      });
      if (sm) samples.push(sm);
    }
    check(samples.length >= 35, 'mesures prises pendant le mouvement', `${samples.length}/45`);
    const W = samples[0].W, diffs = samples.map((q) => q.wx - q.mx), med = diffs.slice().sort((a, b) => a - b)[diffs.length >> 1];
    const travel = Math.max(...samples.map((q) => q.mx)) - Math.min(...samples.map((q) => q.mx));
    const dt = (samples[samples.length - 1].t - samples[0].t) / 1000, hz = (samples[samples.length - 1].ticks - samples[0].ticks) / dt;
    const cost = samples.reduce((a, q) => a + q.cost, 0) / samples.length;
    const dev = diffs.map((d) => Math.abs(d - med)).sort((a, b) => a - b), err = dev[dev.length - 1], mid = dev[dev.length >> 1];
    check(travel / W > 0.25, 'la main traverse bien l’écran', `course ${pct(travel / W)} de la largeur, vitesse max ≈ ${pct((travel / W) * Math.PI / 2)} de la largeur par seconde`);
    const info = `analyse ${cost.toFixed(0)} ms par image, ${hz.toFixed(1)} analyses/s${opts.throttle ? `, processeur ralenti ${opts.throttle}×` : ''}`;
    // Un retard d'affichage décalerait le squelette à chaque image (écart médian ≈ vitesse × retard, soit plusieurs % ici).
    // Processeur ralenti (< 5 analyses / s) : le modèle lui-même perd parfois la main entre deux images très éloignées ;
    // on exige alors un écart médian < 2 % et on affiche l'écart maximal pour information.
    if (opts.throttle) check(mid / W < 0.02, 'squelette synchronisé avec l’image affichée (main en mouvement)', `écart médian ${pct(mid / W)}, max ${pct(err / W)} de la largeur ; ${info}`);
    else check(err / W < TOL && mid / W < 0.01, 'squelette synchronisé avec l’image affichée (main en mouvement)', `écart max ${pct(err / W)}, médian ${pct(mid / W)} de la largeur ; ${info}`);
    check(hz <= 20.5, 'cadence d’analyse de la main plafonnée', `${hz.toFixed(1)}/s (plafond ≈ 18/s)`);
    // captures d'écran réelles : un point blanc (le poignet) se trouve à l'écart habituel du repère
    let hits = 0, shots = 0;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(130 + i * 37);
      const id = await decode(tool, await stageShot(page));
      const m = (await findMarks(tool, id)).magenta; if (!m) continue;
      const sw = await tool.evaluate((k) => window.__shots[k].w, id); shots++;
      const o = await overlay(page); if (!o.drawn) continue;
      const wy = o.drawn[0].y * (sw / o.W); // hauteur du poignet : constante (déplacement horizontal)
      const [w] = await whiteAt(tool, id, [{ x: m.x + med * (sw / W), y: wy }], Math.round(sw * TOL));
      if (w >= 235) hits++;
      await tool.evaluate((k) => { window.__shots[k] = null; }, id);
    }
    check(shots >= 8 && hits >= (opts.throttle ? shots / 2 : shots), 'captures d’écran en mouvement : poignet dessiné à sa place', `${hits}/${shots} captures (à moins de ${pct(TOL)} de la largeur)`);
    check(errors.length === 0, 'aucune erreur dans la console', errors.slice(0, 2).join(' | '));
    await ctx.close();
  } finally { await browser.close(); }
}

// ---------- Scénarios ----------
const PHONE = { viewport: { width: 412, height: 915 }, dpr: 2.625 };
const hasNew = fs.readFileSync(path.join(WWW, 'js/train.js'), 'utf8').includes('__overlay');
if (!hasNew) skip('cette copie de l’app n’expose pas l’état de la superposition (version antérieure à 1.11)');

// main : téléphone en portrait (image 720 × 960), puis image paysage 960 × 720 fortement rognée par « cover »
const handP = still('hand_portrait', { photo: 'hand', crop: '190:215:195:25', fw: 720, fh: 960, box: [420, 480], vis: { x: 0.6, y: 0.86 } });
await overlayScenario('Main · portrait 720×960', handP, 'hand', { ...PHONE, exercise: 'thumb_opp', side: 'L', expectLabel: 'L', rotate: { width: 600, height: 800 } });
const handL = still('hand_landscape', { photo: 'hand', crop: '190:215:195:25', fw: 960, fh: 720, box: [320, 400], vis: { x: 0.34, y: 0.9 } });
await overlayScenario('Main · image paysage 960×720 rognée', handL, 'hand', { ...PHONE, exercise: 'thumb_opp', side: 'R', expectLabel: 'L', wrongSide: true });
// corps entier : portrait, puis téléphone couché (écran paysage, DPR 2)
const bodyP = still('body_portrait', { photo: 'body', fw: 720, fh: 960, box: [430, 760], vis: { x: 0.6, y: 0.86 } });
await overlayScenario('Corps · portrait 720×960', bodyP, 'body', { ...PHONE, exercise: 'squat', rotate: { width: 600, height: 800 } });
const bodyL = still('body_landscape', { photo: 'body', fw: 960, fh: 720, box: [300, 300], vis: { x: 0.9, y: 0.44 } });
await overlayScenario('Corps · téléphone couché 915×412', bodyL, 'body', { viewport: { width: 915, height: 412 }, dpr: 2, exercise: 'squat', selfOff: true });


// ---------- Assistant de placement : la phase s'ouvre avant la calibration, « Passer » la ferme et la calibration prend la suite ----------
async function placementScenario(name, cam, kind, opts) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  console.log(`\n${name}`);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam.file}`] });
  try {
    const { ctx, page, errors } = await openApp(browser, { ...opts, facing: 'user', place: true });
    await page.click('.train [data-t="go"]');
    await page.waitForFunction(() => { const p = document.querySelector('.train .place'); return p && !p.hidden && p.querySelector('.place-txt').textContent; }, null, { timeout: 60000 });
    check(true, 'la phase de placement s’ouvre');
    const o = await overlay(page); check(!o.calibrated, 'pas encore de calibration pendant le placement');
    await page.waitForFunction(() => document.querySelector('.train').__overlay().ticks > 8, null, { timeout: 60000 });
    const guide = await page.evaluate(() => document.querySelector('.train .place').dataset.state);
    check(['wait', 'bad', 'ok'].includes(guide), 'état du placement affiché', guide);
    await page.click('.train [data-t="place-skip"]');
    await page.waitForFunction(() => document.querySelector('.train .place').hidden, null, { timeout: 5000 });
    const t0 = (await overlay(page)).ticks;
    await page.waitForFunction(({ n, k }) => { const q = document.querySelector('.train').__overlay(); return q.ticks > n + 6 && (k !== 'hand' || q.calibrated); }, { n: t0, k: kind }, { timeout: 60000 });
    check(true, '« Passer » : l’analyse continue et la calibration prend la suite' + (kind === 'hand' ? '' : ' (corps : image fixe, plan non vérifié)'));
    check(errors.length === 0, 'aucune erreur dans la console', errors.slice(0, 2).join(' | '));
    await ctx.close();
  } finally { await browser.close(); }
}
await placementScenario('Placement · corps', bodyP, 'body', { ...PHONE, exercise: 'squat' });
await placementScenario('Placement · main', handP, 'hand', { ...PHONE, exercise: 'thumb_opp', side: 'L' });

// ---------- Main gauche / droite ----------
async function handednessScenario() {
  const name = 'Main gauche / droite';
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  console.log(`\n${name}`);
  // (a) photo d'une main DROITE, paume visible (pouce à droite de l'image) : le modèle répond « Right » ; retournée : « Left »
  const browser0 = await chromium.launch();
  try {
    const tool = await browser0.newPage(); await tool.goto(`${ORIGIN}/auth.html`).catch(() => {});
    const b64 = fs.readFileSync(path.join(MEDIA, 'sheet.jpg')).toString('base64');
    const r = await tool.evaluate(async (b64) => {
      const mp = await import('/vendor/mediapipe/vision_bundle.mjs'); const { parseHands } = await import('/js/hand.js');
      const fset = await mp.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      const hl = await mp.HandLandmarker.createFromOptions(fset, { baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numHands: 1 });
      const im = new Image(); im.src = 'data:image/jpeg;base64,' + b64; await im.decode();
      const out = {};
      for (const flip of [false, true]) {
        const c = document.createElement('canvas'); c.width = 441; c.height = 528; const g = c.getContext('2d');
        if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
        g.drawImage(im, 294, 175, 147, 176, 0, 0, 441, 528); // main ouverte en bas à droite de la planche
        const res = hl.detect(c), h = parseHands(res)[0];
        out[flip ? 'flip' : 'plain'] = h ? { label: h.label, score: h.score, raw: res.handedness[0][0].categoryName, thumbRight: h.lm[4].x > h.lm[17].x, world: !!h.world } : null;
      }
      return out;
    }, b64);
    check(r.plain?.thumbRight && r.plain.label === 'R' && r.plain.world, 'photo d’une main droite (paume visible, non retournée) → « droite »', `modèle « ${r.plain?.raw} » ${r.plain?.score?.toFixed(2)}`);
    check(r.flip && !r.flip.thumbRight && r.flip.label === 'L', 'même photo retournée en miroir → « gauche »', `modèle « ${r.flip?.raw} » ${r.flip?.score?.toFixed(2)}`);
  } finally { await browser0.close(); }
  // (b) deux mains dans l'image (une gauche, une droite : la main qui aide) : l'app suit celle du côté travaillé
  const two = still('hands_two', { photo: 'hands', crop: '225:330:65:80', fw: 720, fh: 960, box: [430, 640], vis: { x: 0.6, y: 0.86 } });
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${two.file}`] });
  try {
    const picked = {};
    for (const side of ['L', 'R']) {
      const { ctx, page } = await openApp(browser, { ...PHONE, facing: 'user', exercise: 'thumb_opp', side });
      await page.click('.train [data-t="go"]');
      await page.waitForFunction(() => { const o = document.querySelector('.train').__overlay(); return o.drawn && o.ticks > 14 && o.hand; }, null, { timeout: 60000 });
      const o = await overlay(page);
      picked[side] = { label: o.handInfo?.label, x: o.hand[0].x };
      check(o.handInfo?.label === side, `deux mains visibles, côté travaillé ${side === 'L' ? 'gauche' : 'droit'} → main ${side === 'L' ? 'gauche' : 'droite'} suivie`, `étiquette ${o.handInfo?.label} (${o.handInfo?.score?.toFixed(2)}), poignet x = ${o.hand[0].x.toFixed(2)}`);
      await ctx.close();
    }
    check(Math.abs(picked.L.x - picked.R.x) > 0.08, 'ce sont bien deux mains différentes', `x = ${picked.L.x.toFixed(2)} et ${picked.R.x.toFixed(2)}`);
  } finally { await browser.close(); }
}
await handednessScenario();

// mode guidé (miroir + squelette sans comptage) : même superposition
async function guidedScenario(name, cam, kind, opts) {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  console.log(`\n${name}`);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam.file}`] });
  try {
    const tool = await (await browser.newContext()).newPage(); await tool.goto(`${ORIGIN}/auth.html`).catch(() => {});
    for (const facing of ['user', 'environment']) {
      const { ctx, page, errors } = await openApp(browser, { ...opts, facing });
      if (await page.isVisible('.train [data-t="guided"]')) await page.click('.train [data-t="guided"]'); // exercice sans comptage : déjà en mode guidé
      await page.click('.train [data-t="go"]');
      await page.waitForFunction((k) => { const o = document.querySelector('.train').__overlay(); return o.drawn && (k === 'hand' ? o.hand : o.lm); }, kind, { timeout: 60000 });
      await page.waitForTimeout(1500);
      await shotCheck(page, tool, cam, kind, facing, `mode guidé, caméra ${facing === 'user' ? 'avant (miroir)' : 'arrière'} : squelette sur l’image`);
      check(errors.length === 0, 'aucune erreur dans la console', errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  } finally { await browser.close(); }
}
await guidedScenario('Corps · mode guidé (miroir)', bodyP, 'body', { ...PHONE, exercise: 'squat' });
await guidedScenario('Main · mode guidé (glissements tendineux)', handP, 'hand', { ...PHONE, exercise: 'tendon_glides', side: 'L' });

// synchronisation : main qui traverse l'écran, à vitesse normale puis avec un processeur 2× plus lent
const handM = moving('hand_moving', { photo: 'hand', crop: '190:215:195:25', fw: 480, fh: 640, box: [260, 300], amp: 60 });
await syncScenario('Synchronisation · main en mouvement', handM, { ...PHONE, exercise: 'thumb_opp' });
await syncScenario('Synchronisation · main en mouvement, processeur ralenti 2×', handM, { ...PHONE, exercise: 'thumb_opp', throttle: 2 });

console.log(failed ? `\nSuperposition (bout en bout) : ${failed} ÉCHEC(S) sur ${results.length} vérifications` : `\nSuperposition (bout en bout) : ${results.length} vérifications OK`);
server.close();
process.exit(failed ? 1 : 0);
