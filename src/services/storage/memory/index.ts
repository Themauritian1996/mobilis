import { AppError } from '../../../core/errors.ts';
import { isForbiddenMime, type StoragePort, type StoredFile } from '../port.ts';

export function createMemoryStorage(): StoragePort {
  const files = new Map<string, { blob: Blob; meta: StoredFile }>();
  return {
    async put(path, data, mime) {
      if (isForbiddenMime(mime)) throw new AppError('video_forbidden', 'Aucune vidéo ne peut être stockée');
      const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
      const meta: StoredFile = { path, mime, size: blob.size };
      files.set(path, { blob, meta });
      return meta;
    },
    async get(path) {
      return files.get(path)?.blob ?? null;
    },
    async remove(path) {
      files.delete(path);
    },
    async list(prefix) {
      return [...files.values()].filter((f) => f.meta.path.startsWith(prefix)).map((f) => f.meta);
    },
  };
}
