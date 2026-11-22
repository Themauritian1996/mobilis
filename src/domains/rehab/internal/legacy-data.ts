/**
 * Données cliniques de v1.15 (www/js/data/*.js, tranche T1 pas encore intégrée) vues à travers des types étroits.
 * Fichier PRIVÉ du domaine : à l'intégration, il est remplacé par les importations de `./data/*.ts` (T1).
 */
import { EQUIP as RAW_EQUIP, EXERCISES as RAW_EXERCISES } from '../../../../www/js/data/exercises.js';
import { EX_ANATOMY as RAW_ANATOMY } from '../../../../www/js/data/anatomy.js';
import { PATHOLOGIES as RAW_PATHOLOGIES } from '../../../../www/js/data/pathologies.js';
import {
  exerciseEntry as rawExerciseEntry,
  protocolById as rawProtocolById,
  protocolPhases as rawProtocolPhases,
} from '../../../../www/js/data/protocols.js';
import { summaryPart as rawPromSummary } from '../../../../www/js/data/proms.js';
import {
  SUBSTITUTES as RAW_SUBSTITUTES,
  moveOf as rawMoveOf,
  subsOf as rawSubsOf,
  targetKg as rawTargetKg,
} from '../../../../www/js/data/substitutes.js';
import type { Localized } from '../../../core/i18n/engine.ts';
import type { Dose, Profile } from '../types.ts';

/** Exercice de la bibliothèque (seuls les champs lus par la logique du domaine). */
export interface ExerciseDef {
  name: Localized<string>;
  region: string;
  equip?: string[] | undefined;
  dose: Dose & { hold: number };
  track?: { planes?: Record<string, { checks?: { cue: string }[] } | undefined> | undefined } | null | undefined;
  keys?: Localized<string>[] | undefined;
  fig?: { view?: string | undefined } | undefined;
}

export interface PathologyDef {
  id: string;
  name: Localized<string>;
  region?: string | undefined;
  painMax?: number | undefined;
  phases: Record<number, string[]>;
}

export interface ProtocolPhaseDef {
  id: string;
  weeks: [number, number | null];
  exercises?: (string | ProtocolExerciseEntry)[] | undefined;
  progressionCriteria?: unknown[] | undefined;
  precautions?: unknown[] | undefined;
  painMax?: number | undefined;
}

export interface ProtocolExerciseEntry {
  id: string;
  level?: number | undefined;
  maxLevel?: number | undefined;
  dose?: { sets?: number | undefined; reps?: number | undefined; hold?: number | undefined } | undefined;
}

export interface ProtocolDef {
  id: string;
  name: Localized<string>;
  painMax?: number | undefined;
}

export interface SubstituteDef {
  equip: string;
  fits: string[];
  kg: number | [number, number];
  [key: string]: unknown;
}

export const EXERCISES = RAW_EXERCISES as unknown as Readonly<Record<string, ExerciseDef>>;
export const EQUIP = RAW_EQUIP as unknown as Readonly<Record<string, unknown>>;
export const EX_ANATOMY = RAW_ANATOMY as unknown as Readonly<Record<string, string[]>>;
export const PATHOLOGIES = RAW_PATHOLOGIES as unknown as readonly PathologyDef[];
export const SUBSTITUTES = RAW_SUBSTITUTES as unknown as readonly SubstituteDef[];

export const protocolById = rawProtocolById as (id: string) => ProtocolDef | null;
export const protocolPhases = rawProtocolPhases as (
  protocol: ProtocolDef,
  variantId?: string | null,
) => ProtocolPhaseDef[];
export const exerciseEntry = rawExerciseEntry as (e: string | ProtocolExerciseEntry) => ProtocolExerciseEntry;
export const promSummary = rawPromSummary as (profile: Profile) => Record<string, unknown>;
export const subsOf = rawSubsOf as (equipId: string) => SubstituteDef[];
export const moveOf = rawMoveOf as (exId: string, equipId: string) => string;
export const targetKg = rawTargetKg as (exId: string, level?: number) => number | null;
