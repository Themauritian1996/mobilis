// Cache hors ligne : réseau d'abord, cache en secours (l'app reste utilisable sans réseau).
const CACHE = 'mobilis-v17';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/i18n.js', 'js/config.js', 'js/figure.js', 'js/pose.js', 'js/coach.js',
  'js/program.js', 'js/store.js', 'js/state.js', 'js/ui.js', 'js/onboarding.js', 'js/train.js', 'js/calendar.js', 'js/clinic.js',
  'js/data/exercises.js', 'js/data/pathologies.js', 'js/data/triage.js', 'js/data/anatomy.js', 'js/live.js', 'js/ai-coach.js', 'js/session.js', 'js/movematch.js', 'js/equip.js', 'js/equipui.js', 'js/data/substitutes.js', 'js/hand.js', 'js/overlay.js', 'js/audio.js', 'js/placement.js', 'js/lang/es.js', 'js/lang/pt.js', 'js/lang/ar.js', 'js/lang/zh.js', 'js/questionnaires.js', 'js/data/proms.js', 'js/rom.js', 'js/data/romtests.js', 'js/protocols-ui.js', 'js/data/protocols.js', 'js/badges.js', 'js/report.js', 'js/reportpdf.js', 'vendor/jspdf.umd.min.js',
  'css/questionnaires.css', 'css/rom.css', 'css/protocols.css', 'css/badges.css', 'css/report.css', 'css/equip.css', 'icon.svg', 'manifest.webmanifest', 'fonts/manrope-latin.woff2', 'fonts/manrope-latin-ext.woff2', 'icons/icon-192.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
