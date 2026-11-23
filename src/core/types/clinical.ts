/**
 * Modèle de données clinique v2 — niveau INTERFACE uniquement (aucune règle, aucune valeur clinique).
 * Chaque document persistant étend `Versioned` : toute évolution de forme exige un nouveau `schemaVersion`
 * et une migration testée (src/core/schema.ts, docs/adr/0004-schema-versionne.md).
 * Aucune vidéo n'est stockée : seules des mesures dérivées le sont (docs/adr/0007-aucune-video.md).
 */
import type { Brand, IsoDate, IsoDateTime, MeasuredValue, Owned, Timestamped, Versioned } from './common.ts';

export type PatientId = Brand<string, 'PatientId'>;
export type AssessmentId = Brand<string, 'AssessmentId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type StudyId = Brand<string, 'StudyId'>;
export type InterventionId = Brand<string, 'InterventionId'>;

export type Side = 'left' | 'right' | 'bilateral' | 'none';

// ---------------------------------------------------------------- Patient
export interface Patient extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: PatientId;
  /** Nom affiché localement ; jamais exporté si l'export est anonymisé. */
  readonly displayName?: string;
  /** Identifiant de recherche (export anonymisé). */
  readonly researchId?: string;
  readonly birthYear?: number;
  readonly sex?: 'female' | 'male' | 'other' | 'unspecified';
  /** Taille saisie (cm) : sert à la calibration des mesures de marche (spec §4.2). */
  readonly heightCm?: number;
  readonly weightKg?: number;
  readonly affectedSide?: Side;
  readonly prosthesis?: ProstheticProfile;
}

/** Profil amputé / prothèse (spec §5) — vocabulaire seulement, sans règle. */
export interface ProstheticProfile {
  readonly level:
    'transtibial' | 'transfemoral' | 'knee_disarticulation' | 'hip_disarticulation' | 'syme' | 'chopart' | 'other';
  readonly side: Side;
  readonly etiology?: string;
  readonly amputationDate?: IsoDate;
  readonly footType?: string;
  readonly kneeType?: string;
  readonly socket?: string;
  readonly suspension?: string;
  readonly assistiveDevice?: string;
}

// ---------------------------------------------------------------- Évaluation
export type AssessmentKind = 'gait' | 'rom' | 'prom' | 'prosthetic_gait' | 'custom';
export type GaitView = 'lateral_left' | 'lateral_right' | 'frontal' | 'posterior';

export interface MetricResult extends MeasuredValue {
  /** Identifiant stable de la métrique (catalogue de données versionné). */
  readonly metricId: string;
  readonly side?: Side;
  readonly view?: GaitView;
  /** Écart à la norme (z-score ou %), si une norme sourcée existe. */
  readonly deviation?: number;
  readonly normId?: string;
  readonly warning?: string;
}

export interface FindingResult {
  readonly findingId: string;
  readonly confidence: number;
  /** Explication transparente (« pourquoi ») produite par le moteur de règles. */
  readonly because: readonly string[];
}

export interface Assessment extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: AssessmentId;
  readonly patientId: PatientId;
  readonly kind: AssessmentKind;
  readonly performedAt: IsoDateTime;
  readonly views?: readonly GaitView[];
  /** Conditions de capture (aide technique, chaussures/prothèse, vitesse…). */
  readonly conditions?: Readonly<Record<string, string>>;
  readonly metrics: readonly MetricResult[];
  readonly findings: readonly FindingResult[];
  /** Toujours `false` : aucune vidéo n'est conservée (type littéral = garde-fou à la compilation). */
  readonly videoRetained: false;
  readonly studyId?: StudyId;
  readonly timepointId?: string;
  /** Version du moteur qui a produit le résultat (ex. 'gait-1'). */
  readonly engineVersion?: string;
  /**
   * Résultat complet sérialisé du moteur (ex. GaitAssessment : déterminants, phases, courbes moyennes).
   * Opaque pour le cœur ; typé par le domaine qui l'a produit. Jamais d'images ni de vidéo.
   */
  readonly result?: unknown;
  /** Mesures personnalisées calculées à la capture (MeasureDefinition.id → valeur). */
  readonly customMeasures?: Readonly<Record<string, MeasuredValue>>;
}

// ---------------------------------------------------------------- Plan de traitement
export type PlanActionKind =
  | 'exercise'
  | 'gait_training'
  | 'assistive_device'
  | 'orthosis'
  | 'prosthetic_adjustment'
  | 'referral'
  | 'injection_evaluation'
  | 'other';

export interface PlanAction {
  readonly id: string;
  readonly kind: PlanActionKind;
  readonly label: string;
  /** Référence vers la bibliothèque d'exercices (domaine rehab) quand kind = 'exercise'. */
  readonly exerciseId?: string;
  readonly fromFindingId?: string;
  /** Ajoutée ou modifiée par le clinicien (sinon : suggestion à valider). */
  readonly clinicianEdited: boolean;
}

export interface PlanGoal {
  readonly id: string;
  readonly metricId: string;
  readonly comparator: '>=' | '<=' | '=';
  readonly target: number;
  readonly unit: string;
  readonly dueDate?: IsoDate;
}

export interface Plan extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: PlanId;
  readonly patientId: PatientId;
  /** Version du plan pour ce patient (1, 2, 3…), distincte de la version du schéma. */
  readonly revision: number;
  readonly status: 'draft' | 'active' | 'closed';
  readonly sourceAssessmentIds: readonly AssessmentId[];
  readonly actions: readonly PlanAction[];
  readonly goals: readonly PlanGoal[];
  /** Lien vers le programme d'exercices v1 (`rx`) existant. */
  readonly rxCode?: string;
}

// ---------------------------------------------------------------- Recherche
export type MeasureKind = 'gait_metric_at_phase' | 'gait_curve' | 'rom' | 'prom' | 'pain' | 'custom_angle';

/** Clé normalisée de `Assessment.conditions` portant la condition d'étude (ex. « Sans orthèse »). */
export const STUDY_CONDITION_KEY = 'studyCondition';

export interface MeasureDefinition {
  readonly id: string;
  readonly kind: MeasureKind;
  readonly label: string;
  readonly metricId?: string;
  readonly phase?: string;
  readonly side?: Side;
  /** Mesure personnalisée : 3 repères du squelette (indices MediaPipe) → angle. */
  readonly landmarks?: readonly [number, number, number];
}

export interface Timepoint {
  readonly id: string;
  readonly label: string; // ex. « T0 », « T+2 sem »
  readonly offsetDays: number;
}

export interface Study extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: StudyId;
  readonly name: string;
  readonly templateId?: string;
  readonly measures: readonly MeasureDefinition[];
  readonly timepoints: readonly Timepoint[];
  readonly conditions: readonly string[];
  readonly patientIds: readonly PatientId[];
  readonly anonymizeExports: boolean;
  /** Notes libres du chercheur sur l'étude (stockées avec l'étude, plus en localStorage). */
  readonly notes?: string;
}

export interface Intervention extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: InterventionId;
  readonly patientId: PatientId;
  readonly type: 'botulinum_toxin' | 'prosthetic_adjustment' | 'orthosis' | 'surgery' | 'medication' | 'other';
  readonly date: IsoDate;
  /** Champs libres (site, dose…) : jamais interprétés par l'app. */
  readonly details?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------- Annotations et suivi
export type AnnotationId = Brand<string, 'AnnotationId'>;
export type FollowUpId = Brand<string, 'FollowUpId'>;

/** Note libre attachée à une évaluation ou à une comparaison A/B (dossier patient). */
export interface Annotation extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: AnnotationId;
  readonly patientId: PatientId;
  readonly assessmentIds: readonly AssessmentId[];
  readonly authorRole: 'patient' | 'clinician';
  readonly text: string;
}

/**
 * Suivi après une intervention (spec §10.8) : mesures à refaire à des moments définis,
 * réglé par le clinicien ou par le patient.
 */
export interface FollowUp extends Versioned, Timestamped, Owned {
  readonly schemaVersion: 1;
  readonly id: FollowUpId;
  readonly patientId: PatientId;
  readonly interventionId?: InterventionId;
  readonly studyId?: StudyId;
  readonly setBy: 'patient' | 'clinician';
  readonly anchorDate: IsoDate;
  readonly measures: readonly MeasureDefinition[];
  readonly timepoints: readonly Timepoint[];
  /** Mesures déjà faites : timepointId → évaluations enregistrées. */
  readonly done: Readonly<Record<string, readonly AssessmentId[]>>;
}

/** Collections persistées (Firestore + local). */
export interface CollectionMap {
  patients: Patient;
  assessments: Assessment;
  plans: Plan;
  studies: Study;
  interventions: Intervention;
  annotations: Annotation;
  followups: FollowUp;
}
export type CollectionName = keyof CollectionMap;
