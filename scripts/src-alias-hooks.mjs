// Crochets de résolution Node : `@src/…` → <racine>/src/… (même alias que Vite/Vitest/tsconfig).
// Les fichiers .ts sont exécutés par Node ≥ 22.18 grâce au retrait natif des types (syntaxe « effaçable » uniquement).
const SRC = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@src/')) return next(new URL(specifier.slice(5), SRC).href, context);
  return next(specifier, context);
}
