/** Détection de l'APK (Capacitor) sans importer Capacitor : le global `Capacitor` n'existe que dans l'APK. */
interface CapacitorGlobal {
  readonly Capacitor?: { readonly isNativePlatform?: () => boolean } | undefined;
}

const isNativeOn = (g: CapacitorGlobal): boolean =>
  !!(g.Capacitor && g.Capacitor.isNativePlatform && g.Capacitor.isNativePlatform());

/** Lecture via `window` (comme config.js, store.js et coach.js de v1.15 : suit un `window` simulé par les tests). */
export const isNativeWindow = (): boolean => isNativeOn(window as unknown as CapacitorGlobal);

/** Lecture via `globalThis` (comme offline.js de v1.15). */
export const isNativeGlobal = (): boolean => isNativeOn(globalThis as unknown as CapacitorGlobal);
