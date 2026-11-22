/**
 * Port de stockage de fichiers (exports CSV/JSON/PDF, sauvegardes). Jamais de vidéo (docs/adr/0007-aucune-video.md).
 */
export interface StoredFile {
  readonly path: string;
  readonly mime: string;
  readonly size: number;
}

export interface StoragePort {
  put(path: string, data: Blob | string, mime: string): Promise<StoredFile>;
  get(path: string): Promise<Blob | null>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<StoredFile[]>;
}

/** Garde-fou partagé par tous les adaptateurs : refuse les types vidéo. */
export const isForbiddenMime = (mime: string): boolean => mime.toLowerCase().startsWith('video/');
