/**
 * vision : pose, main, tracker de répétitions, superposition, placement, calibration par la taille.
 * Code actuel : www/js/pose.js, hand.js, overlay.js, placement.js, movematch.js (tranche « vision », docs/MIGRATION.md).
 * Ici : contrats uniquement. Traitement sur l'appareil ; aucune image n'est conservée.
 */

/** Repère normalisé (0–1) au format MediaPipe Pose (33 points) ou Hand (21 points). */
export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

export interface PoseFrame {
  /** Temps en ms depuis le début de l'enregistrement. */
  readonly t: number;
  readonly landmarks: readonly Landmark[];
  readonly width: number;
  readonly height: number;
}

/** Échelle estimée (spec §4.2) : mètres par pixel + cote de confiance 0–1. */
export interface Calibration {
  readonly metersPerPixel: number;
  readonly confidence: number;
  readonly method: 'body_height' | 'segment_lengths' | 'scale_object';
}

export interface PoseSource {
  start(onFrame: (f: PoseFrame) => void): Promise<void>;
  stop(): void;
}

/** Indices MediaPipe Pose utilisés par la marche (vocabulaire, sans logique). */
export const POSE = Object.freeze({
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const);
