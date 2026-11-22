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
