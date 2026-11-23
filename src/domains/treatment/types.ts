/**
 * Types du volet « traitement » (spec v2 §6). Les types du cœur (`PlanAction`, `PlanGoal`, `Plan`) restent la forme
 * persistée ; les types ci-dessous les ÉTENDENT (sous-types structurels) avec ce que la spec exige en plus : défaut
 * source, déterminant à restaurer, références, validation par le clinicien. Aucune action n'est active sans validation.
 */
import type { Plan, PlanAction, PlanGoal } from '../../core/types/clinical.ts';
import type { DeterminantId } from '../gait/determinant-ids.ts';
import type { Side } from '../gait/types.ts';

export type { DeterminantId, Side };

/** Texte bilingue court (fr obligatoire). */
export interface Bilingual {
  readonly fr: string;
  readonly en: string;
}

/** Avis de sécurité clinique obligatoire sur toute suggestion (brief des volets v2). */
export const SUGGESTION_NOTICE = 'Suggestion fondée sur la littérature — à valider par le clinicien';
export const BANNER = 'Outil d’évaluation clinique — non homologué Santé Canada';

/** Qui voit l'action : le patient (exercices, aides techniques seulement, spec §10.8) ou le clinicien seul. */
export type ActionAudience = 'patient' | 'clinician';

export type SuggestionPriority = 'high' | 'medium' | 'low';

/** Identifiant d'aide technique (même vocabulaire que le moteur de marche). */
export type DeviceKind = 'cane' | 'axillary_crutches' | 'forearm_crutches' | 'walker' | 'rollator';

export interface TreatmentAction extends PlanAction {
  /** Faux = suggestion non validée (jamais active) ; vrai = acceptée ou saisie par le clinicien. */
  readonly validated: boolean;
  readonly audience: ActionAudience;
  /** Origine : suggérée par `proposePlan` ou ajoutée à la main. */
  readonly origin: 'suggested' | 'manual';
  readonly side?: Side;
  /** Déterminant de la marche (Saunders 1953) que l'action vise à restaurer. */
  readonly determinantId?: DeterminantId;
  readonly rationale?: string;
  /** Identifiants de `references.json` (gait/data/references.json). */
  readonly refs: readonly string[];
  readonly priority?: SuggestionPriority;
  /** Cote de confiance du défaut source (0–1). */
  readonly confidence?: number;
  readonly sourceAssessmentId?: string;
  readonly deviceKind?: DeviceKind;
  /** Précisions libres du clinicien (dose, réglage, destinataire de la référence…). */
  readonly detail?: string;
  readonly durationWeeks?: number;
  /** Exercice proposé mais sans équivalent dans la bibliothèque : à créer ou à remplacer par le clinicien. */
  readonly libraryGap?: boolean;
  /** Condition de pertinence (ex. « seulement si composante spastique »). */
  readonly condition?: string;
  /** Seuil(s) du défaut source non publié(s) (à trancher par le clinicien). */
  readonly unvalidatedThreshold?: boolean;
}

export type GoalThresholdType = 'published' | 'norm_relative' | 'proposed_heuristic' | 'to_verify';

export interface TreatmentGoal extends PlanGoal {
  readonly label: string;
  readonly side?: Side;
  readonly determinantId?: DeterminantId;
  readonly fromFindingId?: string;
  readonly refs: readonly string[];
  readonly thresholdType: GoalThresholdType;
  readonly validated: boolean;
  readonly note?: string;
}

export type PlanStatus = Plan['status'];

/** Plan stocké + champs du volet (durée, notes). Reste compatible avec `Plan`. */
export interface TreatmentPlan extends Plan {
  readonly actions: readonly TreatmentAction[];
  readonly goals: readonly TreatmentGoal[];
  readonly durationWeeks?: number;
  readonly notes?: string;
  /** Date de début (ISO) : les évaluations antérieures ne comptent pas dans le suivi des objectifs. */
  readonly startedAt?: string;
}

// ------------------------------------------------------------------ Entrées minimales de proposePlan (structurelles)

export type FindingStatusLike = 'probable' | 'possible' | 'absent' | 'insufficient_data' | 'observe';
export type HealthStatusLike = 'affected' | 'preserved' | 'uncertain';

export interface PlanFinding {
  readonly id: string;
  readonly kind: 'gait' | 'prosthetic';
  readonly name_fr: string;
  readonly side: Side;
  readonly status: FindingStatusLike;
  readonly score: number;
  readonly determinants: readonly DeterminantId[];
  readonly references: readonly string[];
  readonly unvalidatedThresholds: readonly { readonly criterion: string; readonly type: string }[];
}

export interface PlanDeterminant {
  readonly id: DeterminantId;
  readonly status: HealthStatusLike;
  readonly linkedFindings: readonly { readonly id: string; readonly side: Side; readonly status: string }[];
}

export interface PlanMetric {
  readonly id: string;
  readonly side?: Side;
  readonly value: number | null;
  readonly unit: string;
  readonly confidence: number;
  readonly estimate: boolean;
  readonly norm?: {
    readonly mean: number;
    readonly sd: number | null;
    readonly normId: string;
    readonly ref: string | null;
  };
}

/** Évaluation de marche réduite à ce dont le plan a besoin (voir `planSourceOf`). */
export interface PlanSource {
  readonly id: string;
  readonly performedAt: string;
  readonly kind: 'gait' | 'prosthetic_gait' | 'other';
  readonly findings: readonly PlanFinding[];
  readonly determinants: readonly PlanDeterminant[];
  readonly metrics: readonly PlanMetric[];
}

/** Exercice de la bibliothèque, réduit à ce que le plan utilise (nom, région, matériel). */
export interface ExerciseInfo {
  readonly name: Bilingual;
  readonly region: string;
  readonly equip: readonly string[];
}
export type ExerciseCatalogue = Readonly<Record<string, ExerciseInfo>>;

export type EvidenceLevelLike = string | null;

/** Lien défaut/déterminant → exercice de la bibliothèque. */
export interface ExerciseLink {
  /** Identifiant dans la bibliothèque, ou `null` quand aucun exercice existant ne convient (lacune à signaler). */
  readonly exerciseId: string | null;
  /** Libellé quand `exerciseId` est null. */
  readonly gapLabel?: Bilingual;
  /** Énoncé de prise en charge de la littérature dont l'exercice découle (findings.json > management). */
  readonly managementText: string;
  readonly determinants: readonly DeterminantId[];
  /** Quel côté : membre atteint (défaut) ou les deux. */
  readonly side?: 'affected' | 'both';
}

export interface DeviceSuggestion {
  readonly label: string;
  readonly kinds: readonly DeviceKind[];
  /** Controlatéral au membre atteint (canne) ou bilatéral. */
  readonly holdSide: 'contralateral' | 'bilateral' | 'either';
  readonly refs: readonly string[];
  readonly condition?: string;
}

export interface TextSuggestion {
  readonly label: string;
  readonly refs: readonly string[];
  readonly condition?: string;
  readonly audienceNote?: string;
}

/** Plan d'action d'un défaut (donnée sourcée : voir data/plan-map.ts). */
export interface FindingPlanEntry {
  readonly findingId: string;
  readonly exercises: readonly ExerciseLink[];
  readonly gaitTraining?: TextSuggestion;
  readonly device?: DeviceSuggestion;
  readonly orthosis?: readonly TextSuggestion[];
  readonly referral?: readonly TextSuggestion[];
  readonly injection?: TextSuggestion;
  /** Ajustement d'emboîture / d'alignement (défauts prothétiques) : texte ajouté aux suggestions du prothésiste. */
  readonly prosthetic?: readonly TextSuggestion[];
}

export interface DeterminantPlanEntry {
  readonly determinantId: DeterminantId;
  readonly exercises: readonly { readonly exerciseId: string; readonly why: string }[];
  readonly refs: readonly string[];
}

export interface FindingInfo {
  readonly id: string;
  readonly kind: 'gait' | 'prosthetic';
  readonly name_fr: string;
  readonly refs: readonly string[];
  readonly evidenceLevel: EvidenceLevelLike;
}

/** Valeur fixe, ou borne de la norme de la métrique (moyenne ± 2 ET) avec repli facultatif (sinon : pas d'objectif). */
export type GoalTarget = number | { readonly fromNorm: 'lower' | 'upper' | 'mean'; readonly fallback?: number };

export interface GoalTemplate {
  readonly id: string;
  readonly findingIds: readonly string[];
  readonly metricId: string;
  /** Côté de la mesure : celui du défaut, ou le côté opposé (ex. vaulting : talon controlatéral). */
  readonly side: 'self' | 'other';
  readonly comparator: PlanGoal['comparator'];
  readonly target: GoalTarget;
  readonly unit: string;
  readonly label: string;
  readonly determinantId?: DeterminantId;
  readonly refs: readonly string[];
  readonly thresholdType: GoalThresholdType;
  readonly note?: string;
}

/** Catalogues nécessaires à `proposePlan` (injectés : le test peut fournir les siens). */
export interface TreatmentCatalogues {
  readonly findings: Readonly<Record<string, FindingInfo>>;
  readonly plan: Readonly<Record<string, FindingPlanEntry>>;
  readonly determinantPlan: Readonly<Partial<Record<DeterminantId, DeterminantPlanEntry>>>;
  readonly determinantNames: Readonly<Record<DeterminantId, string>>;
  readonly goals: readonly GoalTemplate[];
  /** Défauts prothétiques : suggestions du prothésiste et aide technique, tirées de prosthetic-findings.json. */
  readonly prosthetic: Readonly<
    Record<
      string,
      {
        readonly suggestionsProsthetist: readonly string[];
        readonly assistiveDevice: string | null;
        readonly refs: readonly string[];
      }
    >
  >;
}

export interface PlanProposal {
  readonly actions: readonly TreatmentAction[];
  readonly goals: readonly TreatmentGoal[];
  readonly sourceAssessmentIds: readonly string[];
  /** Défauts retenus (probables, possibles ou à observer) dont aucune action n'a pu être tirée du catalogue. */
  readonly unmapped: readonly string[];
  readonly notice: string;
}

export interface ProposeOptions {
  readonly patientId?: string;
  /** Statuts de défaut retenus (défaut : probable, possible, observe). */
  readonly statuses?: readonly FindingStatusLike[];
  readonly idPrefix?: string;
}
