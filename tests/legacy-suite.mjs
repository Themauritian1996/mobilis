// Liste unique des tests unitaires v1.15 (scripts Node autonomes, sortie ≠ 0 = échec).
// Utilisée par l'adaptateur Vitest (tests/legacy.test.ts) et par `npm run test:legacy` (scripts/run-legacy-tests.mjs).
// movematch.test.mjs n'en fait pas partie (diagnostic statistique, absent de `npm test` en v1.15 : comportement conservé).
export const LEGACY_TESTS = [
  'tracker', 'hand', 'thumb', 'figures', 'gemini', 'realism', 'overlay', 'calendar', 'program', 'live', 'partial',
  'ailang', 'placement', 'badges', 'proms', 'rom', 'protocols', 'report', 'equip', 'sharedai', 'longterm', 'maint',
].map((n) => `tests/${n}.test.mjs`);
