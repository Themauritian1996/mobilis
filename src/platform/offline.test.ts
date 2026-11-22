import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_FILES, cacheModelsForOffline, offlineStatus } from './offline.ts';

afterEach(() => vi.unstubAllGlobals());

describe('usage hors ligne', () => {
  it('liste les fichiers de la caméra (modèles, MediaPipe, QR)', () => {
    expect(OFFLINE_FILES).toHaveLength(6);
    expect(OFFLINE_FILES.some((u) => u.endsWith('/models/pose_landmarker_lite.task'))).toBe(true);
    expect(OFFLINE_FILES.some((u) => u.endsWith('/vendor/qrcode.js'))).toBe(true);
  });

  it('APK : tout est déjà inclus', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    const s = await offlineStatus();
    expect(s).toMatchObject({ native: true, supported: true, ready: true, cached: 6, total: 6 });
    expect((await cacheModelsForOffline()).native).toBe(true);
  });

  it('navigateur sans service worker : non pris en charge', async () => {
    const s = await offlineStatus();
    expect(s).toMatchObject({ native: false, supported: false, ready: false, cached: 0, total: 6 });
  });

  it('compte les fichiers déjà en cache', async () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('caches', { match: async (u: string) => (u.endsWith('.task') ? {} : undefined) });
    const s = await offlineStatus();
    expect(s).toMatchObject({ supported: true, cached: 2, total: 6, ready: false });
  });
});
