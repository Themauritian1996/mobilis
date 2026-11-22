// Exécute les tests v1.15 en série, exactement comme l'ancien `npm test` (arrêt au premier échec).
import { spawnSync } from 'node:child_process';
import { LEGACY_TESTS } from '../tests/legacy-suite.mjs';

for (const f of LEGACY_TESTS) {
  const r = spawnSync(process.execPath, ['--import', './scripts/register-src-alias.mjs', f], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nÉCHEC : ${f}`);
    process.exit(r.status ?? 1);
  }
}
console.log(`\n${LEGACY_TESTS.length} scripts de test v1.15 : OK`);
