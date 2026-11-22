import { createFeatureFlags, parseFlagList, type FeatureFlags } from '../core/flags.ts';
import type { KeyValueStore } from './ports.ts';

export const FLAGS_STORAGE_KEY = 'mobilis.flags';

/**
 * Drapeaux effectifs = défauts (core) ← surcharges enregistrées (KeyValueStore, JSON) ← paramètre d'URL `?flags=gait`.
 * Toute valeur illisible est ignorée : on retombe sur les défauts (gait désactivé).
 */
export function loadFeatureFlags(store: KeyValueStore, search = ''): FeatureFlags {
  let saved: Record<string, unknown> = {};
  try {
    const raw = store.get(FLAGS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    saved = {};
  }
  const fromUrl = parseFlagList(new URLSearchParams(search).get('flags'));
  return createFeatureFlags({ ...saved, ...fromUrl });
}
