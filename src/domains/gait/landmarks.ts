/** Indices MediaPipe Pose (33 repères) utilisés par le moteur de marche. */
export const LM = Object.freeze({
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

export const LANDMARK_COUNT = 33;

export type Joint = 'shoulder' | 'hip' | 'knee' | 'ankle' | 'heel' | 'toe';

const LEFT: Record<Joint, number> = {
  shoulder: LM.leftShoulder,
  hip: LM.leftHip,
  knee: LM.leftKnee,
  ankle: LM.leftAnkle,
  heel: LM.leftHeel,
  toe: LM.leftFootIndex,
};
const RIGHT: Record<Joint, number> = {
  shoulder: LM.rightShoulder,
  hip: LM.rightHip,
  knee: LM.rightKnee,
  ankle: LM.rightAnkle,
  heel: LM.rightHeel,
  toe: LM.rightFootIndex,
};

/** Indice du repère `joint` du côté `side`. */
export function idx(side: 'L' | 'R', joint: Joint): number {
  return side === 'L' ? LEFT[joint] : RIGHT[joint];
}

/** Repères nécessaires à l'analyse de la marche (bassin, membres inférieurs, épaules). */
export const REQUIRED_LANDMARKS: readonly number[] = [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
