/** Configuration applicative injectée au démarrage (aucun secret : les clés restent côté utilisateur ou relais). */
import type { LangCode } from './types/common.ts';

export interface AppConfig {
  readonly appVersion: string;
  readonly defaultLang: LangCode;
  readonly firebaseEnabled: boolean;
  /** URL du relais IA (docs/ai-proxy.md) ; vide = mode Gemini direct avec la clé de l'utilisateur. */
  readonly aiProxyUrl: string;
}

export const DEFAULT_CONFIG: AppConfig = Object.freeze({
  appVersion: '2.0.0-dev',
  defaultLang: 'fr',
  firebaseEnabled: true,
  aiProxyUrl: '',
});
