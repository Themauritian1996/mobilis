// À charger avec `node --import ./scripts/register-src-alias.mjs …` : permet aux scripts de test v1.15 d'exécuter
// du code legacy qui importe déjà du nouveau code (stratégie strangler, docs/adr/0005-strangler.md).
import { register } from 'node:module';

register('./src-alias-hooks.mjs', import.meta.url);
