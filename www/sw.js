// Cache hors ligne simple : l'app reste utilisable sans réseau (le coach IA revient en ligne).
const CACHE = 'mobilis-v1';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/i18n.js', 'js/config.js', 'js/figure.js', 'js/pose.js', 'js/coach.js',
  'js/program.js', 'js/store.js', 'js/data/exercises.js', 'js/data/pathologies.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
