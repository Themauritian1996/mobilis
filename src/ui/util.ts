// Petits utilitaires internes à l'interface (non réexportés par les modules legacy).

/** `x == null` de la v1.15 : vrai pour null et undefined (ESLint impose `===`). */
export const isNil = (x: unknown): x is null | undefined => x === null || x === undefined;

/** Nombre → texte arrondi à `digits` décimales (équivalent de `Math.round(x * 10 ** d) / 10 ** d`). */
export const roundTo = (x: number, digits = 1): number => {
  const k = 10 ** digits;
  return Math.round(x * k) / k;
};

/** Conteneur d'écran : un élément ou une fonction qui le fournit (comme dans les modules v1.15). */
export type Host = HTMLElement | (() => HTMLElement);
export const hostOf = ($app: Host): HTMLElement => (typeof $app === 'function' ? $app() : $app);
