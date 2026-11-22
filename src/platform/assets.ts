/**
 * Configuration d'exécution de l'app (équivalent de www/js/config.js) : valeurs du cœur + URL des fichiers embarqués
 * (MediaPipe, modèles de pose et de main) calculées depuis l'emplacement du module.
 */
import { LEGACY_CONFIG_VALUES, isFirebaseEnabled, resolveCoachUrl, type LegacyConfigValues } from '../core/config.ts';
import { assetUrl } from './asset-url.ts';
import { isNativeWindow } from './native.ts';

export interface AppRuntimeConfig extends LegacyConfigValues {
  /** Inclus dans l'app (fonctionne hors ligne). */
  readonly mediapipeBase: string;
  /** Modèles téléchargés à la compilation. */
  readonly poseModelLocal: string;
  readonly handModelLocal: string;
}

export const CONFIG: AppRuntimeConfig = {
  ...LEGACY_CONFIG_VALUES,
  mediapipeBase: assetUrl('vendor/mediapipe'),
  poseModelLocal: assetUrl('models/pose_landmarker_lite.task'),
  handModelLocal: assetUrl('models/hand_landmarker.task'),
};

export const firebaseEnabled = (): boolean => isFirebaseEnabled(CONFIG);

export const coachUrl = (): string => resolveCoachUrl(CONFIG, isNativeWindow());
