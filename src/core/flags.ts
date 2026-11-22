/**
 * Drapeaux de fonctionnalité (docs/adr/0006-drapeaux.md). Pur : la lecture des surcharges (localStorage, URL) est
 * faite par src/platform et passée ici. `gait` couvre la marche, les amputés/prothèses, les plans issus de la marche
 * et la recherche ; il est DÉSACTIVÉ par défaut tant que la voie réglementaire n'est pas choisie (spec §2).
 */
export const DEFAULT_FLAGS = {
  gait: false,
} as const satisfies Record<string, boolean>;

export type FlagName = keyof typeof DEFAULT_FLAGS;
export type FlagState = Readonly<Record<FlagName, boolean>>;

export interface FeatureFlags {
  isEnabled(flag: FlagName): boolean;
  snapshot(): FlagState;
}

export const isFlagName = (s: string): s is FlagName => Object.hasOwn(DEFAULT_FLAGS, s);

/** Combine les valeurs par défaut et des surcharges partielles ; les noms inconnus sont ignorés. */
export function createFeatureFlags(overrides: Readonly<Record<string, unknown>> = {}): FeatureFlags {
  const state: Record<FlagName, boolean> = { ...DEFAULT_FLAGS };
  for (const [k, v] of Object.entries(overrides)) if (isFlagName(k) && typeof v === 'boolean') state[k] = v;
  const frozen: FlagState = Object.freeze({ ...state });
  return { isEnabled: (flag) => frozen[flag], snapshot: () => frozen };
}

/** Lit une liste « gait,-autre » (paramètre d'URL `?flags=`) → surcharges. */
export function parseFlagList(list: string | null | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const raw of (list ?? '').split(',')) {
    const s = raw.trim();
    if (!s) continue;
    if (s.startsWith('-')) out[s.slice(1)] = false;
    else out[s] = true;
  }
  return out;
}
