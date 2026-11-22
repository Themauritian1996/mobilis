/** Adaptateur stockage Firebase — voir services/auth/firebase/index.ts (même règle d'isolement de Firebase). */
import { NotImplementedError } from '../../../core/errors.ts';
import type { StoragePort } from '../port.ts';

export function createFirebaseStorage(): StoragePort {
  throw new NotImplementedError('services/storage/firebase');
}
