/**
 * Types publics du moteur d'analyse de la marche (spec v2 §4, §5, §7). Autonomes : aucune dépendance à l'interface,
 * à la caméra ni au DOM. Les repères suivent la topologie MediaPipe Pose (33 points) ; voir `landmarks.ts`.
 */

/** Repère normalisé (x, y dans [0, 1] relatifs à l'image ; y vers le bas), au format MediaPipe Pose. */
export interface GaitLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  /** Probabilité de visibilité 0–1 (MediaPipe). Absente = considérée visible (1). */
  readonly visibility?: number;
}

/** Repère « monde » MediaPipe (mètres, origine au centre des hanches). Facultatif. */
export interface GaitWorldLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}

/** Une trame de pose (33 repères) horodatée. */
export interface GaitPoseFrame {
  /** Temps en millisecondes depuis le début de l'enregistrement. */
  readonly t: number;
  readonly landmarks: readonly GaitLandmark[];
  readonly worldLandmarks?: readonly GaitWorldLandmark[];
}

/**
 * Vue de capture (spec §4.1). `sagittal-left` = caméra du côté GAUCHE du patient (membre gauche le plus proche).
 * `frontal` = le patient marche vers la caméra ; `posterior` = il s'en éloigne.
 */
export type GaitView = 'sagittal-left' | 'sagittal-right' | 'frontal' | 'posterior';

export type Side = 'L' | 'R';

export type AssistiveDevice =
  | 'none'
  | 'cane'
  | 'quad_cane'
  | 'axillary_crutches'
  | 'forearm_crutches'
  | 'walker'
  | 'rollator'
  | 'other';

export type AmputationLevel =
  | 'transtibial'
  | 'transfemoral'
  | 'knee_disarticulation'
  | 'syme'
  | 'chopart'
  | 'partial_foot'
  | 'hip_disarticulation';

export interface ProsthesisInput {
  readonly level: AmputationLevel;
  readonly side: Side;
}

/** Entrée patient (spec §4.1). La taille est obligatoire : elle sert à la calibration (spec §4.2). */
export interface GaitPatientInput {
  readonly heightCm: number;
  readonly weightKg?: number;
  readonly ageYears?: number;
  readonly sex?: 'M' | 'F';
  readonly affectedSide?: Side | 'both' | 'none';
  readonly assistiveDevice?: AssistiveDevice;
  readonly prosthesis?: ProsthesisInput;
  readonly speedCondition?: 'comfortable' | 'fast';
}

/** Objet d'échelle connu, mesuré par l'utilisateur sur l'image (ex. ruban de 1 m au sol, plan de marche). */
export interface ScaleObject {
  readonly lengthM: number;
  /** Longueur mesurée en coordonnées normalisées (x × largeur, y × hauteur : fournir `imageAspect`). */
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
}

export interface GaitAnalysisOptions {
  /** Fréquence de coupure du filtre passe-bas (Hz). Défaut 6 Hz (Winter 2009). */
  readonly cutoffHz?: number;
  /** Seuil de visibilité sous lequel un repère est considéré manquant. Défaut 0,5. */
  readonly visibilityThreshold?: number;
  /** Trou maximal interpolé (s). Défaut 0,2 s. */
  readonly maxGapS?: number;
  /** Durée de station debout au début de l'enregistrement servant à la calibration (s). Défaut 1 s. */
  readonly standingS?: number;
  /** Rapport largeur/hauteur de l'image (px). Défaut 9/16 (téléphone en portrait). */
  readonly imageAspect?: number;
  readonly scaleObject?: ScaleObject;
}

export interface GaitRecordingInput {
  readonly frames: readonly GaitPoseFrame[];
  readonly view: GaitView;
  readonly patient: GaitPatientInput;
  readonly options?: GaitAnalysisOptions;
}

/** Statut d'une valeur de référence (même vocabulaire que docs/gait-literature). */
export type EvidenceStatus = 'verified' | 'verified_secondary' | 'to_verify';

export type ThresholdType = 'published' | 'norm_relative' | 'proposed_heuristic';

/** Comparaison d'une valeur mesurée à une norme sourcée. */
export interface NormComparison {
  readonly normId: string;
  readonly mean: number;
  readonly sd: number | null;
  readonly unit: string;
  /** z = (valeur − moyenne) / ET, quand l'ET est publié. */
  readonly z: number | null;
  /** Valeur en % de la moyenne normative. */
  readonly pctOfMean: number;
  readonly ref: string | null;
  readonly status: EvidenceStatus;
  readonly population: string;
}

/** Une métrique calculée (spec §4.4) : valeur, unité, confiance, vue source, avertissement. */
export interface GaitMetric {
  readonly id: string;
  readonly side?: Side;
  readonly value: number | null;
  readonly sd?: number;
  readonly unit: string;
  readonly view: GaitView;
  /** Cote de confiance 0–1 (visibilité, plan, stabilité, nombre de cycles). */
  readonly confidence: number;
  /** `true` quand la littérature n'offre aucune validation 2D de cette mesure (à afficher comme « estimation »). */
  readonly estimate: boolean;
  readonly n?: number;
  readonly norm?: NormComparison;
  readonly warning?: string;
}

export type PerryPhaseId = 'IC' | 'LR' | 'MSt' | 'TSt' | 'PSw' | 'ISw' | 'MSw' | 'TSw';

export interface PhaseWindow {
  readonly id: PerryPhaseId;
  /** Début et fin en % du cycle (0–100). */
  readonly startPct: number;
  readonly endPct: number;
}

export interface GaitEvent {
  readonly type: 'IC' | 'TO';
  readonly side: Side;
  /** Indice de trame (dans l'enregistrement d'origine). */
  readonly frame: number;
  readonly t: number;
  readonly confidence: number;
}

/** Un cycle (foulée) d'un membre : contact initial → contact initial suivant. */
export interface GaitCycle {
  readonly side: Side;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly startT: number;
  readonly endT: number;
  /** Décollement des orteils du même membre (trame), s'il est détecté dans le cycle. */
  readonly toFrame: number | null;
  /** Événements controlatéraux dans le cycle (trames), s'ils existent. */
  readonly oppositeToFrame: number | null;
  readonly oppositeIcFrame: number | null;
  readonly phases: readonly PhaseWindow[];
  readonly stancePct: number | null;
  /** Fraction des trames du cycle reconstruites par interpolation. */
  readonly interpolatedFraction: number;
  readonly rejected: boolean;
  readonly rejectReason?: string;
}

/** Courbe moyenne ± ET sur le cycle normalisé (101 points, 0–100 %). */
export interface CycleCurve {
  readonly id: string;
  readonly side: Side;
  readonly unit: string;
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  readonly n: number;
}

export interface QualityReport {
  readonly frameCount: number;
  readonly fps: number;
  readonly usableFraction: number;
  readonly footVisibility: { readonly L: number; readonly R: number };
  readonly interpolatedFraction: number;
  readonly ok: boolean;
  readonly warnings: readonly string[];
}

export interface ScaleEstimate {
  /** Mètres par unité normalisée verticale (y) au début (station debout). */
  readonly metersPerUnit: number;
  /** Mètres par unité normalisée, trame par trame (compense la profondeur). */
  readonly series: readonly number[];
  /** Incertitude relative estimée (ex. 0,05 = ±5 %). */
  readonly relativeUncertainty: number;
  readonly method: 'body_height' | 'segment_lengths' | 'scale_object';
  readonly confidence: number;
  readonly notes: readonly string[];
}

export interface GaitAnalysis {
  readonly view: GaitView;
  readonly patient: GaitPatientInput;
  readonly quality: QualityReport;
  readonly scale: ScaleEstimate;
  readonly walkingDirection: 1 | -1 | 0;
  readonly events: readonly GaitEvent[];
  readonly cycles: readonly GaitCycle[];
  readonly metrics: readonly GaitMetric[];
  readonly curves: readonly CycleCurve[];
  readonly warnings: readonly string[];
}
