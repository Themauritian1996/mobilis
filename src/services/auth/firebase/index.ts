/**
 * Adaptateur Firebase Auth — SEUL endroit (avec les autres services/*\/firebase) autorisé à importer Firebase
 * (règle dependency-cruiser `firebase-only-in-adapters`). Le code actuel vit dans www/js/store.js et sera déplacé ici
 * par la tranche « services » (docs/MIGRATION.md).
 */
import { NotImplementedError } from '../../../core/errors.ts';
import type { AuthPort } from '../port.ts';

export function createFirebaseAuth(): AuthPort {
  throw new NotImplementedError('services/auth/firebase');
}
