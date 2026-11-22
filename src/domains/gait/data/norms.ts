/**
 * Module de données typé : normes de la marche (copie de docs/gait-literature/norms.json, schemaVersion 1).
 * Chaque valeur garde son `ref` (clé de references.json). Aucune valeur n'est ajoutée ici : les fonctions ne font que
 * sélectionner la ligne pertinente (âge, sexe) et convertir les unités (cm → m, cm/s → m/s).
 */
import normsJson from './norms.json';
import referencesJson from './references.json';
import { DEFAULT_GAIT_CONFIG, type GaitConfig } from '../config.ts';
import type { EvidenceStatus, GaitPatientInput, PerryPhaseId } from '../types.ts';

export interface PhaseNorm {
  readonly id: PerryPhaseId;
  readonly name_fr: string;
  readonly name_en: string;
  readonly startPct: number;
  readonly endPct: number;
  readonly support: string;
}

interface RowValue {
  readonly sex?: string;
  readonly ageGroup?: string;
  readonly mean?: number;
  readonly sd?: number | null;
  readonly side?: string;
  readonly [k: string]: unknown;
}

export interface NormBlock {
  readonly id: string;
  readonly metric_fr?: string;
  readonly metric_en?: string;
  readonly unit?: string | null;
  readonly population?: string | null;
  readonly values: readonly RowValue[] | string;
  readonly ref: string | null;
  readonly confidence?: string;
  readonly status?: string;
  readonly notes?: string | null;
}

export interface AccuracyBlock {
  readonly id: string;
  readonly system: string;
  readonly metrics: Readonly<Record<string, number | string>> | null;
  readonly ref: string | null;
  readonly confidence: string;
  readonly status?: string;
  readonly notes?: string;
}

export interface NormsFile {
  readonly schemaVersion: number;
  readonly conventions: Readonly<Record<string, string>>;
  readonly camera2dAccuracy: readonly AccuracyBlock[];
  readonly phases: { readonly ref: string; readonly items: readonly PhaseNorm[] };
  readonly spatiotemporal: readonly NormBlock[];
  readonly sagittalKinematics: { readonly byPhase: readonly unknown[]; readonly withSD: readonly NormBlock[] };
  readonly frontalAndTrunk: readonly NormBlock[];
}

export interface Reference {
  readonly id: string;
  readonly authors?: string;
  readonly year?: number | null;
  readonly title?: string;
  readonly journal?: string;
  readonly doi?: string;
  readonly status: EvidenceStatus;
}

function asNorms(x: unknown): NormsFile {
  const o = x as Partial<NormsFile>;
  if (o.schemaVersion !== 1 || !o.phases || !Array.isArray(o.spatiotemporal))
    throw new Error('norms.json : schéma inattendu');
  return o as NormsFile;
}

export const NORMS: NormsFile = asNorms(normsJson);

/** Références de docs/gait-literature/references.json + références ajoutées pour les déterminants (voir README). */
export const REFERENCES: readonly Reference[] = [
  ...(referencesJson as { references: Reference[] }).references,
  {
    id: 'saunders1953',
    authors: 'Saunders JB, Inman VT, Eberhart HD',
    year: 1953,
    title: 'The major determinants in normal and pathological gait',
    journal: 'J Bone Joint Surg Am 35-A(3):543-558',
    status: 'verified_secondary',
  },
  {
    id: 'kuo2007',
    authors: 'Kuo AD',
    year: 2007,
    title: 'The six determinants of gait and the inverted pendulum analogy: a dynamic walking perspective',
    journal: 'Hum Mov Sci 26(4):617-656',
    doi: '10.1016/j.humov.2007.04.003',
    status: 'verified',
  },
  {
    id: 'dellacroce2001',
    authors: 'Della Croce U, Riley PO, Lelas JL, Kerrigan DC',
    year: 2001,
    title: 'A refined view of the determinants of gait',
    journal: 'Gait Posture 14:79-84',
    status: 'verified',
  },
  {
    id: 'gard1997',
    authors: 'Gard SA, Childress DS',
    year: 1997,
    title: 'The effect of pelvic list on the vertical displacement of the trunk during normal walking',
    journal: 'Gait Posture 5(3):233-238',
    doi: '10.1016/S0966-6362(96)01089-2',
    status: 'verified',
  },
];

export function reference(id: string): Reference | undefined {
  return REFERENCES.find((r) => r.id === id);
}

/** Statut d'une référence (to_verify si inconnue ou nulle). */
export function refStatus(id: string | null): EvidenceStatus {
  if (!id) return 'to_verify';
  return reference(id)?.status ?? 'to_verify';
}

export const PHASES: readonly PhaseNorm[] = NORMS.phases.items;

export function normBlock(id: string): NormBlock | undefined {
  return [...NORMS.spatiotemporal, ...NORMS.sagittalKinematics.withSD, ...NORMS.frontalAndTrunk].find(
    (b) => b.id === id,
  );
}

export function accuracy(id: string): AccuracyBlock | undefined {
  return NORMS.camera2dAccuracy.find((a) => a.id === id);
}

/** Valeur normative sélectionnée. */
export interface NormValue {
  readonly normId: string;
  readonly mean: number;
  readonly sd: number | null;
  readonly unit: string;
  readonly ref: string | null;
  readonly status: EvidenceStatus;
  readonly population: string;
}

function inAgeGroup(age: number, g: string): boolean {
  if (g.endsWith('+')) return age >= Number(g.slice(0, -1));
  const [a, b] = g.split('-').map(Number);
  return a !== undefined && b !== undefined && age >= a && age <= b;
}

/** Moyenne (et ET combinée approximative) des lignes retenues, quand le sexe ou l'âge est inconnu. */
function pool(rows: readonly { mean: number; sd: number | null }[]): { mean: number; sd: number | null } {
  const m = rows.reduce((s, r) => s + r.mean, 0) / rows.length;
  if (rows.some((r) => r.sd === null)) return { mean: m, sd: null };
  // Variance du mélange à poids égaux : moyenne des variances + variance des moyennes.
  const v = rows.reduce((s, r) => s + r.sd! ** 2 + (r.mean - m) ** 2, 0) / rows.length;
  return { mean: m, sd: Math.sqrt(v) };
}

function selectRows(
  block: NormBlock,
  patient: GaitPatientInput,
  pick: (r: RowValue) => { mean: number; sd: number | null } | null,
): { mean: number; sd: number | null; population: string } | null {
  if (typeof block.values === 'string') return null;
  const rows = block.values.filter((r) => {
    if (patient.sex && r.sex && r.sex !== patient.sex && r.sex !== 'all') return false;
    if (
      patient.ageYears !== undefined &&
      r.ageGroup &&
      r.ageGroup !== 'adult' &&
      !inAgeGroup(patient.ageYears, r.ageGroup)
    )
      return false;
    return true;
  });
  const vals = rows.map(pick).filter((v): v is { mean: number; sd: number | null } => v !== null);
  if (!vals.length) return null;
  const p = pool(vals);
  const groups = [...new Set(rows.map((r) => `${r.sex ?? ''} ${r.ageGroup ?? ''}`.trim()))].join(', ');
  return { ...p, population: `${block.population ?? block.id} [${groups}]` };
}

function fromBlock(
  id: string,
  patient: GaitPatientInput,
  unit: string,
  factor: number,
  pick: (r: RowValue) => { mean: number; sd: number | null } | null = (r) =>
    typeof r.mean === 'number' ? { mean: r.mean, sd: r.sd ?? null } : null,
): NormValue | null {
  const b = normBlock(id);
  if (!b) return null;
  const s = selectRows(b, patient, pick);
  if (!s) return null;
  return {
    normId: id,
    mean: s.mean * factor,
    sd: s.sd === null ? null : s.sd * factor,
    unit,
    ref: b.ref,
    status: b.status === 'to_verify' ? 'to_verify' : refStatus(b.ref),
    population: s.population,
  };
}

const hollman = (key: string) => (r: RowValue) => {
  const v = r[key];
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? { mean: v[0] as number, sd: v[1] as number }
    : null;
};

/**
 * Norme applicable à une métrique pour ce patient, ou null s'il n'y en a pas (ex. chute pelvienne : norme vide,
 * `to_verify`). Règles de sélection (choix de conception, à valider — docs/gait-literature/README.md, questions 1 et 7) :
 * vitesse : Bohannon 1997 (avec ET) avant 70 ans, Hollman 2011 de 70 à 79 ans, Bohannon & Andrews 2011 seul (sans ET)
 * de 80 à 99 ans ; pas de normes pédiatriques ; autres paramètres ≥ 70 ans : Hollman 2011 ; cadence et longueur de pas : Oberg 1993 (Hollman 2011 ≥ 70 ans) ;
 * angles : Oberg 1994.
 */
export function normFor(
  metricId: string,
  patient: GaitPatientInput,
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): NormValue | null {
  const age = patient.ageYears;
  if (age !== undefined && age < 18) return null; // pas de normes pédiatriques (hors périmètre)
  const older = age !== undefined && age >= config.olderAdults.hollmanFromAge;
  switch (metricId) {
    case 'gait_speed':
      if (age !== undefined && age >= config.olderAdults.bohannon2011SpeedFromAge)
        return fromBlock('speed_meta_bohannon2011', patient, 'm/s', 1);
      if (older) return fromBlock('older_adults_hollman2011', patient, 'm/s', 0.01, hollman('speed'));
      return patient.speedCondition === 'fast'
        ? fromBlock('speed_max_bohannon1997', patient, 'm/s', 0.01)
        : fromBlock('speed_comfortable_bohannon1997', patient, 'm/s', 0.01);
    case 'cadence':
      return older
        ? fromBlock('older_adults_hollman2011', patient, 'pas/min', 1, hollman('cadence'))
        : fromBlock('cadence_oberg1993', patient, 'pas/min', 1);
    case 'step_length':
      return older ? null : fromBlock('step_length_oberg1993', patient, 'm', 0.01);
    case 'stride_length':
      return older ? fromBlock('older_adults_hollman2011', patient, 'm', 0.01, hollman('strideLength')) : null;
    case 'step_width':
      return older ? fromBlock('older_adults_hollman2011', patient, 'm', 0.01, hollman('stepWidth')) : null;
    case 'stance_pct':
      return older
        ? fromBlock('older_adults_hollman2011', patient, '%', 1, hollman('stance'))
        : fromBlock('stance_swing_general', patient, '%', 1, (r) =>
            typeof r['stance'] === 'number' ? { mean: r['stance'] as number, sd: null } : null,
          );
    case 'double_support_pct':
      return older
        ? fromBlock('older_adults_hollman2011', patient, '%', 1, hollman('doubleSupport'))
        : fromBlock('stance_swing_general', patient, '%', 1, (r) =>
            typeof r['doubleSupportTotal'] === 'number' ? { mean: r['doubleSupportTotal'] as number, sd: null } : null,
          );
    case 'knee_flexion_loading':
      return fromBlock('knee_midstance_oberg1994', patient, '°', 1);
    case 'peak_knee_flexion_swing':
      return fromBlock('knee_swing_max_oberg1994', patient, '°', 1);
    case 'hip_rom':
      return fromBlock('hip_rom_oberg1994', patient, '°', 1);
    default:
      return null;
  }
}
