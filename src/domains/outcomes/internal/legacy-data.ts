/**
 * Données et calculs de v1.15 (www/js/data/*.js, www/js/rom.js ; tranches T1 et « vision » pas encore intégrées) vus à
 * travers des types étroits. Fichier PRIVÉ du domaine : à l'intégration, il est remplacé par les importations de
 * `./data/*.ts` et de `rom.ts`.
 */
import { EXERCISES as RAW_EXERCISES } from '../../../../www/js/data/exercises.js';
import { TESTS as RAW_TESTS } from '../../../../www/js/data/romtests.js';
import { protocolById as rawProtocolById } from '../../../../www/js/data/protocols.js';
import { instrumentDef as rawInstrumentDef, trend as rawPromTrend } from '../../../../www/js/data/proms.js';
import { seriesOf as rawRomSeries, trend as rawRomTrend } from '../../../../www/js/rom.js';
import type { Localized } from '../../../core/i18n/engine.ts';

export interface ExerciseName {
  name: Localized<string>;
}
export const EXERCISES = RAW_EXERCISES as unknown as Readonly<Record<string, ExerciseName>>;

/** Test d'amplitude (seuls les champs lus par le rapport). */
export interface RomTestDef {
  name: Localized<string>;
  sided?: boolean | undefined;
  unit?: string | undefined;
  deficit?: boolean | undefined;
  normal?: { lo?: number | undefined; hi?: number | undefined; ref?: number | undefined } | undefined;
}
export const TESTS = RAW_TESTS as unknown as Readonly<Record<string, RomTestDef | undefined>>;

export const protocolById = rawProtocolById as (id: string) => { name: Localized<string> } | null | undefined;

/** Questionnaire (seuls les champs lus par le rapport). */
export interface InstrumentDef {
  name: Localized<string>;
  mcid?: unknown;
  higherIsBetter?: boolean | undefined;
  range?: unknown;
}
export const instrumentDef = rawInstrumentDef as (id: string, custom?: readonly unknown[]) => InstrumentDef | null;

export interface PromTrend {
  n: number;
  baseline: number | null;
  last: number | null;
  delta: number | null;
  improvement: number | null;
  mcidReached: boolean;
  lastTs: number | null;
}
export const promTrend = rawPromTrend as (log: readonly unknown[], id: string, def: InstrumentDef | null) => PromTrend;

export interface RomPoint {
  ts: number;
  deg: number;
}
export const romSeries = rawRomSeries as (log: readonly unknown[], test: string, side: string | null) => RomPoint[];

export interface RomTrend {
  baseline: number | null;
  last: number | null;
  gain: number | null;
  pctNormal: number | null;
  lastTs: number | null;
}
export const romTrend = rawRomTrend as (log: readonly unknown[], test: string, side: string | null) => RomTrend;
