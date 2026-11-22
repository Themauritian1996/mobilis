/** Adaptateur Firestore — voir services/auth/firebase/index.ts (même règle d'isolement de Firebase). */
import { NotImplementedError } from '../../../core/errors.ts';
import type { DatabasePort } from '../port.ts';

export function createFirestoreDatabase(): DatabasePort {
  throw new NotImplementedError('services/db/firebase');
}
