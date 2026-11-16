// Usage hors ligne (web / PWA) : télécharge les gros fichiers de la caméra (modèles de pose et de main, MediaPipe) une fois,
// le service worker (sw.js, cache d'abord) les garde ensuite. Dans l'APK tout est déjà inclus.
const rel = (p) => new URL(`../${p}`, import.meta.url).href;
export const OFFLINE_FILES = ['vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'models/pose_landmarker_lite.task', 'models/hand_landmarker.task', 'vendor/qrcode.js'].map(rel);
const isNative = () => !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
const hasSW = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined';

/** { native, supported, cached, total } : `native` → rien à faire (fichiers inclus) ; `supported` false → pas de service worker (http / navigateur sans SW). */
export async function offlineStatus() {
  if (isNative()) return { native: true, supported: true, cached: OFFLINE_FILES.length, total: OFFLINE_FILES.length, ready: true };
  if (!hasSW()) return { native: false, supported: false, cached: 0, total: OFFLINE_FILES.length, ready: false };
  let cached = 0;
  for (const u of OFFLINE_FILES) { try { if (await caches.match(u)) cached++; } catch (_) {} }
  return { native: false, supported: true, cached, total: OFFLINE_FILES.length, ready: cached === OFFLINE_FILES.length };
}

/** Télécharge (via le service worker, qui les met en cache) les fichiers manquants. `onProgress({ done, total })`. Retourne l'état final. */
export async function cacheModelsForOffline(onProgress) {
  if (isNative() || !hasSW()) return offlineStatus();
  if (!navigator.serviceWorker.controller) { try { await navigator.serviceWorker.ready; } catch (_) {} }
  let done = 0; const total = OFFLINE_FILES.length;
  for (const u of OFFLINE_FILES) {
    try {
      if (!(await caches.match(u))) { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); await r.arrayBuffer(); }
    } catch (e) { console.warn('offline', u, e); }
    done++; try { onProgress && onProgress({ done, total }); } catch (_) {}
  }
  return offlineStatus();
}
