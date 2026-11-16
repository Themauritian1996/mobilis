// Cache hors ligne : coquille de l'app réseau d'abord (délai ≈ 3 s, puis cache : réseau lent = app quand même utilisable) ;
// fichiers lourds (modèles de pose / main, MediaPipe, firebase, qrcode) cache d'abord : téléchargés une seule fois, puis disponibles hors ligne.
const CACHE = 'mobilis-v20';
const NET_TIMEOUT = 3000;
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/i18n.js', 'js/config.js', 'js/figure.js', 'js/pose.js', 'js/coach.js',
  'js/program.js', 'js/store.js', 'js/longterm.js', 'js/state.js', 'js/ui.js', 'js/onboarding.js', 'js/train.js', 'js/calendar.js', 'js/clinic.js',
  'js/data/exercises.js', 'js/data/pathologies.js', 'js/data/triage.js', 'js/data/anatomy.js', 'js/live.js', 'js/ai-coach.js', 'js/session.js', 'js/movematch.js', 'js/equip.js', 'js/equipui.js', 'js/data/substitutes.js', 'js/hand.js', 'js/overlay.js', 'js/audio.js', 'js/placement.js', 'js/offline.js', 'js/history.js', 'js/lang/es.js', 'js/lang/pt.js', 'js/lang/ar.js', 'js/lang/zh.js', 'js/questionnaires.js', 'js/data/proms.js', 'js/rom.js', 'js/data/romtests.js', 'js/protocols-ui.js', 'js/data/protocols.js', 'js/badges.js', 'js/report.js', 'js/reportpdf.js', 'vendor/jspdf.umd.min.js',
  'vendor/capacitor.js', 'vendor/qrcode.js', 'vendor/mediapipe/vision_bundle.mjs', // petits fichiers : préchargés
  'css/questionnaires.css', 'css/rom.css', 'css/protocols.css', 'css/badges.css', 'css/report.css', 'css/equip.css', 'icon.svg', 'manifest.webmanifest', 'fonts/manrope-latin.woff2', 'fonts/manrope-latin-ext.woff2', 'icons/icon-192.png'];
// Gros fichiers : mis en cache à la première utilisation réussie (ou par js/offline.js), puis servis depuis le cache
const HEAVY = /\/(vendor\/mediapipe\/|models\/|vendor\/firebase|vendor\/qrcode)/;

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

const store = (c, req, r) => { if (r && r.ok && r.status === 200) c.put(req, r.clone()).catch(() => {}); return r; };

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  return store(c, req, await fetch(req));
}

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  const fallback = async () => (await c.match(req)) || (req.mode === 'navigate' ? await c.match('index.html') : undefined);
  const net = fetch(req).then((r) => store(c, req, r));
  const slow = new Promise((res) => setTimeout(() => fallback().then(res, () => res(undefined)), NET_TIMEOUT));
  try {
    const r = await Promise.race([net, slow]);
    return r || await net; // pas de copie en cache : on attend le réseau
  } catch (err) {
    const h = await fallback();
    if (h) return h;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  e.respondWith(HEAVY.test(u.pathname) ? cacheFirst(e.request) : networkFirst(e.request));
});
