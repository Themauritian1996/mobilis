/**
 * Types communs partagés par tous les domaines. Aucune logique clinique ici : uniquement des formes de données.
 */

/** Identifiant opaque « marqué » : empêche de passer un PatientId là où un StudyId est attendu. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Date/heure ISO 8601 (ex. « 2026-11-22T14:05:00.000Z »). */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;
/** Date ISO 8601 sans heure (ex. « 2026-11-22 »). */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Tout document persistant porte la version de son schéma (voir docs/adr/0004-schema-versionne.md). */
export interface Versioned {
  readonly schemaVersion: number;
}

export interface Timestamped {
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

/** Propriétaire Firebase/Auth du document (règles Firestore : propriétaire seulement). */
export interface Owned {
  readonly ownerUid: string;
}

/** Langues prises en charge par l'interface (même mécanisme qu'en v1.15). */
export type LangCode = 'fr' | 'en' | 'es' | 'pt' | 'ar' | 'zh';

/**
 * Référence bibliographique obligatoire pour toute valeur clinique (norme, règle, conseil).
 * Une valeur sans source retrouvée porte `reference: null` et `status: 'to_verify'` (spec §2).
 */
export interface Reference {
  readonly authors: string;
  readonly year: number;
  readonly title: string;
  readonly source?: string; // revue, livre, éditeur
  readonly doi?: string;
  readonly url?: string;
  readonly pages?: string;
}

export type EvidenceStatus = 'verified' | 'to_verify';

export interface Sourced {
  readonly reference: Reference | null;
  readonly status: EvidenceStatus;
}

/** Valeur mesurée avec unité et cote de confiance 0–1. */
export interface MeasuredValue {
  readonly value: number;
  readonly unit: string;
  readonly confidence: number;
}
