/**
 * Accès unique aux dossiers cliniques v2 (patients, évaluations, plans, études, interventions,
 * annotations, suivis). Les volets (marche, prothèses, traitement, recherche) passent TOUJOURS par
 * `getRecordsDb()` — jamais par Firestore directement.
 *
 * Par défaut : base en mémoire (tests). Le volet « dossier patient » installe au démarrage
 * l'implémentation persistante (locale + synchronisation Firestore) avec `setRecordsDb()`.
 */
import type { DatabasePort } from './port.ts';
import { createMemoryDatabase } from './memory/index.ts';

let current: DatabasePort = createMemoryDatabase();

export function getRecordsDb(): DatabasePort {
  return current;
}

export function setRecordsDb(db: DatabasePort): void {
  current = db;
}
