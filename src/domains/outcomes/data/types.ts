/**
 * Types des données cliniques « outcomes » (questionnaires PROM, protocoles post-op, tests d'amplitude — ADR 0003).
 * Formes reprises telles quelles de la v1.15 : aucune valeur n'est modifiée par la migration.
 */

/** Texte bilingue (français / anglais). */
export interface Bilingual {
  readonly fr: string;
  readonly en: string;
}

export interface BilingualList {
  readonly fr: readonly string[];
  readonly en: readonly string[];
}

// ---------------------------------------------------------------- PROMs

export type InstrumentKind = 'free' | 'licensed' | 'custom';

/** Différence minimale cliniquement importante (indicative). `type: 'level'` : seuil sur la dernière réponse (PGIC). */
export interface Mcid {
  readonly value: number;
  readonly pct?: number;
  readonly type?: 'level';
  readonly note: Bilingual;
}

/** Échelle de réponse : bornes, pas, nombre de choix (licences), extrémités ou libellés de chaque choix. */
export interface ScaleOptions {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly count?: number;
  readonly ends?: readonly Bilingual[] | undefined;
  readonly labels?: readonly Bilingual[] | null | undefined;
}

export interface InstrumentItem {
  readonly id: string;
  /** Texte bilingue ; chaîne seule pour les activités du patient et les questions du clinicien. */
  readonly text: Bilingual | string;
}

/** Définition d'un questionnaire (libre, sous licence — structure seulement — ou personnalisé). */
export interface InstrumentDef {
  readonly id: string;
  readonly kind: InstrumentKind;
  readonly name: Bilingual | string;
  readonly short?: Bilingual | string;
  readonly regions: readonly string[];
  readonly algo: string;
  readonly range: readonly [number, number];
  readonly higherIsBetter: boolean;
  readonly options: ScaleOptions;
  readonly items: readonly InstrumentItem[];
  readonly mcid?: Mcid | null;
  readonly minAnswered?: number;
  readonly noBaseline?: boolean;
  readonly mfq?: boolean;
  readonly stem?: Bilingual;
  readonly dynamicItems?: { readonly min: number; readonly max: number };
  /** NPRS : indices des items par sous-score. */
  readonly sub?: Readonly<Record<string, readonly number[]>>;
  /** Licences : indices des items par sous-échelle. */
  readonly subs?: Readonly<Record<string, readonly number[]>>;
  readonly nItems?: number;
  readonly full?: string;
  readonly holder?: string;
  readonly note?: Bilingual;
  readonly licenseHolderNote?: Bilingual;
  readonly mode?: 'sum' | 'mean' | 'pct';
  readonly available?: boolean;
}

/** Échelle d'un questionnaire personnalisé du clinicien. */
export interface CustomScale {
  readonly min: number;
  readonly max: number;
  readonly labels?: readonly Bilingual[];
}
