// Parité www/ ↔ dist/ (stratégie strangler, docs/adr/0005-strangler.md) : la même app, servie depuis la source (www) et
// depuis le build Vite (dist), doit afficher EXACTEMENT le même texte sur chaque écran, sans erreur de page, en patient et
// en clinicien, dans plusieurs langues (dont l'arabe, chargé par import dynamique).
//   npm run build && node tests/parity.e2e.mjs    — sans Playwright/Chromium ou sans dist/ : ignoré (code 0).
//   Dès qu'un module legacy réexporte src/, www/ n'est plus servable seul : comparer à v1.15 avec
//   git worktree add ../mobilis-v115 main && MOBILIS_BASE=../mobilis-v115/www npm run test:parity
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// MOBILIS_BASE : app de référence (par défaut www/ ; pendant la migration : www/ d'une copie de main / v1.15).
const A = path.resolve(process.env.MOBILIS_BASE || path.join(HERE, '../www'));
const B = path.resolve(process.env.MOBILIS_WWW || path.join(HERE, '../dist'));
const skip = (why) => { console.log(`Parité www/dist : IGNORÉ — ${why}`); process.exit(0); };
if (!fs.existsSync(path.join(B, 'index.html'))) skip(`${B} absent (npm run build)`);
let chromium;
for (const base of [import.meta.url, '/opt/npm-tools/node_modules/']) { try { ({ chromium } = createRequire(base)('playwright')); break; } catch (_) {} }
if (!chromium) skip('Playwright non installé');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
const serve = (root) => new Promise((res) => {
  const s = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, path.normalize(u === '/' ? '/index.html' : u));
    if (!f.startsWith(root)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  s.listen(0, '127.0.0.1', () => res(s));
});

const base = { trial: false, name: 'T', region: 'knee', pathology: 'pfps', painBase: 3, irritability: 'med', days: [0, 1, 2, 3, 4, 5, 6], perWeek: 7, phase: 1, baseLevel: 2, levels: {}, startDate: 1_700_000_000_000, joinedAt: 1_700_000_000_000, triage: {}, plan: { phase: 2, ids: ['squat', 'sit_stand', 'wall_sit', 'step_down'] }, lockPhase: false };
const CASES = [
  { role: 'patient', lang: 'fr', routes: ['#/home', '#/library', '#/ex/squat', '#/profile', '#/calendar', '#/progress', '#/history', '#/proms', '#/amplitude', '#/badges', '#/protocole', '#/report', '#/adjust', '#/session', '#/code', '#/onboard'] },
  { role: 'patient', lang: 'en', routes: ['#/home', '#/library', '#/profile'] },
  { role: 'patient', lang: 'ar', routes: ['#/home', '#/library'] },
  { role: 'clinician', lang: 'fr', routes: ['#/clinic', '#/clinic/new', '#/home'] },
];

async function snapshot(browser, origin, c) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', timezoneId: 'America/Montreal', locale: 'fr-CA', reducedMotion: 'reduce' });
  // Temps figé (Date, performance, animations des schémas) et hasard fixe : deux rendus identiques image pour image.
  await ctx.addInitScript(() => { const fixed = 1_763_800_000_000; Date.now = () => fixed; performance.now = () => 1000; Math.random = () => 0.42; });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(origin + '/index.html');
  await p.evaluate(({ pr }) => {
    localStorage.setItem('mobilis.localUser', JSON.stringify({ uid: 'local', local: true, name: '' }));
    localStorage.setItem('mobilis.data.local', JSON.stringify({ profile: pr, sessions: [], journal: [] }));
    localStorage.setItem('mobilis.settings', JSON.stringify({ voice: 'off' }));
  }, { pr: { ...base, role: c.role, lang: c.lang } });
  const out = {};
  for (const r of c.routes) {
    await p.goto(`${origin}/index.html${r}`); await p.reload(); await p.waitForTimeout(600);
    out[r] = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
  }
  await ctx.close();
  return { out, errors };
}

const [sa, sb] = await Promise.all([serve(A), serve(B)]);
const oa = `http://127.0.0.1:${sa.address().port}`; const ob = `http://127.0.0.1:${sb.address().port}`;
let fails = 0;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const c of CASES) {
    const [x, y] = [await snapshot(browser, oa, c), await snapshot(browser, ob, c)];
    for (const r of c.routes) {
      const same = x.out[r] === y.out[r] && x.out[r].length > 0;
      if (!same) fails++;
      console.log(`  ${same ? 'ok ' : 'ÉCHEC'} ${c.role}/${c.lang} ${r} (${x.out[r].length} car.)`);
      if (!same) console.log(`     www : ${x.out[r].slice(0, 200)}\n     dist: ${y.out[r].slice(0, 200)}`);
    }
    if (y.errors.join() !== x.errors.join()) { fails++; console.log(`  ÉCHEC erreurs de page différentes : www=${JSON.stringify(x.errors)} dist=${JSON.stringify(y.errors)}`); }
    else if (y.errors.length) console.log(`  (erreurs identiques des deux côtés : ${y.errors.join(' | ')})`);
  }
} finally { await browser.close(); sa.close(); sb.close(); }
console.log(fails ? `\nParité www/dist : ${fails} ÉCHEC(S)` : '\nParité www/dist : OK');
process.exit(fails ? 1 : 0);
