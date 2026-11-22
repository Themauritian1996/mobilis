/**
 * Port IA (Gemini direct avec la clé de l'utilisateur, ou relais : docs/ai-proxy.md). L'IA ne sert qu'à reformuler ou
 * expliquer ; elle ne produit jamais de résultat clinique (spec §4.5). Les images exigent le consentement existant.
 */
export interface AiImage {
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly base64: string;
}

export interface AiRequest {
  readonly prompt: string;
  readonly system?: string;
  readonly lang: string;
  readonly images?: readonly AiImage[];
  /** Doit être `true` si `images` est fourni (consentement image de l'utilisateur). */
  readonly imageConsent?: boolean;
  readonly json?: boolean;
  readonly signal?: AbortSignal;
}

export interface AiResponse {
  readonly text: string;
  readonly model: string;
}

export interface AiPort {
  available(): boolean;
  generate(req: AiRequest): Promise<AiResponse>;
}
