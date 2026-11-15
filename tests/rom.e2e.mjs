// Mesure d'amplitude avec le VRAI modèle de pose (MediaPipe, www/models) dans Chromium : une photo réelle est analysée sous plusieurs
// cadrages (original, tournée de ±20°, rognée en format paysage / carré) ; l'angle de flexion du genou et de la hanche calculé par
// data/romtests.js doit rester le même à ± 8° (l'angle intérieur ne dépend ni de la rotation ni du rapport largeur/hauteur de l'image :
// vérifie la conversion en pixels carrés et la robustesse du modèle).
//   node tests/rom.e2e.mjs     (MOBILIS_WWW, MOBILIS_E2E_MEDIA : comme tests/overlay.e2e.mjs)
// Sans modèle, Playwright ou photo (réseau coupé) : ignoré (code 0).
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
const TOL = 8, TOL_ARM = 15; // genou / hanche ± 8° ; coude (petit segment, modèle moins précis) ± 15°
// Photo d'un joueur seul, de profil, genou fléchi (les photos à plusieurs personnes font changer le sujet suivi d'un cadrage à l'autre).
const skip = (why) => { console.log(`Amplitude (bout en bout) : IGNORÉ — ${why}`); process.exit(0); };
if (!fs.existsSync(path.join(WWW, 'models', 'pose_landmarker_lite.task'))) skip('modèle absent (npm run fetch-model)');
let chromium;
for (const base of [import.meta.url, '/opt/npm-tools/node_modules/']) { try { ({ chromium } = createRequire(base)('playwright')); break; } catch (_) {} }
if (!chromium) skip('Playwright non installé');
const PHOTOS = {
  body2: 'https://raw.githubusercontent.com/CMU-Perceptual-Computing-Lab/openpose/master/examples/media/COCO_val2014_000000000474.jpg',
};
fs.mkdirSync(MEDIA, { recursive: true });
for (const [k, url] of Object.entries(PHOTOS)) {
  const f = path.join(MEDIA, `${k}.jpg`);
  if (fs.existsSync(f) && fs.statSync(f).size > 5000) continue;
  try { execFileSync('curl', ['-sS', '-f', '-m', '40', '-o', f, url], { stdio: 'ignore' }); } catch (_) { try { fs.unlinkSync(f); } catch (__) {} }
  if (!fs.existsSync(f) || fs.statSync(f).size < 5000) skip(`photo indisponible (${url})`);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  let f = u.startsWith('/media/') ? path.join(MEDIA, path.basename(u)) : path.join(WWW, path.normalize(u === '/' ? '/index.html' : u));
  if (!u.startsWith('/media/') && !f.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

let browser, fails = 0, checked = 0;
try {
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  erreur page :', e.message));
  await page.goto(`${ORIGIN}/auth.html`).catch(() => {});
  const out = await page.evaluate(async ({ photos }) => {
    const mp = await import('/vendor/mediapipe/vision_bundle.mjs');
    const fs_ = await mp.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    const pl = await mp.PoseLandmarker.createFromOptions(fs_, { baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1 });
    const R = await import('/js/data/romtests.js');
    const res = {};
    for (const name of photos) {
      const im = new Image(); im.src = `/media/${name}.jpg`; await im.decode();
      const variants = {
        original: (c, g) => { c.width = im.width; c.height = im.height; g.drawImage(im, 0, 0); },
        rot20: (c, g) => { const s = Math.hypot(im.width, im.height); c.width = c.height = Math.round(s); g.fillStyle = '#777'; g.fillRect(0, 0, s, s); g.translate(s / 2, s / 2); g.rotate((20 * Math.PI) / 180); g.drawImage(im, -im.width / 2, -im.height / 2); },
        rotm20: (c, g) => { const s = Math.hypot(im.width, im.height); c.width = c.height = Math.round(s); g.fillStyle = '#777'; g.fillRect(0, 0, s, s); g.translate(s / 2, s / 2); g.rotate((-20 * Math.PI) / 180); g.drawImage(im, -im.width / 2, -im.height / 2); },
        wide: (c, g) => { c.width = Math.round(im.width * 1.8); c.height = im.height; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, (c.width - im.width) / 2, 0); },
        tall: (c, g) => { c.width = im.width; c.height = Math.round(im.height * 1.8); g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, (c.height - im.height) / 2); },
      };
      res[name] = {};
      for (const [vn, draw] of Object.entries(variants)) {
        const c = document.createElement('canvas'), g = c.getContext('2d'); draw(c, g);
        const r = pl.detect(c); const lm = r.landmarks[0];
        if (!lm) { res[name][vn] = null; continue; }
        const f = { lm, w: c.width, h: c.height }, o = {};
        for (const side of ['L', 'R']) for (const id of ['kn_flex', 'hip_flex', 'el_flex']) { const m = R.measure(id, f, side); if (m && m.vis >= 0.6) o[`${id}_${side}`] = m.deg; }
        res[name][vn] = o;
      }
    }
    return res;
  }, { photos: Object.keys(PHOTOS) });
  for (const [name, vs] of Object.entries(out)) {
    const base = vs.original;
    if (!base) { console.log(`  ${name} : aucune pose détectée sur l'original (ignoré)`); continue; }
    for (const [vn, o] of Object.entries(vs)) {
      if (vn === 'original') continue;
      if (!o) { console.log(`  ${name}/${vn} : pose non détectée (ignoré)`); continue; }
      for (const k of Object.keys(base)) {
        if (o[k] == null) continue;
        checked++; const d = Math.abs(o[k] - base[k]), tol = k.startsWith('el_') ? TOL_ARM : TOL;
        if (d > tol) { fails++; console.log(`  ÉCHEC ${name}/${vn} ${k} : ${o[k].toFixed(1)}° contre ${base[k].toFixed(1)}° (écart ${d.toFixed(1)}° > ${tol}°)`); } else console.log(`  ok  ${name}/${vn} ${k} : ${o[k].toFixed(1)}° (original ${base[k].toFixed(1)}°)`);
      }
    }
    console.log(`  ${name} original :`, Object.entries(base).map(([k, v]) => `${k}=${v.toFixed(0)}°`).join(' '));
  }
  if (!checked) { fails++; console.log('  ÉCHEC : aucune comparaison possible'); }
} finally { if (browser) await browser.close(); server.close(); }
console.log(fails ? `\nAmplitude (bout en bout) : ${fails} ÉCHEC(S)` : `\nAmplitude (bout en bout) : vert (${checked} comparaisons, genou / hanche ± ${TOL}°, coude ± ${TOL_ARM}°).`);
process.exit(fails ? 1 : 0);
