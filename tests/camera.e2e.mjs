// Séance et mesure d'amplitude dans Chromium (caméra factice) : fermeture pendant l'ouverture de la caméra (aucune piste active),
// fermeture pendant le compte à rebours (plus de voix ni de série en arrière-plan), confirmation en quittant, série à 0 répétition.
//   node tests/camera.e2e.mjs     (MOBILIS_WWW : dossier de l'app) — sans Playwright / Chromium : ignoré (code 0).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.resolve(process.env.MOBILIS_WWW || path.join(HERE, '../www'));
let chromium;
for (const base of [import.meta.url, '/opt/npm-tools/node_modules/']) { try { ({ chromium } = createRequire(base)('playwright')); break; } catch (_) {} }
if (!chromium) { console.log('Caméra (bout en bout) : IGNORÉ — Playwright non installé'); process.exit(0); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(WWW, path.normalize(u === '/' ? '/index.html' : u));
  if (!f.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const ORIGIN = `http://127.0.0.1:${server.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = { role: 'patient', trial: false, name: 'T', region: 'knee', pathology: 'pfps', painBase: 3, irritability: 'med', days: [0, 1, 2, 3, 4, 5, 6], perWeek: 7, phase: 1, baseLevel: 2, levels: {}, startDate: Date.now() - 20 * 86400000, joinedAt: Date.now() - 20 * 86400000, lang: 'en', triage: {}, plan: { phase: 2, ids: ['squat', 'sit_stand', 'wall_sit', 'step_down'] }, lockPhase: false, doseOver: { squat: { sets: 2, reps: 3, hold: 0, rest: 0 } } };

let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(`  ${c ? 'ok ' : 'ÉCHEC'} ${msg}`); };
let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, permissions: ['camera', 'microphone'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  erreur page :', e.message));
  await p.addInitScript(() => {
    window.__tracks = []; window.__gumDelay = 0; window.__spoken = [];
    const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { await new Promise((r) => setTimeout(r, window.__gumDelay)); const s = await g(c); s.getTracks().forEach((t) => window.__tracks.push(t)); return s; };
    const o = window.speechSynthesis; if (o) { const sp = o.speak.bind(o); o.speak = (u) => { window.__spoken.push(u.text); try { sp(u); } catch (e) {} }; }
  });
  const reset = async () => {
    await p.goto(ORIGIN);
    await p.evaluate((pr) => { localStorage.setItem('mobilis.localUser', JSON.stringify({ uid: 'local', local: true, name: '' })); localStorage.setItem('mobilis.data.local', JSON.stringify({ profile: pr, sessions: [], journal: [] })); localStorage.setItem('mobilis.settings', JSON.stringify({ voice: 'off' })); }, PROFILE);
    await p.goto(ORIGIN + '#/home'); await p.reload(); await sleep(700);
    await p.evaluate(() => { window.__tracks.forEach((t) => t.stop()); window.__tracks = []; window.__gumDelay = 0; window.__spoken.length = 0; });
  };
  const live = () => p.evaluate(() => window.__tracks.filter((t) => t.readyState === 'live').length);
  const items = () => p.evaluate(() => JSON.parse(localStorage.getItem('mobilis.data.local')).sessions.flatMap((s) => s.items));
  const waitRep = async () => { for (let i = 0; i < 60; i++) { if (+(await p.evaluate(() => document.querySelector('#cnt')?.textContent || 0)) >= 1) return; await sleep(500); } };
  const hash = () => p.evaluate(() => location.hash);

  console.log('M1 — caméra laissée allumée si on ferme pendant l’ouverture');
  for (const wait of [100, 500]) {
    await reset(); await p.evaluate(() => (window.__gumDelay = 700));
    await p.goto(ORIGIN + '#/train/squat'); await sleep(500);
    await p.click('[data-t="go"]'); await sleep(wait); await p.click('[data-t="close"]'); await sleep(2500);
    ok((await live()) === 0, `séance : fermée ${wait} ms après « Démarrer » → 0 piste active (${await live()})`);
  }
  await reset(); await p.evaluate(() => (window.__gumDelay = 700));
  await p.goto(ORIGIN + '#/rom/kn_flex/L'); await sleep(800);
  await p.click('[data-r="go"]'); await sleep(150); await p.goto(ORIGIN + '#/home'); await sleep(2500);
  ok((await live()) === 0, `amplitude : quittée pendant l’ouverture → 0 piste active (${await live()})`);

  console.log('M2 — fermeture pendant le compte à rebours');
  await reset();
  await p.goto(ORIGIN + '?noplace#/train/squat'); await sleep(500);
  await p.click('[data-t="go"]');
  let seen = false; for (let i = 0; i < 60 && !seen; i++) { seen = await p.evaluate(() => !!document.querySelector('.bignum')); if (!seen) await sleep(250); }
  ok(seen, 'compte à rebours affiché');
  await p.click('[data-t="close"]'); await sleep(200);
  const n0 = await p.evaluate(() => window.__spoken.length); await sleep(3500);
  ok((await p.evaluate(() => window.__spoken.length)) === n0, 'aucune voix après la fermeture');
  ok(!(await p.evaluate(() => !!document.querySelector('.train'))) && (await live()) === 0, 'écran de séance fermé, caméra coupée');

  console.log('M3 / M4 — mode guidé : confirmation en quittant, série à 0');
  await reset();
  await p.goto(ORIGIN + '#/train/squat'); await sleep(500);
  await p.click('[data-t="guided"]'); await sleep(200); await p.click('[data-t="go"]');
  await p.click('[data-t="end"]'); await sleep(400);
  ok(await p.evaluate(() => !!document.querySelector('[data-e="manual"]')), 'série à 0 : « saisie manuelle ou réessayer »');
  await p.click('[data-e="manual"]'); await p.click('[data-m="ok"]'); await sleep(300);
  const txt = await p.evaluate(() => document.querySelector('.sheet')?.innerText || '');
  ok(/manual/i.test(txt) && !/clean technique/i.test(txt), 'saisie manuelle : marquée « manuel », pas de « Clean technique »');
  await p.click('[data-s="redo"]'); await sleep(300);
  await p.click('[data-t="go"]'); await sleep(200); await p.click('[data-t="end"]'); await sleep(400);
  await p.click('[data-e="leave"]'); await sleep(500);
  ok((await hash()) === '#/home' && (await items()).length === 0, 'série à 0 abandonnée : rien d’enregistré');

  await reset();
  await p.goto(ORIGIN + '#/train/squat'); await sleep(500);
  await p.click('[data-t="guided"]'); await sleep(200); await p.click('[data-t="go"]'); await waitRep();
  await p.click('[data-t="close"]'); await sleep(300);
  ok(await p.evaluate(() => !!document.querySelector('.quit-sheet')), 'répétitions en cours : confirmation en quittant');
  await p.click('[data-q="continue"]'); await sleep(200);
  ok(!(await p.evaluate(() => !!document.querySelector('.quit-sheet'))) && (await hash()).startsWith('#/train'), '« Continuer » reste dans la séance');
  await p.click('[data-t="close"]'); await sleep(200); await p.click('[data-q="discard"]'); await sleep(500);
  ok((await hash()) === '#/home' && (await items()).length === 0, '« Abandonner » : rien d’enregistré');

  await reset();
  await p.goto(ORIGIN + '#/train/squat'); await sleep(500);
  await p.click('[data-t="guided"]'); await sleep(200); await p.click('[data-t="go"]'); await waitRep();
  await p.click('[data-t="close"]'); await sleep(200); await p.click('[data-q="save"]'); await sleep(900);
  const sum = await p.evaluate(() => document.querySelector('.sheet')?.innerText || '');
  ok(/summary|set/i.test(sum) && !/clean technique/i.test(sum), 'enregistrer : la série en cours est terminée et résumée (guidé : pas de « Clean technique »)');
  await p.click('[data-s="finish"]'); await sleep(300); await p.click('[data-s="save"]'); await sleep(1200);
  const it = await items();
  ok(it.length === 1 && it[0].sets.length === 1 && it[0].sets[0].reps >= 1, 'exercice enregistré avec la série faite');

  await reset();
  await p.goto(ORIGIN + '#/train/squat'); await sleep(500);
  await p.click('[data-t="guided"]'); await sleep(200); await p.click('[data-t="go"]'); await waitRep(); await p.click('[data-t="end"]'); await sleep(900);
  await p.click('[data-s="next"]'); await sleep(400);
  await p.goto(ORIGIN + '#/home'); await sleep(1200); // retour système : la série terminée est conservée
  const it2 = await items();
  ok(it2.length === 1 && it2[0].partial === true && it2[0].sets.length === 1, 'quitté sans confirmation : séries terminées enregistrées (partiel)');
} finally { if (browser) await browser.close(); server.close(); }
console.log(fails ? `\nCaméra (bout en bout) : ${fails} ÉCHEC(S)` : '\nCaméra (bout en bout) : vert.');
process.exit(fails ? 1 : 0);
