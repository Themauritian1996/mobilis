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

/**
 * Valeurs de configuration de v1.15 (www/js/config.js), sans les URL de fichiers de l'app (modèles, MediaPipe) : celles-ci
 * dépendent de l'emplacement du module et sont calculées par src/platform/assets.ts. Aucun secret : les clés Firebase web
 * sont publiques par conception (la sécurité vient des règles Firestore) ; la clé Gemini est saisie par l'utilisateur
 * ou fournie par le relais.
 */
export interface LegacyConfigValues {
  readonly appName: string;
  readonly firebase: {
    readonly apiKey: string;
    readonly authDomain: string;
    readonly projectId: string;
    readonly appId: string;
  };
  readonly siteUrl: string;
  /** Vide = pas de serveur (GitHub Pages) : le coach utilise la clé Gemini entrée dans Profil. */
  readonly coachEndpoint: string;
  readonly geminiModel: string;
  /** Modèles rapides (analyse par répétition, résumé de série), essayés dans l'ordre. */
  readonly geminiFastModels: readonly string[];
  readonly geminiTtsModels: readonly string[];
  /** Coach IA en direct (API Live), essayés dans l'ordre. */
  readonly geminiLiveModels: readonly string[];
  readonly poseModelRemote: string;
  readonly handModelRemote: string;
}

export const LEGACY_CONFIG_VALUES: LegacyConfigValues = {
  appName: 'Mobilis',
  firebase: {
    apiKey: 'AIzaSyBRkSq7rvZyhTbBB858u3quzDdg_R_k81g',
    authDomain: 'mobilis-6828b.firebaseapp.com',
    projectId: 'mobilis-6828b',
    appId: '1:661952244751:web:570268f53abdb0c8d6477a',
  },
  siteUrl: 'https://themauritian1996.github.io/mobilis',
  coachEndpoint: '',
  geminiModel: 'gemini-flash-latest',
  geminiFastModels: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'],
  geminiTtsModels: ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'],
  geminiLiveModels: [
    'gemini-3.8-live',
    'gemini-3.1-flash-live-preview',
    'gemini-2.5-flash-native-audio-preview-12-2025',
  ],
  poseModelRemote:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  handModelRemote:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
};

/** Firebase est activé quand une clé et un identifiant de projet sont présents. */
export const isFirebaseEnabled = (c: Pick<LegacyConfigValues, 'firebase'>): boolean =>
  !!(c.firebase.apiKey && c.firebase.projectId);

/** Dans l'APK (Capacitor), le site n'est pas servi par le serveur : on appelle le site en ligne. */
export const resolveCoachUrl = (c: Pick<LegacyConfigValues, 'coachEndpoint' | 'siteUrl'>, native: boolean): string =>
  native && c.coachEndpoint && c.coachEndpoint.startsWith('/') ? c.siteUrl + c.coachEndpoint : c.coachEndpoint;
