/**
 * Ports « appareil » : ce que le reste de l'app attend du navigateur ou de Capacitor. Les implémentations concrètes
 * (getUserMedia, TTS natif, Filesystem/Share Capacitor) seront déplacées ici depuis www/js (voir docs/MIGRATION.md).
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface CameraPort {
  open(opts: {
    readonly facing: 'user' | 'environment';
    readonly width?: number;
    readonly height?: number;
  }): Promise<MediaStream>;
  close(stream: MediaStream): void;
}

export interface SpeechPort {
  speak(text: string, opts?: { readonly lang?: string; readonly interrupt?: boolean }): Promise<void>;
  stop(): void;
}

export interface SharePort {
  /** Enregistre ou partage un fichier produit localement (CSV, JSON, PDF). Jamais de vidéo. */
  saveFile(name: string, data: Blob | string, mime: string): Promise<void>;
  shareText(text: string, title?: string): Promise<void>;
}

export interface ConnectivityPort {
  online(): boolean;
  onChange(cb: (online: boolean) => void): () => void;
}
