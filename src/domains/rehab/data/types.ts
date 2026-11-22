/**
 * Types des données cliniques de réadaptation (ADR 0003). Formes reprises telles quelles de la v1.15 :
 * aucune valeur n'est modifiée par la migration.
 */

/** Texte bilingue (français / anglais). Les autres langues passent par le mécanisme i18n (clé = texte français). */
export interface Bilingual {
  readonly fr: string;
  readonly en: string;
}

/** Liste de textes bilingues (même longueur en fr et en). */
export interface BilingualList {
  readonly fr: readonly string[];
  readonly en: readonly string[];
}

export type StructureKind = 'muscle' | 'tendon' | 'nerve' | 'fascia' | 'joint';

/** Structure anatomique affichable sur un schéma : soit un segment du bonhomme (`seg`), soit une articulation (`at`). */
export interface AnatomyStructure {
  readonly kind: StructureKind;
  readonly name: Bilingual;
  /** [articulation de départ, d'arrivée] */
  readonly seg?: readonly [string, string];
  /** Portion du segment [début, fin] (0–1, peut déborder). */
  readonly t?: readonly [number, number];
  /** Décalage perpendiculaire (positif = avant pour un membre qui descend). */
  readonly off?: number;
  /** Épaisseur. */
  readonly w?: number;
  /** Segments supplémentaires [de, vers, décalage]. */
  readonly more?: readonly (readonly [string, string, number])[];
  /** Segment miroir [de, vers, décalage] (vue de face). */
  readonly mirror?: readonly [string, string, number];
  readonly at?: string;
  readonly r?: number;
}

// ---------------------------------------------------------------- Exercices

/** Point important numéroté sur le schéma : articulation `j`, consigne bilingue, décalage [x, y] de l'étiquette. */
export interface ExerciseKey {
  readonly j: string;
  readonly fr: string;
  readonly en: string;
  readonly off: readonly [number, number];
}

export type DoseType = 'reps' | 'hold';

/** Dose de base (niveau 3) ; le moteur de progression l'ajuste. */
export interface Dose {
  readonly type: DoseType;
  readonly sets: number;
  readonly reps: number;
  readonly holdTop?: number;
  readonly hold?: number;
  readonly tempo?: string;
}

/** Paramètres d'une position clé du bonhomme : angles (degrés) par segment, plus quelques indicateurs. */
export type FigureFrame = Readonly<Record<string, number | string | boolean>>;

/** Accessoire ou objet tenu : identifiant seul, ou [identifiant, point d'attache ou position, …]. */
export type FigureItem = string | readonly (string | number | readonly number[])[];

/** Schéma cinétique (voir figure.js) : positions clés, trajectoire, angle affiché. */
export interface ExerciseFigure {
  readonly view: 'side' | 'front' | 'hand' | 'foot' | 'footBack' | 'palm' | 'end';
  readonly ground?: boolean;
  readonly zoom?: number;
  readonly crop?: readonly string[];
  readonly anchor?: { readonly j: string; readonly x: number; readonly y: number };
  readonly frames: readonly FigureFrame[];
  /** Segment dont on dessine la trajectoire. */
  readonly trace?: string | null;
  readonly period?: number;
  /** Angle affiché : trois articulations. */
  readonly arc?: readonly string[];
  readonly held?: readonly FigureItem[];
  readonly props?: readonly FigureItem[];
  readonly mm?: boolean;
}

/** Erreur détectée pendant un exercice -> consigne vocale (`cue`). */
export interface TrackCheck {
  readonly m: string;
  readonly rel?: boolean;
  readonly abs?: boolean;
  readonly max?: number;
  readonly min?: number;
  readonly cue: string;
}

/** Suivi caméra 2D dans un plan (`side` = sagittal, `front` = frontal, `hand` = main). */
export interface TrackPlane {
  readonly metric: string;
  readonly rel?: boolean;
  readonly delta?: number;
  readonly holdTop?: number;
  readonly checks?: readonly TrackCheck[];
  readonly abs?: boolean;
  readonly from?: number;
  readonly to?: number;
  readonly both?: boolean;
  readonly side?: string;
  readonly angular?: boolean;
  readonly absRel?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly minRepSec?: number;
  readonly guard?: TrackCheck;
}

/** Suivi caméra : mode 'reps' (métrique de `from` à `to`) ou 'hold' (temps compté entre min et max). */
export interface ExerciseTrack {
  readonly mode: 'reps' | 'hold';
  readonly kind?: 'hand';
  readonly cam?: Bilingual;
  readonly planes: Readonly<Record<string, TrackPlane>>;
}

export interface Exercise {
  readonly name: Bilingual;
  readonly region: string;
  readonly equip: readonly string[];
  readonly steps: BilingualList;
  readonly keys: readonly ExerciseKey[];
  readonly dose: Dose;
  readonly fig: ExerciseFigure;
  /** null = exercice guidé (minuterie + voix), non mesurable de façon fiable en 2D. */
  readonly track: ExerciseTrack | null;
  readonly caption?: Bilingual;
}

// ---------------------------------------------------------------- Régions, pathologies, triage

export interface Region {
  readonly id: string;
  readonly name: Bilingual;
  readonly icon: string;
}

/** Nom simple (affiché au patient) + mots-clés pour reconnaître un diagnostic écrit librement. */
export interface LayEntry {
  readonly name: Bilingual;
  readonly kw: readonly string[];
}

/**
 * Pathologie MSK. Phases : 1 = semaines 1–2, 2 = semaines 3–6, 3 = semaine 7+ (identifiants d'exercices).
 * `painMax` : douleur acceptable pendant l'exercice (retour à la base en moins de 24 h).
 */
export interface Pathology {
  readonly id: string;
  readonly region: string;
  readonly name: Bilingual;
  readonly painMax: number;
  readonly lay?: LayEntry;
  readonly phases: { readonly 1: readonly string[]; readonly 2: readonly string[]; readonly 3: readonly string[] };
  readonly edu: BilingualList;
  readonly avoid: BilingualList;
}

/** Réponse d'une question de triage : texte et points par pathologie. */
export interface TriageOption {
  readonly t: Bilingual;
  readonly s: Readonly<Record<string, number>>;
}

export interface TriageQuestion {
  readonly q: Bilingual;
  readonly opts: readonly TriageOption[];
}

/** Question de départ : durée du problème, exercices déjà commencés. */
export interface StartOption {
  readonly v: string;
  readonly t: Bilingual;
}

export interface StartQuestion {
  readonly id: string;
  readonly q: Bilingual;
  readonly opts: readonly StartOption[];
  /** Question posée seulement si cette condition est vraie pour les réponses déjà données. */
  readonly when?: (answers: StartAnswers) => unknown;
}

export type StartAnswers = Readonly<Record<string, string | undefined>>;

// ---------------------------------------------------------------- Objets de remplacement du matériel

/** Charge approximative en kg : un nombre, ou [min, max] quand elle se règle. */
export type KgValue = number | readonly [number, number];

/** Objet de maison qui remplace un matériel manquant. `fits` : types de mouvement adaptés ('any' = tous). */
export interface Substitute {
  readonly id: string;
  readonly equip: string;
  readonly name: Bilingual;
  readonly kg: KgValue;
  readonly fits: readonly string[];
  readonly grip: Bilingual;
  readonly safety: Bilingual;
}
